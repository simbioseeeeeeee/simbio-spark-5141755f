-- Simbiose Comercial V2: jornada canônica, avaliação, objeções por reunião
-- e separação entre proposta, aceite, pagamento e ganho.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS meeting_event_id text,
  ADD COLUMN IF NOT EXISTS data_reuniao_agendada timestamptz,
  ADD COLUMN IF NOT EXISTS reuniao_url text,
  ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS playbook_version text NOT NULL DEFAULT 'simbiose-sales-v2@2.1.0',
  ADD COLUMN IF NOT EXISTS fit_score integer,
  ADD COLUMN IF NOT EXISTS fit_score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS execution_score integer,
  ADD COLUMN IF NOT EXISTS decisor_confirmado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_perda_detalhe text,
  ADD COLUMN IF NOT EXISTS oferta_comercial text,
  ADD COLUMN IF NOT EXISTS proposta_enviada_em timestamptz,
  ADD COLUMN IF NOT EXISTS aceite_em timestamptz,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'nao_iniciado',
  ADD COLUMN IF NOT EXISTS pagamento_em timestamptz,
  ADD COLUMN IF NOT EXISTS ganho_override_em timestamptz,
  ADD COLUMN IF NOT EXISTS ganho_override_por uuid,
  ADD COLUMN IF NOT EXISTS ganho_override_motivo text,
  ADD COLUMN IF NOT EXISTS pipeline_review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legacy_status_sdr text,
  ADD COLUMN IF NOT EXISTS legacy_estagio_funil text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS no_show_reagenda_tentativas integer NOT NULL DEFAULT 0;

ALTER TABLE public.atividades
  ADD COLUMN IF NOT EXISTS playbook_version text NOT NULL DEFAULT 'simbiose-sales-v2@2.1.0',
  ADD COLUMN IF NOT EXISTS message_key text,
  ADD COLUMN IF NOT EXISTS origem text,
  ADD COLUMN IF NOT EXISTS canal text,
  ADD COLUMN IF NOT EXISTS metadados jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Remove checks legados antes de normalizar valores para o vocabulário V2.
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'leads'
      AND c.contype = 'c'
      AND (
        pg_get_constraintdef(c.oid) ILIKE '%status_sdr%'
        OR pg_get_constraintdef(c.oid) ILIKE '%estagio_funil%'
        OR pg_get_constraintdef(c.oid) ILIKE '%motivo_perda%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

UPDATE public.leads
SET status_sdr = 'Desqualificado'
WHERE status_sdr IN (
  'Desqualificado - Sem Perfil',
  'Desqualificado - Sem Budget',
  'Desqualificado - Sem Interesse'
);
UPDATE public.leads SET status_sdr = 'Em Qualificação' WHERE status_sdr = 'Prospectado';
UPDATE public.leads
SET status_sdr = 'Qualificado',
    estagio_funil = 'Fechado Ganho',
    pipeline_review_required = true,
    legacy_status_sdr = 'Cliente Ativo'
WHERE status_sdr = 'Cliente Ativo';
UPDATE public.leads SET status_sdr = 'Nurturing' WHERE status_sdr = 'Arquivo Morto';

UPDATE public.leads
SET legacy_status_sdr = status_sdr,
    status_sdr = 'Nurturing',
    pipeline_review_required = true
WHERE status_sdr NOT IN (
  'A Contatar', 'Em Qualificação', 'Qualificado', 'Reunião Agendada',
  'Nurturing', 'Desqualificado', 'Opt-out'
);

UPDATE public.leads SET motivo_perda = CASE motivo_perda
  WHEN 'preco' THEN 'investimento'
  WHEN 'timing' THEN 'prioridade_timing'
  WHEN 'concorrencia' THEN 'concorrente'
  WHEN 'sem_budget' THEN 'investimento'
  WHEN 'fora_icp' THEN 'sem_fit'
  WHEN 'sem_resposta' THEN 'outro'
  ELSE motivo_perda
END
WHERE motivo_perda IS NOT NULL;
UPDATE public.leads
SET motivo_perda_detalhe = COALESCE(NULLIF(motivo_perda_detalhe, ''), 'Legado: ' || motivo_perda),
    motivo_perda = 'outro',
    pipeline_review_required = true
WHERE motivo_perda IS NOT NULL
  AND motivo_perda NOT IN (
    'sem_fit', 'prioridade_timing', 'investimento', 'veto_decisor',
    'concorrente', 'desistencia', 'outro'
  );

UPDATE public.leads SET estagio_funil = 'Diagnóstico Realizado' WHERE estagio_funil = 'Reunião Realizada';
UPDATE public.leads SET estagio_funil = 'Em Negociação' WHERE estagio_funil = 'Negociação';
UPDATE public.leads
SET legacy_estagio_funil = estagio_funil,
    estagio_funil = 'Nurturing',
    pipeline_review_required = true
WHERE estagio_funil IS NOT NULL
  AND estagio_funil NOT IN (
    'Reunião Agendada', 'Diagnóstico Realizado', 'Proposta Enviada',
    'Em Negociação', 'Aguardando Aceite', 'Aguardando Pagamento',
    'Fechado Ganho', 'No-show', 'Nurturing', 'Desqualificado', 'Opt-out', 'Fechado Perdido'
  );
UPDATE public.leads
SET status_sdr = 'Reunião Agendada',
    pipeline_review_required = true
WHERE status_sdr = 'Nurturing'
  AND estagio_funil IN (
    'Reunião Agendada', 'Diagnóstico Realizado', 'Proposta Enviada',
    'Em Negociação', 'Aguardando Aceite', 'Aguardando Pagamento'
  );
UPDATE public.leads
SET status_sdr = 'Qualificado',
    pipeline_review_required = true
WHERE status_sdr = 'Nurturing'
  AND estagio_funil = 'Fechado Ganho';
UPDATE public.leads
SET pipeline_review_required = true
WHERE estagio_funil IS NOT NULL
  AND estagio_funil NOT IN ('Fechado Ganho', 'Fechado Perdido', 'Opt-out', 'Desqualificado');
UPDATE public.leads
SET stage_changed_at = COALESCE(stage_changed_at, updated_at, created_at, now())
WHERE estagio_funil IS NOT NULL
  AND stage_changed_at IS NULL;

ALTER TABLE public.leads ALTER COLUMN status_sdr SET DEFAULT 'A Contatar';

ALTER TABLE public.leads
  ADD CONSTRAINT leads_status_sdr_v2_check CHECK (status_sdr IN (
    'A Contatar', 'Em Qualificação', 'Qualificado', 'Reunião Agendada',
    'Nurturing', 'Desqualificado', 'Opt-out'
  )) NOT VALID,
  ADD CONSTRAINT leads_estagio_funil_v2_check CHECK (estagio_funil IS NULL OR estagio_funil IN (
    'Reunião Agendada', 'Diagnóstico Realizado', 'Proposta Enviada',
    'Em Negociação', 'Aguardando Aceite', 'Aguardando Pagamento',
    'Fechado Ganho', 'No-show', 'Nurturing', 'Desqualificado', 'Opt-out', 'Fechado Perdido'
  )) NOT VALID,
  ADD CONSTRAINT leads_motivo_perda_v2_check CHECK (motivo_perda IS NULL OR motivo_perda IN (
    'sem_fit', 'prioridade_timing', 'investimento', 'veto_decisor',
    'concorrente', 'desistencia', 'outro'
  )) NOT VALID,
  ADD CONSTRAINT leads_oferta_comercial_v2_check CHECK (oferta_comercial IS NULL OR oferta_comercial IN (
    'Imersão', 'Demanda', 'Atendimento com IA', 'Operação de Vendas',
    'Operação', 'Operação avançada'
  )) NOT VALID,
  ADD CONSTRAINT leads_payment_status_v2_check CHECK (payment_status IN (
    'nao_iniciado', 'pendente', 'pago', 'vencido', 'cancelado'
  )) NOT VALID,
  ADD CONSTRAINT leads_fit_score_v2_check CHECK (fit_score IS NULL OR fit_score BETWEEN 0 AND 100) NOT VALID,
  ADD CONSTRAINT leads_execution_score_v2_check CHECK (execution_score IS NULL OR execution_score BETWEEN 0 AND 100) NOT VALID;

ALTER TABLE public.leads
  VALIDATE CONSTRAINT leads_status_sdr_v2_check,
  VALIDATE CONSTRAINT leads_estagio_funil_v2_check,
  VALIDATE CONSTRAINT leads_motivo_perda_v2_check,
  VALIDATE CONSTRAINT leads_oferta_comercial_v2_check,
  VALIDATE CONSTRAINT leads_payment_status_v2_check,
  VALIDATE CONSTRAINT leads_fit_score_v2_check,
  VALIDATE CONSTRAINT leads_execution_score_v2_check;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_meeting_event_id
  ON public.leads(meeting_event_id) WHERE meeting_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_commercial_confirmation_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trusted_source text := current_setting('app.commercial_confirmation_source', true);
  payment_transition_allowed boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW.aceite_em IS NOT NULL
        OR NEW.payment_status <> 'nao_iniciado'
        OR NEW.pagamento_em IS NOT NULL)
       AND COALESCE(trusted_source, '') <> 'fechamento_webhook'
       AND COALESCE(auth.role(), '') <> 'service_role' THEN
      RAISE EXCEPTION 'Aceite e pagamento são somente leitura e devem vir do termo/webhook';
    END IF;
    IF NEW.payment_status = 'pago' AND NEW.pagamento_em IS NULL THEN
      RAISE EXCEPTION 'Pagamento pago exige timestamp de confirmação';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.aceite_em IS DISTINCT FROM OLD.aceite_em
      OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
      OR NEW.pagamento_em IS DISTINCT FROM OLD.pagamento_em)
     AND COALESCE(trusted_source, '') <> 'fechamento_webhook'
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Aceite e pagamento são somente leitura e devem vir do termo/webhook';
  END IF;

  IF OLD.aceite_em IS NOT NULL AND NEW.aceite_em IS DISTINCT FROM OLD.aceite_em THEN
    RAISE EXCEPTION 'Aceite confirmado é imutável';
  END IF;
  IF OLD.pagamento_em IS NOT NULL AND NEW.pagamento_em IS DISTINCT FROM OLD.pagamento_em THEN
    RAISE EXCEPTION 'Evidência de pagamento é imutável';
  END IF;

  payment_transition_allowed := CASE OLD.payment_status
    WHEN 'nao_iniciado' THEN NEW.payment_status IN ('nao_iniciado', 'pendente', 'pago', 'vencido', 'cancelado')
    WHEN 'pendente' THEN NEW.payment_status IN ('pendente', 'pago', 'vencido', 'cancelado')
    WHEN 'vencido' THEN NEW.payment_status IN ('vencido', 'pago', 'cancelado')
    WHEN 'pago' THEN NEW.payment_status = 'pago'
    WHEN 'cancelado' THEN NEW.payment_status = 'cancelado'
    ELSE false
  END;
  IF NOT payment_transition_allowed THEN
    RAISE EXCEPTION 'Transição de pagamento não monotônica: % -> %', OLD.payment_status, NEW.payment_status;
  END IF;
  IF NEW.payment_status = 'pago' AND NEW.pagamento_em IS NULL THEN
    RAISE EXCEPTION 'Pagamento pago exige timestamp de confirmação';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_commercial_confirmation_v2 ON public.leads;
CREATE TRIGGER trg_guard_commercial_confirmation_v2
  BEFORE UPDATE OF aceite_em, payment_status, pagamento_em ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_confirmation_v2();
DROP TRIGGER IF EXISTS trg_guard_commercial_confirmation_insert_v2 ON public.leads;
CREATE TRIGGER trg_guard_commercial_confirmation_insert_v2
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_confirmation_v2();

CREATE OR REPLACE FUNCTION public.guard_meeting_evidence_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trusted_source text := current_setting('app.meeting_evidence_source', true);
BEGIN
  IF TG_OP = 'INSERT'
     AND NEW.meeting_event_id IS NULL
     AND NEW.data_reuniao_agendada IS NULL
     AND NEW.reuniao_url IS NULL
     AND NEW.status_sdr IS DISTINCT FROM 'Reunião Agendada'
     AND NEW.estagio_funil IS DISTINCT FROM 'Reunião Agendada' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND COALESCE(trusted_source, '') <> 'calendar_webhook' THEN
    RAISE EXCEPTION 'Agenda é somente leitura e deve vir do Calendar/Meet';
  END IF;
  IF NULLIF(btrim(NEW.meeting_event_id), '') IS NULL
     OR NEW.data_reuniao_agendada IS NULL
     OR NULLIF(btrim(NEW.reuniao_url), '') IS NULL THEN
    RAISE EXCEPTION 'Evidência da reunião exige event_id, data, horário e link';
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.meeting_event_id IS DISTINCT FROM OLD.meeting_event_id
     AND NEW.data_reuniao_agendada IS NOT DISTINCT FROM OLD.data_reuniao_agendada
     AND NEW.reuniao_url IS NOT DISTINCT FROM OLD.reuniao_url THEN
    RAISE EXCEPTION 'Reagendamento deve substituir toda a evidência da reunião atomicamente';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_meeting_evidence_v2 ON public.leads;
CREATE TRIGGER trg_guard_meeting_evidence_v2
  BEFORE UPDATE OF meeting_event_id, data_reuniao_agendada, reuniao_url ON public.leads
  FOR EACH ROW
  WHEN (
    NEW.meeting_event_id IS DISTINCT FROM OLD.meeting_event_id
    OR NEW.data_reuniao_agendada IS DISTINCT FROM OLD.data_reuniao_agendada
    OR NEW.reuniao_url IS DISTINCT FROM OLD.reuniao_url
  )
  EXECUTE FUNCTION public.guard_meeting_evidence_v2();
DROP TRIGGER IF EXISTS trg_guard_meeting_evidence_insert_v2 ON public.leads;
CREATE TRIGGER trg_guard_meeting_evidence_insert_v2
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.guard_meeting_evidence_v2();

CREATE OR REPLACE FUNCTION public.initialize_sales_stage_v2()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estagio_funil IS NOT NULL AND NEW.estagio_funil <> 'Reunião Agendada' THEN
    RAISE EXCEPTION 'Novos leads entram no funil do closer por Reunião Agendada';
  END IF;
  IF COALESCE(NEW.estagio_funil = 'Reunião Agendada', false)
     IS DISTINCT FROM COALESCE(NEW.status_sdr = 'Reunião Agendada', false) THEN
    RAISE EXCEPTION 'Entrada em Reunião Agendada deve sincronizar status SDR e etapa';
  END IF;
  NEW.stage_changed_at := CASE WHEN NEW.estagio_funil IS NULL THEN NULL ELSE now() END;
  NEW.playbook_version := 'simbiose-sales-v2@2.1.0';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_initialize_sales_stage_v2 ON public.leads;
CREATE TRIGGER trg_initialize_sales_stage_v2
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.initialize_sales_stage_v2();

CREATE TABLE IF NOT EXISTS public.sales_stage_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_cnpj text NOT NULL,
  from_stage text,
  to_stage text NOT NULL,
  actor_id uuid,
  actor_name text,
  responsavel text,
  journey_dimension text NOT NULL DEFAULT 'closer',
  activity text NOT NULL DEFAULT 'Mudança de etapa',
  next_step_at timestamptz,
  reason text,
  playbook_version text NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_stage_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read sales stage audit" ON public.sales_stage_audit;
CREATE POLICY "Authenticated read sales stage audit" ON public.sales_stage_audit
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.validate_sales_stage_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed boolean := false;
  trusted_confirmation_source text := current_setting('app.commercial_confirmation_source', true);
BEGIN
  IF NEW.status_sdr IS DISTINCT FROM OLD.status_sdr THEN
    allowed := NEW.status_sdr = 'Opt-out' OR CASE
      WHEN OLD.status_sdr = 'A Contatar' THEN NEW.status_sdr IN ('Em Qualificação','Nurturing','Desqualificado','Opt-out')
      WHEN OLD.status_sdr = 'Em Qualificação' THEN NEW.status_sdr IN ('Qualificado','Nurturing','Desqualificado','Opt-out')
      WHEN OLD.status_sdr = 'Qualificado' THEN NEW.status_sdr IN ('Reunião Agendada','Nurturing','Desqualificado','Opt-out')
      WHEN OLD.status_sdr = 'Reunião Agendada' THEN NEW.status_sdr IN ('Nurturing','Opt-out')
      WHEN OLD.status_sdr = 'Nurturing' THEN NEW.status_sdr IN ('Em Qualificação','Desqualificado','Opt-out')
      ELSE false
    END;
    IF NOT allowed THEN
      RAISE EXCEPTION 'Transição SDR não permitida: % -> %', OLD.status_sdr, NEW.status_sdr;
    END IF;
    IF NEW.status_sdr = 'Reunião Agendada' AND NULLIF(btrim(NEW.meeting_event_id), '') IS NULL THEN
      RAISE EXCEPTION 'Reunião Agendada exige meeting_event_id';
    END IF;
    IF NEW.status_sdr = 'Reunião Agendada' AND (NEW.data_reuniao_agendada IS NULL OR NULLIF(btrim(NEW.reuniao_url), '') IS NULL) THEN
      RAISE EXCEPTION 'Reunião Agendada exige data, horário e link reais';
    END IF;
    IF NEW.status_sdr = 'Reunião Agendada' AND NEW.data_reuniao_agendada < now() + interval '2 hours' THEN
      RAISE EXCEPTION 'Diagnóstico exige antecedência mínima de 2 horas';
    END IF;
  END IF;

  IF NEW.estagio_funil IS NOT DISTINCT FROM OLD.estagio_funil THEN
    RETURN NEW;
  END IF;

  NEW.stage_changed_at := now();

  allowed := CASE
    WHEN OLD.estagio_funil IS NULL THEN NEW.estagio_funil = 'Reunião Agendada'
    WHEN OLD.estagio_funil = 'Reunião Agendada' THEN NEW.estagio_funil IN ('Diagnóstico Realizado','No-show','Nurturing','Desqualificado','Fechado Perdido','Opt-out')
    WHEN OLD.estagio_funil = 'Diagnóstico Realizado' THEN NEW.estagio_funil IN ('Proposta Enviada','Nurturing','Desqualificado','Fechado Perdido','Opt-out')
    WHEN OLD.estagio_funil = 'Proposta Enviada' THEN NEW.estagio_funil IN ('Em Negociação','Aguardando Aceite','Nurturing','Fechado Perdido','Opt-out')
    WHEN OLD.estagio_funil = 'Em Negociação' THEN NEW.estagio_funil IN ('Aguardando Aceite','Proposta Enviada','Nurturing','Fechado Perdido','Opt-out')
    WHEN OLD.estagio_funil = 'Aguardando Aceite' THEN NEW.estagio_funil IN ('Em Negociação','Aguardando Pagamento','Fechado Perdido','Opt-out')
    WHEN OLD.estagio_funil = 'Aguardando Pagamento' THEN NEW.estagio_funil IN ('Fechado Ganho','Em Negociação','Fechado Perdido','Opt-out')
    WHEN OLD.estagio_funil = 'No-show' THEN NEW.estagio_funil IN ('Reunião Agendada','Nurturing','Desqualificado','Opt-out')
    WHEN OLD.estagio_funil = 'Nurturing' THEN NEW.estagio_funil IN ('Reunião Agendada','Diagnóstico Realizado','Opt-out')
    WHEN OLD.estagio_funil = 'Fechado Perdido' THEN NEW.estagio_funil = 'Em Negociação'
    ELSE false
  END;

  -- Pagamento pode chegar antes (ou junto) do aceite. A confirmação financeira
  -- promove o lead no mesmo UPDATE em vez de deixá-lo numa etapa parcial.
  IF NEW.estagio_funil = 'Fechado Ganho'
     AND NEW.payment_status = 'pago'
     AND COALESCE(trusted_confirmation_source, '') = 'fechamento_webhook'
     AND OLD.estagio_funil IN ('Proposta Enviada', 'Em Negociação', 'Aguardando Aceite', 'Aguardando Pagamento') THEN
    allowed := true;
  END IF;
  IF NEW.estagio_funil = 'Aguardando Pagamento'
     AND NEW.aceite_em IS NOT NULL
     AND COALESCE(trusted_confirmation_source, '') = 'fechamento_webhook'
     AND OLD.estagio_funil IN ('Proposta Enviada', 'Em Negociação', 'Aguardando Aceite') THEN
    allowed := true;
  END IF;

  IF NOT allowed THEN
    RAISE EXCEPTION 'Transição comercial não permitida: % -> %', COALESCE(OLD.estagio_funil, '∅'), NEW.estagio_funil;
  END IF;

  IF NEW.estagio_funil = 'Reunião Agendada' AND NULLIF(btrim(NEW.meeting_event_id), '') IS NULL THEN
    RAISE EXCEPTION 'Reunião Agendada exige meeting_event_id';
  END IF;
  IF NEW.estagio_funil = 'Reunião Agendada' AND (NEW.data_reuniao_agendada IS NULL OR NULLIF(btrim(NEW.reuniao_url), '') IS NULL) THEN
    RAISE EXCEPTION 'Reunião Agendada exige data, horário e link reais';
  END IF;
  IF NEW.estagio_funil = 'Reunião Agendada' AND NEW.data_reuniao_agendada < now() + interval '2 hours' THEN
    RAISE EXCEPTION 'Diagnóstico exige antecedência mínima de 2 horas';
  END IF;
  IF OLD.estagio_funil = 'No-show' AND NEW.estagio_funil = 'Reunião Agendada' THEN
    IF OLD.no_show_reagenda_tentativas >= 1 THEN
      RAISE EXCEPTION 'No-show permite uma única tentativa de reagendamento; mova para Nurturing';
    END IF;
    NEW.no_show_reagenda_tentativas := OLD.no_show_reagenda_tentativas + 1;
  END IF;

  IF NEW.estagio_funil IN ('Diagnóstico Realizado','Proposta Enviada','Em Negociação','Aguardando Aceite','Aguardando Pagamento')
     AND NEW.data_proximo_passo IS NULL THEN
    RAISE EXCEPTION '% exige próximo passo com data', NEW.estagio_funil;
  END IF;

  IF NEW.estagio_funil = 'Proposta Enviada' THEN
    IF NEW.oferta_comercial IS NULL THEN RAISE EXCEPTION 'Proposta Enviada exige oferta comercial'; END IF;
    IF NOT NEW.decisor_confirmado THEN RAISE EXCEPTION 'Proposta Enviada exige decisor confirmado'; END IF;
    NEW.proposta_enviada_em := COALESCE(NEW.proposta_enviada_em, now());
  END IF;

  IF NEW.estagio_funil = 'Aguardando Pagamento' AND NEW.aceite_em IS NULL THEN
    RAISE EXCEPTION 'Aguardando Pagamento exige aceite confirmado';
  END IF;

  IF NEW.estagio_funil = 'Fechado Perdido' THEN
    IF NEW.motivo_perda IS NULL THEN RAISE EXCEPTION 'Fechado Perdido exige motivo'; END IF;
    IF NEW.motivo_perda = 'outro' AND NULLIF(btrim(NEW.motivo_perda_detalhe), '') IS NULL THEN
      RAISE EXCEPTION 'Motivo Outro exige detalhe';
    END IF;
  END IF;

  IF NEW.estagio_funil = 'Fechado Ganho' AND NEW.payment_status <> 'pago' THEN
    IF NULLIF(btrim(NEW.ganho_override_motivo), '') IS NULL THEN
      RAISE EXCEPTION 'Fechado Ganho exige pagamento confirmado ou override gerencial justificado';
    END IF;
    IF NOT public.has_role(auth.uid(), 'manager') THEN
      RAISE EXCEPTION 'Somente manager pode autorizar ganho sem pagamento';
    END IF;
    NEW.ganho_override_em := now();
    NEW.ganho_override_por := auth.uid();
  END IF;

  NEW.playbook_version := 'simbiose-sales-v2@2.1.0';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_sales_stage_v2 ON public.leads;
CREATE TRIGGER trg_validate_sales_stage_v2
  BEFORE UPDATE OF status_sdr, estagio_funil ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.validate_sales_stage_v2();

CREATE OR REPLACE FUNCTION public.audit_sales_stage_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status_sdr IS DISTINCT FROM OLD.status_sdr THEN
    INSERT INTO public.sales_stage_audit (
      lead_cnpj, from_stage, to_stage, actor_id, responsavel, journey_dimension,
      activity, next_step_at, reason, playbook_version, snapshot
    ) VALUES (
      NEW.cnpj, OLD.status_sdr, NEW.status_sdr, auth.uid(), COALESCE(NEW.responsavel_closer, NEW.responsavel_sdr), 'sdr',
      'Mudança de status SDR', NEW.data_proximo_passo,
      COALESCE(NEW.motivo_perda_detalhe, NEW.motivo_perda), NEW.playbook_version,
      jsonb_build_object('event_id', NEW.meeting_event_id, 'status_cadencia', NEW.status_cadencia)
    );
  END IF;
  IF NEW.estagio_funil IS DISTINCT FROM OLD.estagio_funil THEN
    INSERT INTO public.sales_stage_audit (
      lead_cnpj, from_stage, to_stage, actor_id, responsavel, journey_dimension,
      activity, next_step_at, reason, playbook_version, snapshot
    ) VALUES (
      NEW.cnpj, OLD.estagio_funil, NEW.estagio_funil, auth.uid(), COALESCE(NEW.responsavel_closer, NEW.responsavel_sdr), 'closer',
      'Mudança de etapa do closer', NEW.data_proximo_passo,
      COALESCE(NEW.motivo_perda_detalhe, NEW.motivo_perda, NEW.ganho_override_motivo),
      NEW.playbook_version,
      jsonb_build_object(
        'event_id', NEW.meeting_event_id,
        'oferta', NEW.oferta_comercial,
        'aceite_em', NEW.aceite_em,
        'payment_status', NEW.payment_status,
        'pagamento_em', NEW.pagamento_em
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_sales_stage_v2 ON public.leads;
CREATE TRIGGER trg_audit_sales_stage_v2
  AFTER UPDATE OF status_sdr, estagio_funil ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.audit_sales_stage_v2();

CREATE TABLE IF NOT EXISTS public.reunioes_avaliacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_cnpj text NOT NULL,
  meeting_event_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reunioes_avaliacao
  ADD COLUMN IF NOT EXISTS meeting_event_id text,
  ADD COLUMN IF NOT EXISTS playbook_version text NOT NULL DEFAULT 'simbiose-sales-v2@2.1.0',
  ADD COLUMN IF NOT EXISTS decisor_presente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duracao_min integer,
  ADD COLUMN IF NOT EXISTS fala_closer_faixa text,
  ADD COLUMN IF NOT EXISTS preco_apresentado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preco_minuto integer,
  ADD COLUMN IF NOT EXISTS preco_tratado_na_hora boolean,
  ADD COLUMN IF NOT EXISTS desconto_sem_contrapartida boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gatilhos_avanco text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS desfecho text,
  ADD COLUMN IF NOT EXISTS proximo_passo_data timestamptz,
  ADD COLUMN IF NOT EXISTS obs text,
  ADD COLUMN IF NOT EXISTS motivo_perda text,
  ADD COLUMN IF NOT EXISTS motivo_perda_detalhe text,
  ADD COLUMN IF NOT EXISTS score integer,
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS fit_icp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fit_dor_impacto integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fit_processo_capacidade integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fit_decisao integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fit_timing integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fit_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exec_diagnostico integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exec_escuta integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exec_confirmacao_entendimento integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exec_solucao_ligada_dor integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exec_transparencia_termos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exec_proximo_passo integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS execution_score integer NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS public.idx_reunioes_avaliacao_event;
CREATE UNIQUE INDEX idx_reunioes_avaliacao_event
  ON public.reunioes_avaliacao(lead_cnpj, meeting_event_id);

CREATE TABLE IF NOT EXISTS public.lead_objecoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_cnpj text NOT NULL,
  objecao_id text NOT NULL,
  superada boolean,
  contexto text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_objecoes
  ADD COLUMN IF NOT EXISTS meeting_event_id text,
  ADD COLUMN IF NOT EXISTS avaliacao_id uuid,
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS playbook_version text NOT NULL DEFAULT 'simbiose-sales-v2@2.1.0';
DROP INDEX IF EXISTS public.idx_lead_objecao_por_reuniao;
CREATE UNIQUE INDEX idx_lead_objecao_por_reuniao
  ON public.lead_objecoes(lead_cnpj, meeting_event_id, objecao_id);

CREATE OR REPLACE FUNCTION public.save_meeting_assessment_v2(p_assessment jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  assessment_id uuid;
  lead_record public.leads%ROWTYPE;
  target_stage text;
  outcome text := p_assessment->>'desfecho';
  next_step timestamptz := NULLIF(p_assessment->>'proximo_passo_data', '')::timestamptz;
  v_fit_icp integer := COALESCE(NULLIF(p_assessment->>'fit_icp', '')::integer, 0);
  v_fit_dor_impacto integer := COALESCE(NULLIF(p_assessment->>'fit_dor_impacto', '')::integer, 0);
  v_fit_processo_capacidade integer := COALESCE(NULLIF(p_assessment->>'fit_processo_capacidade', '')::integer, 0);
  v_fit_decisao integer := COALESCE(NULLIF(p_assessment->>'fit_decisao', '')::integer, 0);
  v_fit_timing integer := COALESCE(NULLIF(p_assessment->>'fit_timing', '')::integer, 0);
  v_fit_score integer;
  v_exec_diagnostico integer := COALESCE(NULLIF(p_assessment->>'exec_diagnostico', '')::integer, 0);
  v_exec_escuta integer := COALESCE(NULLIF(p_assessment->>'exec_escuta', '')::integer, 0);
  v_exec_confirmacao integer := COALESCE(NULLIF(p_assessment->>'exec_confirmacao_entendimento', '')::integer, 0);
  v_exec_solucao integer := COALESCE(NULLIF(p_assessment->>'exec_solucao_ligada_dor', '')::integer, 0);
  v_exec_transparencia integer := COALESCE(NULLIF(p_assessment->>'exec_transparencia_termos', '')::integer, 0);
  v_exec_proximo_passo integer := COALESCE(NULLIF(p_assessment->>'exec_proximo_passo', '')::integer, 0);
  v_execution_score integer;
BEGIN
  IF NULLIF(p_assessment->>'lead_cnpj', '') IS NULL OR NULLIF(p_assessment->>'meeting_event_id', '') IS NULL THEN
    RAISE EXCEPTION 'Avaliação exige lead_cnpj e meeting_event_id';
  END IF;
  IF outcome IS NULL OR outcome NOT IN ('fechou', 'proposta_pedida', 'proxima_marcada', 'perdido', 'no_show') THEN
    RAISE EXCEPTION 'Avaliação exige desfecho canônico';
  END IF;
  IF outcome <> 'perdido' AND next_step IS NULL THEN
    RAISE EXCEPTION 'Desfecho exige próximo passo com data';
  END IF;
  IF outcome = 'perdido' AND NULLIF(p_assessment->>'motivo_perda', '') IS NULL THEN
    RAISE EXCEPTION 'Perda exige motivo estruturado';
  END IF;
  IF outcome = 'perdido' AND p_assessment->>'motivo_perda' = 'outro'
     AND NULLIF(btrim(p_assessment->>'motivo_perda_detalhe'), '') IS NULL THEN
    RAISE EXCEPTION 'Motivo Outro exige detalhe';
  END IF;

  SELECT * INTO lead_record
  FROM public.leads
  WHERE cnpj = p_assessment->>'lead_cnpj'
  FOR UPDATE;
  IF lead_record.cnpj IS NULL THEN RAISE EXCEPTION 'Lead não encontrado'; END IF;
  IF lead_record.meeting_event_id IS DISTINCT FROM p_assessment->>'meeting_event_id' THEN
    RAISE EXCEPTION 'Avaliação deve usar o event_id atual do lead';
  END IF;

  IF v_fit_icp NOT BETWEEN 0 AND 20
     OR v_fit_dor_impacto NOT BETWEEN 0 AND 25
     OR v_fit_processo_capacidade NOT BETWEEN 0 AND 20
     OR v_fit_decisao NOT BETWEEN 0 AND 20
     OR v_fit_timing NOT BETWEEN 0 AND 15 THEN
    RAISE EXCEPTION 'Componentes de fit fora dos limites do playbook';
  END IF;
  IF v_exec_diagnostico NOT BETWEEN 0 AND 25
     OR v_exec_escuta NOT BETWEEN 0 AND 15
     OR v_exec_confirmacao NOT BETWEEN 0 AND 15
     OR v_exec_solucao NOT BETWEEN 0 AND 15
     OR v_exec_transparencia NOT BETWEEN 0 AND 15
     OR v_exec_proximo_passo NOT BETWEEN 0 AND 15 THEN
    RAISE EXCEPTION 'Componentes de execução fora dos limites do playbook';
  END IF;
  v_fit_score := v_fit_icp + v_fit_dor_impacto + v_fit_processo_capacidade + v_fit_decisao + v_fit_timing;
  v_execution_score := v_exec_diagnostico + v_exec_escuta + v_exec_confirmacao
    + v_exec_solucao + v_exec_transparencia + v_exec_proximo_passo;

  INSERT INTO public.reunioes_avaliacao (
    lead_cnpj, meeting_event_id, playbook_version, decisor_presente, duracao_min,
    fala_closer_faixa, gatilhos_avanco, desfecho, proximo_passo_data, obs,
    motivo_perda, motivo_perda_detalhe, score,
    fit_icp, fit_dor_impacto, fit_processo_capacidade, fit_decisao, fit_timing, fit_score,
    exec_diagnostico, exec_escuta, exec_confirmacao_entendimento,
    exec_solucao_ligada_dor, exec_transparencia_termos, exec_proximo_passo, execution_score,
    created_by
  ) VALUES (
    p_assessment->>'lead_cnpj', p_assessment->>'meeting_event_id', 'simbiose-sales-v2@2.1.0',
    COALESCE((p_assessment->>'decisor_presente')::boolean, false),
    NULLIF(p_assessment->>'duracao_min', '')::integer,
    NULLIF(p_assessment->>'fala_closer_faixa', ''),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_assessment->'gatilhos_avanco', '[]'::jsonb))),
    outcome, next_step, NULLIF(p_assessment->>'obs', ''),
    NULLIF(p_assessment->>'motivo_perda', ''), NULLIF(p_assessment->>'motivo_perda_detalhe', ''),
    v_execution_score,
    v_fit_icp, v_fit_dor_impacto, v_fit_processo_capacidade, v_fit_decisao, v_fit_timing, v_fit_score,
    v_exec_diagnostico, v_exec_escuta, v_exec_confirmacao,
    v_exec_solucao, v_exec_transparencia, v_exec_proximo_passo, v_execution_score,
    NULLIF(p_assessment->>'created_by', '')
  )
  ON CONFLICT (lead_cnpj, meeting_event_id) DO UPDATE SET
    playbook_version = EXCLUDED.playbook_version,
    decisor_presente = EXCLUDED.decisor_presente,
    duracao_min = EXCLUDED.duracao_min,
    fala_closer_faixa = EXCLUDED.fala_closer_faixa,
    gatilhos_avanco = EXCLUDED.gatilhos_avanco,
    desfecho = EXCLUDED.desfecho,
    proximo_passo_data = EXCLUDED.proximo_passo_data,
    obs = EXCLUDED.obs,
    motivo_perda = EXCLUDED.motivo_perda,
    motivo_perda_detalhe = EXCLUDED.motivo_perda_detalhe,
    score = EXCLUDED.score,
    fit_icp = EXCLUDED.fit_icp,
    fit_dor_impacto = EXCLUDED.fit_dor_impacto,
    fit_processo_capacidade = EXCLUDED.fit_processo_capacidade,
    fit_decisao = EXCLUDED.fit_decisao,
    fit_timing = EXCLUDED.fit_timing,
    fit_score = EXCLUDED.fit_score,
    exec_diagnostico = EXCLUDED.exec_diagnostico,
    exec_escuta = EXCLUDED.exec_escuta,
    exec_confirmacao_entendimento = EXCLUDED.exec_confirmacao_entendimento,
    exec_solucao_ligada_dor = EXCLUDED.exec_solucao_ligada_dor,
    exec_transparencia_termos = EXCLUDED.exec_transparencia_termos,
    exec_proximo_passo = EXCLUDED.exec_proximo_passo,
    execution_score = EXCLUDED.execution_score,
    created_by = EXCLUDED.created_by
  RETURNING id INTO assessment_id;

  UPDATE public.lead_objecoes
  SET avaliacao_id = assessment_id, playbook_version = 'simbiose-sales-v2@2.1.0'
  WHERE lead_cnpj = p_assessment->>'lead_cnpj'
    AND meeting_event_id = p_assessment->>'meeting_event_id';

  target_stage := CASE
    WHEN outcome = 'no_show' AND lead_record.estagio_funil = 'Reunião Agendada' THEN 'No-show'
    WHEN outcome = 'perdido' THEN 'Fechado Perdido'
    WHEN lead_record.estagio_funil = 'Reunião Agendada' THEN 'Diagnóstico Realizado'
    ELSE lead_record.estagio_funil
  END;

  UPDATE public.leads
  SET fit_score = v_fit_score,
      fit_score_breakdown = jsonb_build_object(
        'icp', v_fit_icp,
        'dor_impacto', v_fit_dor_impacto,
        'processo_capacidade', v_fit_processo_capacidade,
        'decisao', v_fit_decisao,
        'timing', v_fit_timing
      ),
      execution_score = v_execution_score,
      decisor_confirmado = COALESCE((p_assessment->>'decisor_presente')::boolean, false),
      data_proximo_passo = next_step,
      motivo_perda = CASE WHEN outcome = 'perdido' THEN p_assessment->>'motivo_perda' ELSE motivo_perda END,
      motivo_perda_detalhe = CASE WHEN outcome = 'perdido' THEN NULLIF(p_assessment->>'motivo_perda_detalhe', '') ELSE motivo_perda_detalhe END,
      estagio_funil = target_stage,
      playbook_version = 'simbiose-sales-v2@2.1.0'
  WHERE cnpj = lead_record.cnpj;

  RETURN assessment_id;
END;
$$;

CREATE TABLE IF NOT EXISTS public.fechamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_cnpj text NOT NULL,
  plano text,
  valor numeric,
  periodicidade text,
  exclusividade boolean NOT NULL DEFAULT false,
  exclusividade_cidade text,
  exclusividade_inicio date,
  exclusividade_fim date,
  termo_token text,
  asaas_payment_link text,
  escopo text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'rascunho',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fechamentos DROP CONSTRAINT IF EXISTS fechamentos_oferta_comercial_v2_check;
ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS oferta_comercial text,
  ADD COLUMN IF NOT EXISTS playbook_version text NOT NULL DEFAULT 'simbiose-sales-v2@2.1.0',
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS proposta_enviada_em timestamptz,
  ADD COLUMN IF NOT EXISTS aceite_em timestamptz,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'nao_iniciado',
  ADD COLUMN IF NOT EXISTS pagamento_em timestamptz;
ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS objetivo text,
  ADD COLUMN IF NOT EXISTS decisor_nome text,
  ADD COLUMN IF NOT EXISTS exclusoes text,
  ADD COLUMN IF NOT EXISTS prazo_implantacao text,
  ADD COLUMN IF NOT EXISTS condicao_cancelamento text,
  ADD COLUMN IF NOT EXISTS proximo_passo text,
  ADD COLUMN IF NOT EXISTS proposal_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proposal_approved_by text,
  ADD COLUMN IF NOT EXISTS proposal_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS offer_id text,
  ADD COLUMN IF NOT EXISTS catalog_version text,
  ADD COLUMN IF NOT EXISTS quote_id text,
  ADD COLUMN IF NOT EXISTS quote_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS setup_valor numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recurring_valor numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_services_valor numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS asaas_payment_id text,
  ADD COLUMN IF NOT EXISTS asaas_recurring_payment_link text,
  ADD COLUMN IF NOT EXISTS go_live_em timestamptz,
  ADD COLUMN IF NOT EXISTS go_live_aceito_em timestamptz,
  ADD COLUMN IF NOT EXISTS go_live_aceito_por text;

-- O banco vivo ainda usa fechamentos_status_check com o vocabulário anterior.
-- Removemos por introspecção para não depender do nome da constraint em cada ambiente.
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'fechamentos'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ~* '\mstatus\M'
  LOOP
    EXECUTE format('ALTER TABLE public.fechamentos DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.fechamentos ALTER COLUMN status SET DEFAULT 'rascunho';
UPDATE public.fechamentos
SET status = CASE
  WHEN payment_status = 'pago' OR status = 'pago' THEN 'pago'
  WHEN payment_status = 'vencido' OR status = 'vencido' THEN 'vencido'
  WHEN aceite_em IS NOT NULL OR status = 'aceito' THEN 'aceito'
  WHEN proposta_enviada_em IS NOT NULL OR status IN ('aguardando_aceite', 'enviado', 'proposta_enviada') THEN 'proposta_enviada'
  WHEN status IN ('cancelado', 'recusado', 'expirado') THEN 'cancelado'
  ELSE 'rascunho'
END;
ALTER TABLE public.fechamentos
  ALTER COLUMN status SET NOT NULL,
  ADD CONSTRAINT fechamentos_status_v2_check CHECK (
    status IN ('rascunho', 'proposta_enviada', 'aceito', 'pago', 'vencido', 'cancelado')
  ) NOT VALID;
ALTER TABLE public.fechamentos VALIDATE CONSTRAINT fechamentos_status_v2_check;

ALTER TABLE public.fechamentos
  ADD CONSTRAINT fechamentos_oferta_comercial_v2_check CHECK (
    oferta_comercial IS NULL OR oferta_comercial IN (
      'Imersão', 'Demanda', 'Atendimento com IA', 'Operação de Vendas',
      'Operação', 'Operação avançada'
    )
  ) NOT VALID;
ALTER TABLE public.fechamentos VALIDATE CONSTRAINT fechamentos_oferta_comercial_v2_check;
ALTER TABLE public.fechamentos DROP CONSTRAINT IF EXISTS fechamentos_periodicidade_v21_check;
ALTER TABLE public.fechamentos
  ADD CONSTRAINT fechamentos_periodicidade_v21_check CHECK (
    periodicidade IS NULL OR periodicidade IN ('unico', 'mensal', 'trimestral', 'anual')
  ) NOT VALID;
ALTER TABLE public.fechamentos VALIDATE CONSTRAINT fechamentos_periodicidade_v21_check;
CREATE INDEX IF NOT EXISTS idx_fechamentos_quote_id
  ON public.fechamentos(quote_id) WHERE quote_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fechamentos_idempotency_key
  ON public.fechamentos(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_fechamento_terms_v2()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND (NEW.status <> 'rascunho' OR NEW.proposal_approved))
     OR (TG_OP = 'UPDATE' AND (
       (OLD.status = 'rascunho' AND NEW.status <> 'rascunho')
       OR (NOT OLD.proposal_approved AND NEW.proposal_approved)
     )) THEN
    IF NEW.oferta_comercial IS NULL OR NEW.valor IS NULL OR NEW.valor <= 0 THEN
      RAISE EXCEPTION 'Proposta exige oferta canônica e investimento revisado';
    END IF;
    IF NEW.playbook_version = 'simbiose-sales-v2@2.1.0' AND (
      NEW.offer_id IS NULL OR NEW.offer_id NOT IN ('imersao','demanda','atendimento_ia','operacao_vendas')
      OR NEW.catalog_version <> '2.1.0'
      OR NULLIF(btrim(NEW.quote_id), '') IS NULL
      OR NEW.quote_snapshot IS NULL
      OR NEW.quote_snapshot->>'playbook_version' <> 'simbiose-sales-v2@2.1.0'
      OR NEW.quote_snapshot->>'catalog_version' <> '2.1.0'
    ) THEN
      RAISE EXCEPTION 'Proposta V2.1 exige snapshot da cotação oficial';
    END IF;
    IF NULLIF(btrim(NEW.objetivo), '') IS NULL
       OR NULLIF(btrim(NEW.decisor_nome), '') IS NULL
       OR COALESCE(cardinality(NEW.escopo), 0) = 0
       OR NULLIF(btrim(NEW.exclusoes), '') IS NULL
       OR NULLIF(btrim(NEW.prazo_implantacao), '') IS NULL
       OR NULLIF(btrim(NEW.condicao_cancelamento), '') IS NULL
       OR NULLIF(btrim(NEW.proximo_passo), '') IS NULL THEN
      RAISE EXCEPTION 'Proposta exige todos os termos materiais revisados';
    END IF;
    IF NOT NEW.proposal_approved OR NULLIF(btrim(NEW.proposal_approved_by), '') IS NULL OR NEW.proposal_approved_at IS NULL THEN
      RAISE EXCEPTION 'Proposta exige aprovação humana identificada';
    END IF;
    IF NEW.exclusividade AND (
      NULLIF(btrim(NEW.exclusividade_cidade), '') IS NULL
      OR NEW.exclusividade_inicio IS NULL
      OR NEW.exclusividade_fim IS NULL
      OR NEW.exclusividade_fim <= NEW.exclusividade_inicio
    ) THEN
      RAISE EXCEPTION 'Exclusividade exige cidade, início e fim explícitos';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_fechamento_terms_v2 ON public.fechamentos;
CREATE TRIGGER trg_validate_fechamento_terms_v2
  BEFORE INSERT OR UPDATE ON public.fechamentos
  FOR EACH ROW EXECUTE FUNCTION public.validate_fechamento_terms_v2();

CREATE OR REPLACE FUNCTION public.guard_fechamento_confirmation_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  authorized boolean := COALESCE(auth.role(), '') = 'service_role';
  payment_transition_allowed boolean := false;
  status_transition_allowed boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW.aceite_em IS NOT NULL
        OR NEW.payment_status <> 'nao_iniciado'
        OR NEW.pagamento_em IS NOT NULL
        OR NEW.status NOT IN ('rascunho', 'proposta_enviada'))
       AND NOT authorized THEN
      RAISE EXCEPTION 'Aceite e pagamento são somente leitura; use o termo/webhook autorizado';
    END IF;
    IF NEW.payment_status = 'pago' AND NEW.pagamento_em IS NULL THEN
      RAISE EXCEPTION 'Pagamento pago exige timestamp de confirmação';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.aceite_em IS DISTINCT FROM OLD.aceite_em
      OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
      OR NEW.pagamento_em IS DISTINCT FROM OLD.pagamento_em
      OR NEW.status IS DISTINCT FROM OLD.status)
     AND NOT authorized THEN
    RAISE EXCEPTION 'Aceite e pagamento são somente leitura; use o termo/webhook autorizado';
  END IF;

  IF OLD.aceite_em IS NOT NULL AND NEW.aceite_em IS DISTINCT FROM OLD.aceite_em THEN
    RAISE EXCEPTION 'Aceite confirmado é imutável';
  END IF;
  IF OLD.pagamento_em IS NOT NULL AND NEW.pagamento_em IS DISTINCT FROM OLD.pagamento_em THEN
    RAISE EXCEPTION 'Evidência de pagamento é imutável';
  END IF;

  payment_transition_allowed := CASE OLD.payment_status
    WHEN 'nao_iniciado' THEN NEW.payment_status IN ('nao_iniciado', 'pendente', 'pago', 'vencido', 'cancelado')
    WHEN 'pendente' THEN NEW.payment_status IN ('pendente', 'pago', 'vencido', 'cancelado')
    WHEN 'vencido' THEN NEW.payment_status IN ('vencido', 'pago', 'cancelado')
    WHEN 'pago' THEN NEW.payment_status = 'pago'
    WHEN 'cancelado' THEN NEW.payment_status = 'cancelado'
    ELSE false
  END;
  IF NOT payment_transition_allowed THEN
    RAISE EXCEPTION 'Transição de pagamento não monotônica: % -> %', OLD.payment_status, NEW.payment_status;
  END IF;

  status_transition_allowed := OLD.status = NEW.status OR CASE OLD.status
    WHEN 'rascunho' THEN NEW.status IN ('proposta_enviada', 'cancelado')
    WHEN 'proposta_enviada' THEN NEW.status IN ('aceito', 'pago', 'vencido', 'cancelado')
    WHEN 'aceito' THEN NEW.status IN ('pago', 'vencido', 'cancelado')
    WHEN 'vencido' THEN NEW.status IN ('pago', 'cancelado')
    WHEN 'pago' THEN NEW.status = 'pago'
    WHEN 'cancelado' THEN NEW.status = 'cancelado'
    ELSE false
  END;
  IF NOT status_transition_allowed THEN
    RAISE EXCEPTION 'Transição de fechamento não monotônica: % -> %', OLD.status, NEW.status;
  END IF;
  IF NEW.status = 'aceito' AND NEW.aceite_em IS NULL THEN
    RAISE EXCEPTION 'Status aceito exige timestamp de aceite';
  END IF;
  IF NEW.payment_status = 'pago' AND (NEW.status <> 'pago' OR NEW.pagamento_em IS NULL) THEN
    RAISE EXCEPTION 'Pagamento pago exige status pago e timestamp de confirmação';
  END IF;
  IF NEW.status = 'vencido' AND NEW.payment_status <> 'vencido' THEN
    RAISE EXCEPTION 'Status vencido exige payment_status vencido';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_fechamento_confirmation_v2 ON public.fechamentos;
CREATE TRIGGER trg_guard_fechamento_confirmation_v2
  BEFORE UPDATE OF aceite_em, payment_status, pagamento_em, status ON public.fechamentos
  FOR EACH ROW EXECUTE FUNCTION public.guard_fechamento_confirmation_v2();
DROP TRIGGER IF EXISTS trg_guard_fechamento_insert_v2 ON public.fechamentos;
CREATE TRIGGER trg_guard_fechamento_insert_v2
  BEFORE INSERT ON public.fechamentos
  FOR EACH ROW EXECUTE FUNCTION public.guard_fechamento_confirmation_v2();

CREATE TABLE IF NOT EXISTS public.sales_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_cnpj text NOT NULL,
  task_type text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  due_at timestamptz NOT NULL,
  responsavel text,
  playbook_version text NOT NULL DEFAULT 'simbiose-sales-v2@2.1.0',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_tasks_open_payment_overdue
  ON public.sales_tasks(lead_cnpj, task_type)
  WHERE status = 'pendente';
ALTER TABLE public.sales_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sales_tasks FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sales_tasks TO authenticated;
GRANT ALL ON TABLE public.sales_tasks TO service_role;
DROP POLICY IF EXISTS "Authenticated read sales tasks" ON public.sales_tasks;
CREATE POLICY "Authenticated read sales tasks" ON public.sales_tasks
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated create sales tasks" ON public.sales_tasks;
CREATE POLICY "Authenticated create sales tasks" ON public.sales_tasks
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated update sales tasks" ON public.sales_tasks;
CREATE POLICY "Authenticated update sales tasks" ON public.sales_tasks
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role manages sales tasks" ON public.sales_tasks;
CREATE POLICY "Service role manages sales tasks" ON public.sales_tasks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.sync_fechamento_v2_to_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_lead public.leads%ROWTYPE;
  effective_aceite_em timestamptz;
  effective_pagamento_em timestamptz;
BEGIN
  SELECT * INTO target_lead FROM public.leads WHERE cnpj = NEW.lead_cnpj LIMIT 1;
  IF target_lead.cnpj IS NULL THEN RETURN NEW; END IF;
  PERFORM set_config('app.commercial_confirmation_source', 'fechamento_webhook', true);

  effective_aceite_em := COALESCE(target_lead.aceite_em, NEW.aceite_em);
  effective_pagamento_em := CASE
    WHEN NEW.payment_status = 'pago' THEN COALESCE(target_lead.pagamento_em, NEW.pagamento_em, now())
    ELSE target_lead.pagamento_em
  END;

  IF NEW.payment_status = 'pago'
     AND target_lead.estagio_funil NOT IN ('Proposta Enviada', 'Em Negociação', 'Aguardando Aceite', 'Aguardando Pagamento', 'Fechado Ganho') THEN
    RAISE EXCEPTION 'Pagamento não pode concluir lead fora da jornada de proposta';
  END IF;

  IF NEW.aceite_em IS DISTINCT FROM OLD.aceite_em
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.pagamento_em IS DISTINCT FROM OLD.pagamento_em THEN
    UPDATE public.leads
    SET aceite_em = effective_aceite_em,
        payment_status = CASE
          WHEN NEW.payment_status = 'pago' THEN 'pago'
          WHEN NEW.payment_status = 'vencido' THEN 'vencido'
          WHEN effective_aceite_em IS NOT NULL AND NEW.payment_status = 'nao_iniciado' THEN 'pendente'
          ELSE NEW.payment_status
        END,
        pagamento_em = effective_pagamento_em,
        estagio_funil = CASE
          WHEN NEW.payment_status = 'pago'
               AND estagio_funil IN ('Proposta Enviada', 'Em Negociação', 'Aguardando Aceite', 'Aguardando Pagamento')
            THEN 'Fechado Ganho'
          WHEN effective_aceite_em IS NOT NULL
               AND estagio_funil IN ('Proposta Enviada', 'Em Negociação', 'Aguardando Aceite')
            THEN 'Aguardando Pagamento'
          ELSE estagio_funil
        END,
        playbook_version = 'simbiose-sales-v2@2.1.0'
    WHERE cnpj = target_lead.cnpj;
  END IF;

  IF NEW.payment_status = 'vencido' AND OLD.payment_status IS DISTINCT FROM 'vencido' THEN
    UPDATE public.leads
    SET payment_status = 'vencido', data_proximo_passo = now(), playbook_version = 'simbiose-sales-v2@2.1.0'
    WHERE cnpj = target_lead.cnpj;
    INSERT INTO public.sales_tasks (lead_cnpj, task_type, title, due_at, responsavel)
    VALUES (target_lead.cnpj, 'cobranca_vencida', 'Cobrança vencida: contato humano', now(), COALESCE(target_lead.responsavel_closer, target_lead.responsavel_sdr))
    ON CONFLICT (lead_cnpj, task_type) WHERE status = 'pendente' DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_fechamento_v2_to_lead ON public.fechamentos;
CREATE TRIGGER trg_sync_fechamento_v2_to_lead
  AFTER UPDATE OF aceite_em, payment_status, pagamento_em, status ON public.fechamentos
  FOR EACH ROW EXECUTE FUNCTION public.sync_fechamento_v2_to_lead();

-- Consumidores legados que alimentam a fila e os painéis precisam usar o
-- vocabulário V2. As assinaturas e colunas são preservadas para o CRM e para
-- os serviços existentes.
CREATE OR REPLACE FUNCTION public.get_cadencia_hoje(p_cidade text DEFAULT NULL::text)
RETURNS SETOF public.leads
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT *
  FROM public.leads
  WHERE (p_cidade IS NULL OR cidade = p_cidade)
    AND pesquisa_realizada = true
    AND status_cadencia = 'ativo'
    AND status_sdr NOT IN ('Reunião Agendada', 'Nurturing', 'Desqualificado', 'Opt-out')
    AND estagio_funil IS NULL
    AND (data_proximo_passo IS NULL OR data_proximo_passo <= CURRENT_TIMESTAMP)
  ORDER BY data_proximo_passo ASC NULLS FIRST, created_at ASC
  LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION public.get_cadencia_amanha(p_cidade text DEFAULT NULL::text)
RETURNS SETOF public.leads
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT *
  FROM public.leads
  WHERE (p_cidade IS NULL OR cidade = p_cidade)
    AND status_cadencia = 'ativo'
    AND status_sdr NOT IN ('Reunião Agendada', 'Nurturing', 'Desqualificado', 'Opt-out')
    AND estagio_funil IS NULL
    AND data_proximo_passo::date = (CURRENT_DATE + INTERVAL '1 day')::date
  ORDER BY data_proximo_passo ASC, created_at ASC
  LIMIT 50;
$$;

DROP FUNCTION IF EXISTS public.get_reuniao_inconsistencies(text);
CREATE FUNCTION public.get_reuniao_inconsistencies(p_cidade text DEFAULT NULL)
RETURNS TABLE(
  cnpj text,
  fantasia text,
  razao_social text,
  cidade text,
  created_at timestamptz,
  meeting_event_id text,
  data_reuniao_agendada timestamptz,
  reuniao_url text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    l.cnpj, l.fantasia, l.razao_social, l.cidade, l.created_at,
    l.meeting_event_id, l.data_reuniao_agendada, l.reuniao_url
  FROM public.leads l
  WHERE l.status_sdr = 'Reunião Agendada'
    AND (p_cidade IS NULL OR l.cidade = p_cidade)
    AND NOT EXISTS (
      SELECT 1
      FROM public.atividades a
      WHERE a.lead_cnpj = l.cnpj
        AND a.tipo_atividade = 'reuniao'
        AND a.resultado = 'agendado'
    )
  ORDER BY l.created_at DESC;
$$;

DROP FUNCTION IF EXISTS public.lead_has_reuniao_activity(text);
DROP FUNCTION IF EXISTS public.lead_has_reuniao_activity(uuid);
CREATE FUNCTION public.lead_has_reuniao_activity(p_lead_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.atividades a
    WHERE a.lead_cnpj = p_lead_id
      AND a.tipo_atividade = 'reuniao'
      AND a.resultado = 'agendado'
  );
$$;

CREATE OR REPLACE VIEW public.prospeccao_fila AS
WITH candidates AS (
  SELECT
    l.*,
    regexp_replace(
      COALESCE(
        NULLIF(l.celular1, ''), NULLIF(l.socio1_celular1, ''),
        NULLIF(l.celular2, ''), NULLIF(l.socio1_celular2, ''),
        NULLIF(l.telefone1, ''), NULLIF(l.socio1_telefone1, ''),
        NULLIF(l.telefone2, ''), NULLIF(l.socio1_telefone2, '')
      ),
      '[^0-9]', '', 'g'
    ) AS phone_digits
  FROM public.leads l
), normalized AS (
  SELECT
    c.*,
    CASE
      WHEN length(phone_digits) IN (10, 11) THEN '+55' || phone_digits
      WHEN length(phone_digits) IN (12, 13) AND left(phone_digits, 2) = '55' THEN '+' || phone_digits
      ELSE NULL
    END AS telefone_e164
  FROM candidates c
)
SELECT
  n.cnpj,
  n.fantasia,
  COALESCE(NULLIF(n.contato_nome, ''), NULLIF(n.socio1_nome, '')) AS contato_nome,
  n.cidade,
  n.uf,
  n.status_sdr,
  n.porte_equipe,
  n.email1,
  n.telefone_e164,
  n.telefone_e164 ~ '^\+55[1-9][0-9]9[0-9]{8}$' AS aceita_sms,
  CASE upper(n.cidade)
    WHEN 'UBERLANDIA' THEN 1 WHEN 'UBERLÂNDIA' THEN 1
    WHEN 'SOROCABA' THEN 2
    WHEN 'FEIRA DE SANTANA' THEN 3
    WHEN 'AGUAS LINDAS DE GOIAS' THEN 4 WHEN 'ÁGUAS LINDAS DE GOIÁS' THEN 4
    ELSE 99
  END AS ordem_praca,
  CASE n.porte_equipe
    WHEN '31+' THEN 1 WHEN '11-30' THEN 2 WHEN '5-10' THEN 3
    WHEN '2-4' THEN 4 ELSE 5
  END AS ordem_porte
FROM normalized n
WHERE n.telefone_e164 IS NOT NULL
  AND upper(n.cidade) IN (
    'UBERLANDIA', 'UBERLÂNDIA', 'SOROCABA', 'FEIRA DE SANTANA',
    'AGUAS LINDAS DE GOIAS', 'ÁGUAS LINDAS DE GOIÁS'
  )
  AND n.status_sdr NOT IN ('Reunião Agendada', 'Nurturing', 'Desqualificado', 'Opt-out')
  AND n.estagio_funil IS NULL;

CREATE OR REPLACE FUNCTION public.canal_maquina(origem text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN origem IN ('facebook_ads', 'whatsapp_uchat', 'live_simbiose') THEN 'pago'
    WHEN origem = 'bitrix_migrado' THEN 'reativacao'
    WHEN origem = 'receita_federal' THEN 'whatsapp_frio'
    WHEN origem = 'instagram_manual' THEN 'instagram'
    ELSE 'outros'
  END;
$$;

CREATE OR REPLACE VIEW public.comercial_painel_dia AS
WITH agendadas AS (
  SELECT
    (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
    public.canal_maquina(l.origem_lead) AS canal,
    count(*) AS reunioes_agendadas
  FROM public.atividades a
  JOIN public.leads l ON l.cnpj = a.lead_cnpj
  WHERE a.tipo_atividade = 'reuniao' AND a.resultado = 'agendado'
  GROUP BY 1, 2
), realizadas AS (
  SELECT
    (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
    public.canal_maquina(l.origem_lead) AS canal,
    count(*) AS reunioes_realizadas
  FROM public.atividades a
  JOIN public.leads l ON l.cnpj = a.lead_cnpj
  WHERE a.tipo_atividade = 'reuniao' AND a.resultado = 'sucesso'
  GROUP BY 1, 2
)
SELECT
  COALESCE(ag.dia, re.dia) AS dia,
  COALESCE(ag.canal, re.canal) AS canal,
  COALESCE(ag.reunioes_agendadas, 0) AS reunioes_agendadas,
  COALESCE(re.reunioes_realizadas, 0) AS reunioes_realizadas
FROM agendadas ag
FULL JOIN realizadas re ON re.dia = ag.dia AND re.canal = ag.canal;

CREATE OR REPLACE VIEW public.vw_simbiose_funil_diario AS
SELECT
  (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
  COALESCE(l.origem_lead, 'outros') AS origem,
  count(*) AS leads_novos,
  count(*) FILTER (
    WHERE l.status_sdr = 'Reunião Agendada' OR l.estagio_funil = 'Reunião Agendada'
  ) AS reuniao_agendada,
  count(*) FILTER (WHERE l.estagio_funil = 'Diagnóstico Realizado') AS reuniao_realizada,
  count(*) FILTER (WHERE l.estagio_funil = 'Fechado Ganho') AS fechado_ganho,
  count(*) FILTER (
    WHERE l.status_sdr = 'Desqualificado' OR l.estagio_funil IN ('Desqualificado', 'Fechado Perdido')
  ) AS desqualificado
FROM public.leads l
GROUP BY 1, 2;

-- O painel gerencial anterior tratava o score de pesquisa digital como
-- qualificação comercial e ainda juntava atividades por IDs inexistentes.
-- A assinatura é preservada, mas os indicadores passam a usar CNPJ, enums
-- minúsculos e o score de fit oficial (limiar único de 70 pontos).
DROP FUNCTION IF EXISTS public.get_manager_analytics(text, integer);
CREATE FUNCTION public.get_manager_analytics(
  p_cidade text DEFAULT NULL::text,
  p_days integer DEFAULT 1
)
RETURNS TABLE(
  total_leads_qualificados bigint,
  total_atividades bigint,
  total_reunioes bigint,
  total_fechamentos bigint,
  valor_pipeline numeric,
  total_desqualificados bigint,
  desq_sem_perfil bigint,
  desq_sem_budget bigint,
  desq_sem_interesse bigint,
  desq_geral bigint
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH scoped_leads AS (
    SELECT l.*
    FROM public.leads l
    WHERE p_cidade IS NULL OR l.cidade = p_cidade
  ), latest_fechamento AS (
    SELECT DISTINCT ON (f.lead_cnpj)
      f.lead_cnpj, f.valor, f.status
    FROM public.fechamentos f
    JOIN scoped_leads l ON l.cnpj = f.lead_cnpj
    ORDER BY f.lead_cnpj, f.created_at DESC, f.id DESC
  ), period_start AS (
    SELECT ((CURRENT_DATE - make_interval(days => GREATEST(p_days, 1) - 1))
      AT TIME ZONE 'America/Sao_Paulo') AS starts_at
  )
  SELECT
    (SELECT count(*) FROM scoped_leads WHERE fit_score >= 70),
    (SELECT count(*)
       FROM public.atividades a
       JOIN scoped_leads l ON l.cnpj = a.lead_cnpj
       CROSS JOIN period_start p
      WHERE a.created_at >= p.starts_at),
    (SELECT count(*)
       FROM public.atividades a
       JOIN scoped_leads l ON l.cnpj = a.lead_cnpj
       CROSS JOIN period_start p
      WHERE a.tipo_atividade = 'reuniao'
        AND a.resultado = 'agendado'
        AND a.created_at >= p.starts_at),
    (SELECT count(*) FROM scoped_leads
      WHERE estagio_funil = 'Fechado Ganho'
        AND (payment_status = 'pago' OR ganho_override_em IS NOT NULL)),
    (SELECT COALESCE(sum(f.valor), 0)
       FROM latest_fechamento f
       JOIN scoped_leads l ON l.cnpj = f.lead_cnpj
      WHERE f.status IN ('proposta_enviada', 'aceito', 'vencido')
        AND l.estagio_funil IN ('Proposta Enviada', 'Em Negociação', 'Aguardando Aceite', 'Aguardando Pagamento')),
    (SELECT count(*) FROM scoped_leads WHERE status_sdr = 'Desqualificado'),
    (SELECT count(*) FROM scoped_leads WHERE status_sdr = 'Desqualificado' AND motivo_perda = 'sem_fit'),
    (SELECT count(*) FROM scoped_leads WHERE status_sdr = 'Desqualificado' AND motivo_perda = 'investimento'),
    (SELECT count(*) FROM scoped_leads WHERE status_sdr = 'Desqualificado' AND motivo_perda = 'desistencia'),
    (SELECT count(*) FROM scoped_leads
      WHERE status_sdr = 'Desqualificado'
        AND (motivo_perda IS NULL OR motivo_perda NOT IN ('sem_fit', 'investimento', 'desistencia')));
$$;

COMMENT ON COLUMN public.leads.playbook_version IS 'Versão comercial aplicada na última transição';
COMMENT ON TABLE public.sales_stage_audit IS 'Auditoria append-only das transições da jornada comercial V2';

CREATE TABLE IF NOT EXISTS public.commercial_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_cnpj text NOT NULL,
  quote_id text NOT NULL,
  catalog_version text NOT NULL,
  playbook_version text NOT NULL,
  offer_id text NOT NULL,
  commitment text NOT NULL,
  quote_snapshot jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_quotes_version_v21 CHECK (
    catalog_version = '2.1.0' AND playbook_version = 'simbiose-sales-v2@2.1.0'
  ),
  CONSTRAINT commercial_quotes_offer_v21 CHECK (
    offer_id IN ('imersao','demanda','atendimento_ia','operacao_vendas')
  ),
  CONSTRAINT commercial_quotes_commitment_v21 CHECK (
    commitment IN ('unico','mensal','trimestral','anual')
  ),
  UNIQUE (lead_cnpj, quote_id)
);
ALTER TABLE public.commercial_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commercial_quotes FROM anon;
GRANT SELECT ON TABLE public.commercial_quotes TO authenticated;
GRANT ALL ON TABLE public.commercial_quotes TO service_role;
DROP POLICY IF EXISTS "Authenticated read commercial quotes" ON public.commercial_quotes;
CREATE POLICY "Authenticated read commercial quotes" ON public.commercial_quotes
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Service role manages commercial quotes" ON public.commercial_quotes;
CREATE POLICY "Service role manages commercial quotes" ON public.commercial_quotes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE VIEW public.vw_commercial_catalog_metrics AS
SELECT
  COALESCE(f.catalog_version, 'legacy') AS catalog_version,
  COALESCE(f.offer_id, 'legacy') AS offer_id,
  count(*) FILTER (WHERE f.proposta_enviada_em IS NOT NULL) AS propostas,
  count(*) FILTER (WHERE f.payment_status = 'pago') AS fechamentos,
  CASE
    WHEN count(*) FILTER (WHERE f.proposta_enviada_em IS NOT NULL) = 0 THEN 0
    ELSE round(
      100.0 * count(*) FILTER (WHERE f.payment_status = 'pago')
      / count(*) FILTER (WHERE f.proposta_enviada_em IS NOT NULL), 2
    )
  END AS taxa_fechamento,
  avg(extract(epoch FROM (f.pagamento_em - f.proposta_enviada_em)) / 86400.0)
    FILTER (WHERE f.pagamento_em IS NOT NULL AND f.proposta_enviada_em IS NOT NULL) AS ciclo_venda_dias
FROM public.fechamentos f
GROUP BY 1, 2;

CREATE TABLE IF NOT EXISTS public.commercial_contact_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id text NOT NULL,
  lead_cnpj text NOT NULL,
  cycle_start date NOT NULL,
  included_blocks integer NOT NULL DEFAULT 1 CHECK (included_blocks >= 1),
  active_extra_blocks integer NOT NULL DEFAULT 0 CHECK (active_extra_blocks >= 0),
  unique_contacts integer NOT NULL DEFAULT 0 CHECK (unique_contacts >= 0),
  billing_action_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fechamento_id, cycle_start)
);
CREATE TABLE IF NOT EXISTS public.commercial_contact_seen (
  usage_id uuid NOT NULL REFERENCES public.commercial_contact_usage(id) ON DELETE CASCADE,
  contact_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usage_id, contact_hash)
);
CREATE TABLE IF NOT EXISTS public.commercial_contact_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_id uuid NOT NULL REFERENCES public.commercial_contact_usage(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  capacity_contacts integer NOT NULL,
  billing_delta_brl numeric(12,2) NOT NULL DEFAULT 0,
  billing_status text NOT NULL DEFAULT 'not_required'
    CHECK (billing_status IN ('not_required','pending','applied','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usage_id, event_key)
);
ALTER TABLE public.commercial_contact_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_contact_seen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_contact_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commercial_contact_usage, public.commercial_contact_seen,
  public.commercial_contact_events FROM anon, authenticated;
GRANT SELECT ON TABLE public.commercial_contact_usage, public.commercial_contact_events TO authenticated;
GRANT ALL ON TABLE public.commercial_contact_usage, public.commercial_contact_seen,
  public.commercial_contact_events TO service_role;
CREATE POLICY "Authenticated read contact usage" ON public.commercial_contact_usage
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read contact events" ON public.commercial_contact_events
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages contact usage" ON public.commercial_contact_usage
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages contact seen" ON public.commercial_contact_seen
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages contact events" ON public.commercial_contact_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
