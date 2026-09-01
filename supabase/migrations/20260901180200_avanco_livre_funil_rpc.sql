-- Avanço livre no funil de vendas (decisão CEO 01/09/2026).
-- Contexto: leads pagos/com reunião marcada travavam ("precisa do decisor") porque o
-- avanço de etapa exigia decisor/pagamento/oferta. O CEO pediu para remover TODA
-- obrigação de avançar etapa, MANTENDO as travas de ICP (3+ corretores) e
-- corretor-autônomo (que são do agendamento no backend, não deste RPC).
--
-- Só o RPC transition_sdr_status (usado pelo Kanban SDR) bloqueava no banco. Os
-- gates de estagio_funil eram 100% frontend (não há trigger validate_sales_stage_v2
-- em produção). Este RPC passa a aceitar QUALQUER status_sdr válido (o CHECK
-- leads_status_sdr_chk continua validando o vocabulário), mantendo apenas a fronteira
-- de AUTENTICAÇÃO (usuário logado com papel sdr/manager) e o registro de atividade.
--
-- Rollback: recriar a versão anterior (guardada em comentário no fim deste arquivo).

CREATE OR REPLACE FUNCTION public.transition_sdr_status(
  p_lead_cnpj text,
  p_target text,
  p_origin text DEFAULT 'crm'::text
)
RETURNS SETOF public.leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text;
  v_lead public.leads%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;
  SELECT ur.role::text INTO v_role FROM public.user_roles ur
  WHERE ur.user_id = auth.uid() AND ur.role IN ('sdr','manager')
  ORDER BY CASE ur.role WHEN 'manager' THEN 1 ELSE 2 END LIMIT 1;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Seu papel não permite mover o funil SDR.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE cnpj = p_lead_cnpj FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  -- Avanço livre: sem matriz de transições e sem trava de "já entregue ao closer".
  -- Qualquer status_sdr válido (CHECK leads_status_sdr_chk) é aceito.
  UPDATE public.leads
  SET status_sdr = p_target,
      playbook_version = 'simbiose-sales-v2@2.1.0'
  WHERE cnpj = v_lead.cnpj
  RETURNING * INTO v_lead;

  INSERT INTO public.atividades (
    lead_cnpj, tipo_atividade, resultado, nota, created_by,
    playbook_version, origem, canal, direcao, metadados
  ) VALUES (
    v_lead.cnpj, 'mudanca_status', 'sucesso',
    format('Status SDR alterado para %s.', p_target), auth.uid()::text,
    'simbiose-sales-v2@2.1.0', v_lead.origem_lead, 'crm', 'out',
    jsonb_build_object(
      'origin', left(coalesce(p_origin, 'crm'), 80),
      'actor_id', auth.uid()::text,
      'actor_role', v_role,
      'operation', 'transition_sdr_status'
    )
  );

  RETURN NEXT v_lead;
END;
$function$;

-- ── ROLLBACK (versão anterior, com matriz e trava de closer) ──────────────────
-- A versão de origem restringia: só A Contatar→Prospectado/Em Qualificação,
-- Prospectado→Em Qualificação; e bloqueava se estagio_funil não fosse nulo
-- ("O lead já foi entregue ao closer"). Para reverter, recriar com:
--   v_allowed := CASE v_lead.status_sdr
--     WHEN 'A Contatar' THEN ARRAY['Prospectado','Em Qualificação']
--     WHEN 'Prospectado' THEN ARRAY['Em Qualificação']
--     ELSE ARRAY[]::text[] END;
--   IF v_lead.estagio_funil IS NOT NULL THEN RAISE EXCEPTION 'O lead já foi entregue ao closer.' ...
--   IF NOT p_target = ANY(v_allowed) THEN RAISE EXCEPTION 'Esta transição exige abertura da ficha...' ...
