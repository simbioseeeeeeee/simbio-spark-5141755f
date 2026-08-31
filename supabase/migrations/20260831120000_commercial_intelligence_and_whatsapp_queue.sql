-- Inteligencia comercial do Sales OS: origem auditavel, MRR, eventos de etapa,
-- investimento por campanha e fila do WhatsApp pessoal do Guilherme.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS origem_comercial text,
  ADD COLUMN IF NOT EXISTS indicado_por text,
  ADD COLUMN IF NOT EXISTS tipo_conta_comercial text,
  ADD COLUMN IF NOT EXISTS numero_corretores integer,
  ADD COLUMN IF NOT EXISTS icp_confirmado boolean,
  ADD COLUMN IF NOT EXISTS temperatura text,
  ADD COLUMN IF NOT EXISTS mrr_proposta numeric(12,2),
  ADD COLUMN IF NOT EXISTS proposta_realizada_em timestamptz,
  ADD COLUMN IF NOT EXISTS proposta_aprovada_em timestamptz,
  ADD COLUMN IF NOT EXISTS proposta_assinada_em timestamptz,
  ADD COLUMN IF NOT EXISTS reuniao_realizada_em timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_em timestamptz;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_origem_comercial_chk;
ALTER TABLE public.leads ADD CONSTRAINT leads_origem_comercial_chk
  CHECK (origem_comercial IS NULL OR origem_comercial IN ('live','diagnostico','outbound','indicacao','outros'));
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_tipo_conta_comercial_chk;
ALTER TABLE public.leads ADD CONSTRAINT leads_tipo_conta_comercial_chk
  CHECK (tipo_conta_comercial IS NULL OR tipo_conta_comercial IN ('imobiliaria','incorporadora','loteadora','outro'));
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_temperatura_chk;
ALTER TABLE public.leads ADD CONSTRAINT leads_temperatura_chk
  CHECK (temperatura IS NULL OR temperatura IN ('quente','morno','frio'));
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_numero_corretores_chk;
ALTER TABLE public.leads ADD CONSTRAINT leads_numero_corretores_chk
  CHECK (numero_corretores IS NULL OR numero_corretores >= 0);
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_mrr_proposta_chk;
ALTER TABLE public.leads ADD CONSTRAINT leads_mrr_proposta_chk
  CHECK (mrr_proposta IS NULL OR mrr_proposta >= 0);

-- Backfill somente quando a origem pode ser provada pelo identificador técnico.
UPDATE public.leads SET origem_comercial = CASE
  WHEN cnpj LIKE 'LIVE-%' THEN 'live'
  WHEN cnpj LIKE 'IND-%' THEN 'indicacao'
  WHEN cnpj LIKE 'FB-%' THEN 'diagnostico'
  WHEN cnpj ~ '^[0-9]' OR cnpj LIKE 'BITRIX-%' THEN 'outbound'
  ELSE origem_comercial
END
WHERE origem_comercial IS NULL
  AND (cnpj LIKE 'LIVE-%' OR cnpj LIKE 'IND-%' OR cnpj LIKE 'FB-%'
       OR cnpj ~ '^[0-9]' OR cnpj LIKE 'BITRIX-%');

-- Eventos anteriores só recebem data quando a etapa atual e stage_changed_at
-- comprovam o momento. Nenhuma data é inferida a partir de texto ou hipótese.
UPDATE public.leads
SET reuniao_realizada_em = stage_changed_at
WHERE estagio_funil = 'Diagnóstico Realizado'
  AND reuniao_realizada_em IS NULL
  AND stage_changed_at IS NOT NULL;

UPDATE public.leads
SET no_show_em = stage_changed_at
WHERE estagio_funil = 'No-show'
  AND no_show_em IS NULL
  AND stage_changed_at IS NOT NULL;

UPDATE public.leads
SET proposta_realizada_em = stage_changed_at
WHERE estagio_funil = 'Proposta Enviada'
  AND proposta_realizada_em IS NULL
  AND stage_changed_at IS NOT NULL;

UPDATE public.leads
SET proposta_aprovada_em = stage_changed_at
WHERE estagio_funil = 'Aguardando Aceite'
  AND proposta_aprovada_em IS NULL
  AND stage_changed_at IS NOT NULL;

UPDATE public.leads
SET proposta_assinada_em = stage_changed_at
WHERE estagio_funil = 'Aguardando Pagamento'
  AND proposta_assinada_em IS NULL
  AND stage_changed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crm_lead_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_cnpj text NOT NULL REFERENCES public.leads(cnpj) ON DELETE CASCADE,
  from_status_sdr text,
  to_status_sdr text,
  from_stage text,
  to_stage text,
  mrr_snapshot numeric(12,2),
  origem_comercial text,
  actor_id uuid,
  source text NOT NULL DEFAULT 'crm',
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_stage_history_changed
  ON public.crm_lead_stage_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_stage_history_lead
  ON public.crm_lead_stage_history(lead_cnpj, changed_at DESC);
ALTER TABLE public.crm_lead_stage_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_read_crm_stage_history ON public.crm_lead_stage_history;
CREATE POLICY authenticated_read_crm_stage_history ON public.crm_lead_stage_history
  FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.crm_lead_stage_history FROM anon, authenticated;
GRANT SELECT ON public.crm_lead_stage_history TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_track_commercial_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stage_changed boolean;
  v_status_changed boolean;
BEGIN
  v_stage_changed := OLD.estagio_funil IS DISTINCT FROM NEW.estagio_funil;
  v_status_changed := OLD.status_sdr IS DISTINCT FROM NEW.status_sdr;

  IF v_stage_changed THEN
    IF NEW.estagio_funil = 'Diagnóstico Realizado' AND NEW.reuniao_realizada_em IS NULL THEN
      NEW.reuniao_realizada_em := now();
    ELSIF NEW.estagio_funil = 'No-show' AND NEW.no_show_em IS NULL THEN
      NEW.no_show_em := now();
    ELSIF NEW.estagio_funil = 'Proposta Enviada' AND NEW.proposta_realizada_em IS NULL THEN
      NEW.proposta_realizada_em := now();
    ELSIF NEW.estagio_funil = 'Aguardando Aceite' AND NEW.proposta_aprovada_em IS NULL THEN
      NEW.proposta_aprovada_em := now();
    ELSIF NEW.estagio_funil = 'Aguardando Pagamento' AND NEW.proposta_assinada_em IS NULL THEN
      NEW.proposta_assinada_em := now();
    END IF;
  END IF;

  IF v_stage_changed OR v_status_changed THEN
    INSERT INTO public.crm_lead_stage_history (
      lead_cnpj, from_status_sdr, to_status_sdr, from_stage, to_stage,
      mrr_snapshot, origem_comercial, actor_id, source, changed_at
    ) VALUES (
      NEW.cnpj,
      OLD.status_sdr,
      NEW.status_sdr,
      OLD.estagio_funil,
      NEW.estagio_funil, NEW.mrr_proposta, NEW.origem_comercial, auth.uid(),
      CASE WHEN auth.uid() IS NULL THEN 'automation' ELSE 'crm' END, now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_track_commercial_stage ON public.leads;
CREATE TRIGGER trg_crm_track_commercial_stage
  BEFORE UPDATE OF status_sdr, estagio_funil ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_track_commercial_stage();

-- Snapshot inicial: deixa o estado atual auditável sem inventar a data histórica.
INSERT INTO public.crm_lead_stage_history (
  lead_cnpj, from_status_sdr, to_status_sdr, from_stage, to_stage,
  mrr_snapshot, origem_comercial, source, changed_at
)
SELECT l.cnpj, NULL, l.status_sdr, NULL, l.estagio_funil,
       l.mrr_proposta, l.origem_comercial, 'migration_snapshot', now()
FROM public.leads l
WHERE l.deleted_at IS NULL
  AND l.estagio_funil IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.crm_lead_stage_history h
    WHERE h.lead_cnpj = l.cnpj AND h.source = 'migration_snapshot'
  );

CREATE TABLE IF NOT EXISTS public.crm_channel_investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  origem_comercial text NOT NULL CHECK (origem_comercial IN ('live','diagnostico','outbound','indicacao','outros')),
  campaign_id text,
  campaign_name text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS idx_crm_investments_period
  ON public.crm_channel_investments(period_start, period_end, origem_comercial);
ALTER TABLE public.crm_channel_investments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manager_read_crm_investments ON public.crm_channel_investments;
CREATE POLICY manager_read_crm_investments ON public.crm_channel_investments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'manager'));
DROP POLICY IF EXISTS manager_write_crm_investments ON public.crm_channel_investments;
CREATE POLICY manager_write_crm_investments ON public.crm_channel_investments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));
REVOKE ALL ON public.crm_channel_investments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_channel_investments TO authenticated;

CREATE TABLE IF NOT EXISTS public.crm_whatsapp_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner text NOT NULL CHECK (owner IN ('guilherme','larissa')),
  chat_jid text NOT NULL,
  contact_name text,
  contact_phone text,
  lead_cnpj text REFERENCES public.leads(cnpj) ON DELETE SET NULL,
  classification text CHECK (classification IS NULL OR classification IN ('indicacao','lead_direto','cliente')),
  confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  crm_state text NOT NULL DEFAULT 'fora_crm' CHECK (crm_state IN ('fora_crm','no_crm','ignorado')),
  last_direction text CHECK (last_direction IS NULL OR last_direction IN ('in','out')),
  last_message_at timestamptz,
  waiting_reply_since timestamptz,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner, chat_jid)
);
CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_followups_waiting
  ON public.crm_whatsapp_followups(owner, waiting_reply_since DESC)
  WHERE waiting_reply_since IS NOT NULL;
ALTER TABLE public.crm_whatsapp_followups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manager_read_crm_whatsapp_followups ON public.crm_whatsapp_followups;
CREATE POLICY manager_read_crm_whatsapp_followups ON public.crm_whatsapp_followups
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'manager'));
DROP POLICY IF EXISTS manager_update_crm_whatsapp_followups ON public.crm_whatsapp_followups;
CREATE POLICY manager_update_crm_whatsapp_followups ON public.crm_whatsapp_followups
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));
REVOKE ALL ON public.crm_whatsapp_followups FROM anon;
GRANT SELECT, UPDATE ON public.crm_whatsapp_followups TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_commercial_dashboard(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_days integer := greatest(1, least(coalesce(p_days, 7), 365));
  v_from timestamptz;
  v_to timestamptz := now();
  v_start_date date;
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'manager') THEN
    RAISE EXCEPTION 'somente gerente pode acessar inteligencia comercial' USING ERRCODE = '42501';
  END IF;
  v_start_date := (now() AT TIME ZONE 'America/Sao_Paulo')::date - (v_days - 1);
  v_from := v_start_date::timestamp AT TIME ZONE 'America/Sao_Paulo';

  WITH
  investment_rows AS (
    SELECT i.origem_comercial,
      i.amount * (
        greatest(0, least(i.period_end, (v_to AT TIME ZONE 'America/Sao_Paulo')::date)
          - greatest(i.period_start, v_start_date) + 1)::numeric
        / greatest(1, i.period_end - i.period_start + 1)
      ) AS allocated_amount
    FROM public.crm_channel_investments i
    WHERE i.period_end >= v_start_date
      AND i.period_start <= (v_to AT TIME ZONE 'America/Sao_Paulo')::date
  ),
  investments AS (
    SELECT origem_comercial, coalesce(sum(allocated_amount), 0)::numeric AS spend
    FROM investment_rows GROUP BY origem_comercial
  ),
  qualified AS (
    SELECT DISTINCT h.lead_cnpj
    FROM public.crm_lead_stage_history h
    WHERE h.changed_at >= v_from
      AND h.source <> 'migration_snapshot'
      AND h.to_stage IN ('Diagnóstico Realizado','Proposta Enviada','Em Negociação','Aguardando Aceite','Aguardando Pagamento','Fechado Ganho')
  ),
  base AS (
    SELECT l.*, coalesce(l.origem_comercial, 'outros') AS source
    FROM public.leads l WHERE l.deleted_at IS NULL
  ),
  origin_keys AS (
    SELECT source AS origem FROM base WHERE created_at >= v_from
    UNION SELECT origem_comercial FROM investments
    UNION SELECT coalesce(l.origem_comercial, 'outros') FROM public.leads l JOIN qualified q ON q.lead_cnpj=l.cnpj
  ),
  origin_stats AS (
    SELECT k.origem,
      (SELECT count(*) FROM base b WHERE b.source=k.origem AND b.created_at >= v_from) AS leads_created,
      (SELECT count(*) FROM qualified q JOIN base b ON b.cnpj=q.lead_cnpj WHERE b.source=k.origem) AS qualified,
      (SELECT count(*) FROM base b WHERE b.source=k.origem AND b.estagio_funil='Fechado Ganho'
         AND coalesce(b.stage_changed_at, b.updated_at) >= v_from) AS closed,
      (SELECT coalesce(sum(b.mrr_proposta),0) FROM base b WHERE b.source=k.origem AND b.estagio_funil='Fechado Ganho'
         AND coalesce(b.stage_changed_at, b.updated_at) >= v_from) AS closed_mrr,
      coalesce((SELECT spend FROM investments i WHERE i.origem_comercial=k.origem),0) AS spend
    FROM origin_keys k
  ),
  stage_stats AS (
    SELECT estagio_funil AS stage, count(*) AS leads, coalesce(sum(mrr_proposta),0) AS mrr
    FROM base WHERE estagio_funil IS NOT NULL
    GROUP BY estagio_funil
  ),
  temperature_stats AS (
    SELECT coalesce(temperatura,'sem_classificar') AS temperature,
           count(*) AS leads, coalesce(sum(mrr_proposta),0) AS mrr
    FROM base
    WHERE estagio_funil IN ('Diagnóstico Realizado','Proposta Enviada','Em Negociação','Aguardando Aceite','Aguardando Pagamento')
    GROUP BY coalesce(temperatura,'sem_classificar')
  ),
  totals AS (
    SELECT
      (SELECT count(*) FROM base WHERE created_at >= v_from) AS leads_created,
      (SELECT count(*) FROM base WHERE data_reuniao_agendada >= v_from AND data_reuniao_agendada <= v_to) AS meetings_scheduled,
      (SELECT count(*) FROM base WHERE reuniao_realizada_em >= v_from AND reuniao_realizada_em <= v_to) AS meetings_held,
      (SELECT count(*) FROM base WHERE no_show_em >= v_from AND no_show_em <= v_to) AS no_shows,
      (SELECT count(*) FROM base WHERE estagio_funil='Fechado Ganho' AND coalesce(stage_changed_at,updated_at) >= v_from) AS closed,
      (SELECT coalesce(sum(mrr_proposta),0) FROM base WHERE estagio_funil='Fechado Ganho' AND coalesce(stage_changed_at,updated_at) >= v_from) AS closed_mrr,
      (SELECT coalesce(sum(mrr_proposta),0) FROM base WHERE estagio_funil IN ('Aguardando Aceite','Aguardando Pagamento')) AS approved_pipeline,
      (SELECT count(*) FROM qualified) AS qualified,
      (SELECT coalesce(sum(spend),0) FROM investments) AS spend,
      (SELECT count(*) FROM public.crm_whatsapp_followups WHERE owner='guilherme' AND waiting_reply_since IS NOT NULL) AS waiting_replies,
      (SELECT count(*) FROM public.crm_whatsapp_followups WHERE owner='guilherme' AND crm_state='fora_crm') AS outside_crm
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('days',v_days,'from',v_from,'to',v_to),
    'summary', jsonb_build_object(
      'leads_created', t.leads_created,
      'meetings_scheduled', t.meetings_scheduled,
      'meetings_held', t.meetings_held,
      'no_shows', t.no_shows,
      'closed', t.closed,
      'closed_mrr', t.closed_mrr,
      'approved_pipeline', t.approved_pipeline,
      'projected_mrr_80', round(t.approved_pipeline * 0.8, 2),
      'spend', t.spend,
      'qualified', t.qualified,
      'cost_per_qualified', CASE WHEN t.qualified > 0 THEN round(t.spend/t.qualified,2) END,
      'cost_per_close', CASE WHEN t.closed > 0 THEN round(t.spend/t.closed,2) END,
      'realized_payback_months', CASE WHEN t.closed_mrr > 0 THEN round(t.spend/t.closed_mrr,2) END,
      'projected_payback_months', CASE WHEN t.approved_pipeline > 0 THEN round(t.spend/(t.approved_pipeline*0.8),2) END,
      'waiting_replies', t.waiting_replies,
      'outside_crm', t.outside_crm
    ),
    'stages', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.stage) FROM stage_stats s),'[]'::jsonb),
    'temperatures', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.temperature) FROM temperature_stats x),'[]'::jsonb),
    'origins', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'origin',o.origem,'leads_created',o.leads_created,'qualified',o.qualified,
      'closed',o.closed,'closed_mrr',o.closed_mrr,'spend',o.spend,
      'cost_per_qualified',CASE WHEN o.qualified>0 THEN round(o.spend/o.qualified,2) END,
      'cost_per_close',CASE WHEN o.closed>0 THEN round(o.spend/o.closed,2) END
    ) ORDER BY o.origem) FROM origin_stats o),'[]'::jsonb)
  ) INTO v_result
  FROM totals t;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_commercial_dashboard(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_commercial_dashboard(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
