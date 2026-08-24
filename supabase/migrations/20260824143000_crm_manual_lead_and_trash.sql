-- Cadastro manual e exclusao recuperavel de leads.
--
-- Nao usamos DELETE fisico: atividades, tarefas e cadencias possuem FKs com
-- CASCADE, enquanto outros artefatos comerciais referenciam o CNPJ sem FK.
-- A Lixeira retira o lead de toda operacao, preserva a prova e permite restaurar.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS deletion_reason text,
  ADD COLUMN IF NOT EXISTS deleted_previous_state jsonb;

CREATE INDEX IF NOT EXISTS idx_leads_deleted_at
  ON public.leads (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crm_lead_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_cnpj text NOT NULL,
  lead_name text,
  action text NOT NULL CHECK (action IN ('deleted', 'restored')),
  reason text,
  actor_id uuid NOT NULL,
  actor_email text,
  state_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_lead_deletion_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manager_read_lead_deletion_audit
  ON public.crm_lead_deletion_audit;
CREATE POLICY manager_read_lead_deletion_audit
  ON public.crm_lead_deletion_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

REVOKE INSERT, UPDATE, DELETE ON public.crm_lead_deletion_audit FROM anon, authenticated;
GRANT SELECT ON public.crm_lead_deletion_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_valid_cnpj(p_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v text := regexp_replace(coalesce(p_value, ''), '\D', '', 'g');
  v_sum integer;
  v_digit1 integer;
  v_digit2 integer;
  v_weights1 integer[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  v_weights2 integer[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
  i integer;
BEGIN
  IF length(v) <> 14 OR v ~ '^([0-9])\1{13}$' THEN
    RETURN false;
  END IF;
  v_sum := 0;
  FOR i IN 1..12 LOOP
    v_sum := v_sum + substr(v, i, 1)::integer * v_weights1[i];
  END LOOP;
  v_digit1 := CASE WHEN v_sum % 11 < 2 THEN 0 ELSE 11 - (v_sum % 11) END;
  IF v_digit1 <> substr(v, 13, 1)::integer THEN
    RETURN false;
  END IF;
  v_sum := 0;
  FOR i IN 1..13 LOOP
    v_sum := v_sum + substr(v, i, 1)::integer * v_weights2[i];
  END LOOP;
  v_digit2 := CASE WHEN v_sum % 11 < 2 THEN 0 ELSE 11 - (v_sum % 11) END;
  RETURN v_digit2 = substr(v, 14, 1)::integer;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_create_manual_lead(
  p_cnpj text,
  p_razao_social text,
  p_fantasia text DEFAULT NULL,
  p_contato_nome text DEFAULT NULL,
  p_celular text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_cidade text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_origem text DEFAULT 'outros',
  p_observacoes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := coalesce(auth.jwt() ->> 'email', 'crm');
  v_role text;
  v_actor_name text;
  v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  v_razao text := nullif(btrim(coalesce(p_razao_social, '')), '');
  v_phone text := regexp_replace(coalesce(p_celular, ''), '\D', '', 'g');
  v_origin text := coalesce(nullif(btrim(p_origem), ''), 'outros');
  v_row public.leads%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sessao expirada' USING ERRCODE = '42501';
  END IF;
  SELECT role::text, nullif(btrim(nome), '')
    INTO v_role, v_actor_name
  FROM public.user_roles
  WHERE user_id = v_actor
  LIMIT 1;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'usuario sem papel no CRM' USING ERRCODE = '42501';
  END IF;
  IF NOT public.crm_valid_cnpj(v_cnpj) THEN
    RAISE EXCEPTION 'CNPJ invalido';
  END IF;
  IF v_razao IS NULL OR length(v_razao) < 2 THEN
    RAISE EXCEPTION 'razao social obrigatoria';
  END IF;
  IF v_phone <> '' AND length(v_phone) NOT BETWEEN 10 AND 13 THEN
    RAISE EXCEPTION 'telefone deve ter entre 10 e 13 digitos';
  END IF;
  IF nullif(btrim(coalesce(p_email, '')), '') IS NOT NULL
     AND btrim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'email invalido';
  END IF;
  IF upper(coalesce(p_uf, '')) <> '' AND upper(btrim(p_uf)) !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'UF invalida';
  END IF;
  IF v_origin NOT IN (
    'receita_federal', 'bitrix_migrado', 'whatsapp_entrante', 'facebook_ads',
    'whatsapp_uchat', 'instagram_manual', 'live_simbiose', 'evento_cimi360',
    'teste', 'outros'
  ) THEN
    RAISE EXCEPTION 'origem de lead invalida';
  END IF;

  IF EXISTS (SELECT 1 FROM public.leads WHERE cnpj = v_cnpj AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'CNPJ esta na Lixeira; restaure o lead em vez de cadastrar novamente';
  END IF;
  IF EXISTS (SELECT 1 FROM public.leads WHERE cnpj = v_cnpj) THEN
    RAISE EXCEPTION 'CNPJ ja cadastrado';
  END IF;

  INSERT INTO public.leads (
    cnpj, razao_social, fantasia, contato_nome, celular1, email1, cidade, uf,
    observacoes_sdr, status_sdr, status_cadencia,
    responsavel_sdr, playbook_version
  ) VALUES (
    v_cnpj, v_razao, nullif(btrim(p_fantasia), ''), nullif(btrim(p_contato_nome), ''),
    nullif(v_phone, ''), lower(nullif(btrim(p_email), '')), nullif(btrim(p_cidade), ''),
    upper(nullif(btrim(p_uf), '')),
    nullif(btrim(p_observacoes), ''), 'A Contatar', 'ativo',
    CASE WHEN v_role = 'sdr' THEN coalesce(v_actor_name, v_email) ELSE NULL END,
    'simbiose-sales-v2@2.1.0'
  )
  RETURNING * INTO v_row;

  INSERT INTO public.atividades (
    lead_cnpj, tipo_atividade, resultado, nota, canal, direcao, created_by,
    origem, metadados, playbook_version
  ) VALUES (
    v_cnpj, 'nota', 'sucesso',
    format('Lead cadastrado manualmente por %s', v_email),
    'crm', 'out', v_email, 'cadastro_manual',
    jsonb_build_object('actor_id', v_actor, 'actor_role', v_role, 'origin', v_origin),
    'simbiose-sales-v2@2.1.0'
  );

  RETURN to_jsonb(v_row);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'CNPJ ja cadastrado';
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_soft_delete_lead(
  p_cnpj text,
  p_reason text,
  p_confirmation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := coalesce(auth.jwt() ->> 'email', 'crm');
  v_role text;
  v_lead public.leads%ROWTYPE;
  v_previous jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sessao expirada' USING ERRCODE = '42501';
  END IF;
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_actor LIMIT 1;
  IF v_role IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'somente gerente pode excluir leads' USING ERRCODE = '42501';
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'informe o motivo da exclusao';
  END IF;
  IF coalesce(p_confirmation, '') <> coalesce(p_cnpj, '') THEN
    RAISE EXCEPTION 'confirmacao do CNPJ nao confere';
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE cnpj = p_cnpj FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead nao encontrado';
  END IF;
  IF v_lead.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_deleted', true, 'cnpj', p_cnpj);
  END IF;
  IF v_lead.payment_status = 'pago' OR v_lead.estagio_funil = 'Fechado Ganho' THEN
    RAISE EXCEPTION 'cliente ganho ou pago nao pode ser excluido; use o fluxo de encerramento';
  END IF;
  IF v_lead.meeting_event_id IS NOT NULL
     OR (v_lead.data_reuniao_agendada IS NOT NULL AND v_lead.data_reuniao_agendada > now()) THEN
    RAISE EXCEPTION 'cancele a reuniao agendada antes de excluir o lead';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fechamentos WHERE lead_cnpj = p_cnpj) THEN
    RAISE EXCEPTION 'lead com fechamento comercial nao pode ser excluido';
  END IF;

  v_previous := jsonb_build_object(
    'status_sdr', v_lead.status_sdr,
    'estagio_funil', v_lead.estagio_funil,
    'status_cadencia', v_lead.status_cadencia,
    'data_proximo_passo', v_lead.data_proximo_passo
  );

  UPDATE public.leads
  SET deleted_at = now(), deleted_by = v_actor, deletion_reason = btrim(p_reason),
      deleted_previous_state = v_previous, status_sdr = 'Arquivo Morto',
      estagio_funil = NULL, status_cadencia = 'inativo', data_proximo_passo = NULL,
      updated_at = now()
  WHERE cnpj = p_cnpj;

  UPDATE public.sales_tasks
  SET status = 'cancelada', completed_at = now(), completed_by = v_actor
  WHERE lead_cnpj = p_cnpj AND status = 'pendente';

  UPDATE public.lead_cadence_assignments
  SET status = 'cancelled', stopped_at = now(), stop_reason = 'lead_deleted', updated_at = now()
  WHERE lead_cnpj = p_cnpj AND status IN ('active', 'paused');

  INSERT INTO public.atividades (
    lead_cnpj, tipo_atividade, resultado, nota, canal, direcao, created_by,
    origem, metadados, playbook_version
  ) VALUES (
    p_cnpj, 'nota', 'sucesso', format('Lead movido para a Lixeira por %s: %s', v_email, btrim(p_reason)),
    'crm', 'out', v_email, 'exclusao_manual',
    jsonb_build_object('actor_id', v_actor, 'previous_state', v_previous),
    'simbiose-sales-v2@2.1.0'
  );

  INSERT INTO public.crm_lead_deletion_audit (
    lead_cnpj, lead_name, action, reason, actor_id, actor_email, state_snapshot
  ) VALUES (
    p_cnpj, coalesce(v_lead.fantasia, v_lead.razao_social), 'deleted', btrim(p_reason),
    v_actor, v_email, v_previous
  );

  RETURN jsonb_build_object('ok', true, 'cnpj', p_cnpj, 'deleted_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_restore_deleted_lead(p_cnpj text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := coalesce(auth.jwt() ->> 'email', 'crm');
  v_role text;
  v_lead public.leads%ROWTYPE;
  v_status text;
  v_stage text;
BEGIN
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_actor LIMIT 1;
  IF v_actor IS NULL OR v_role IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'somente gerente pode restaurar leads' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_lead FROM public.leads WHERE cnpj = p_cnpj FOR UPDATE;
  IF NOT FOUND OR v_lead.deleted_at IS NULL THEN
    RAISE EXCEPTION 'lead nao esta na Lixeira';
  END IF;

  v_status := coalesce(v_lead.deleted_previous_state ->> 'status_sdr', 'A Contatar');
  v_stage := nullif(v_lead.deleted_previous_state ->> 'estagio_funil', '');
  UPDATE public.leads
  SET status_sdr = v_status, estagio_funil = v_stage,
      status_cadencia = 'pausada_handoff', data_proximo_passo = NULL,
      deleted_at = NULL, deleted_by = NULL, deletion_reason = NULL,
      deleted_previous_state = NULL, updated_at = now()
  WHERE cnpj = p_cnpj;

  INSERT INTO public.atividades (
    lead_cnpj, tipo_atividade, resultado, nota, canal, direcao, created_by,
    origem, metadados, playbook_version
  ) VALUES (
    p_cnpj, 'nota', 'sucesso', format('Lead restaurado da Lixeira por %s; automacao permanece pausada', v_email),
    'crm', 'out', v_email, 'restauracao_manual',
    jsonb_build_object('actor_id', v_actor), 'simbiose-sales-v2@2.1.0'
  );

  INSERT INTO public.crm_lead_deletion_audit (
    lead_cnpj, lead_name, action, actor_id, actor_email, state_snapshot
  ) VALUES (
    p_cnpj, coalesce(v_lead.fantasia, v_lead.razao_social), 'restored',
    v_actor, v_email, coalesce(v_lead.deleted_previous_state, '{}'::jsonb)
  );
  RETURN jsonb_build_object('ok', true, 'cnpj', p_cnpj, 'automation_paused', true);
END;
$$;

REVOKE ALL ON FUNCTION public.crm_create_manual_lead(text,text,text,text,text,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_soft_delete_lead(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_restore_deleted_lead(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_create_manual_lead(text,text,text,text,text,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_soft_delete_lead(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_restore_deleted_lead(text) TO authenticated;

COMMENT ON FUNCTION public.crm_soft_delete_lead(text,text,text) IS
  'Manager-only recoverable deletion. Cancels pending work and preserves audit/history.';
