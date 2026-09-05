-- Repara drift entre o frontend/backend comercial V2 e o schema efetivamente
-- publicado. São colunas aditivas; nenhum valor existente é reescrito.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS fit_score integer,
  ADD COLUMN IF NOT EXISTS fit_score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS execution_score integer,
  ADD COLUMN IF NOT EXISTS proposta_enviada_em timestamptz,
  ADD COLUMN IF NOT EXISTS pagamento_em timestamptz,
  ADD COLUMN IF NOT EXISTS ganho_override_por uuid,
  ADD COLUMN IF NOT EXISTS legacy_status_sdr text,
  ADD COLUMN IF NOT EXISTS legacy_estagio_funil text;

ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS proposta_enviada_em timestamptz,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'nao_iniciado',
  ADD COLUMN IF NOT EXISTS pagamento_em timestamptz;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_fit_score_v2_check;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_execution_score_v2_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_fit_score_v2_check CHECK (fit_score IS NULL OR fit_score BETWEEN 0 AND 100),
  ADD CONSTRAINT leads_execution_score_v2_check CHECK (execution_score IS NULL OR execution_score BETWEEN 0 AND 100);

-- A função publicada salvava a avaliação, mas não refletia scores, decisor,
-- próximo passo ou estágio no lead. Mantém event_id opcional para reuniões
-- antigas/tl;dv e faz avaliação + card numa única transação.
CREATE OR REPLACE FUNCTION public.save_meeting_assessment_v2(p_assessment jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_lead public.leads%ROWTYPE;
  v_outcome text := p_assessment->>'desfecho';
  v_next_step date := nullif(p_assessment->>'proximo_passo_data', '')::date;
  v_fit_icp integer := coalesce(nullif(p_assessment->>'fit_icp', '')::integer, 0);
  v_fit_dor integer := coalesce(nullif(p_assessment->>'fit_dor_impacto', '')::integer, 0);
  v_fit_processo integer := coalesce(nullif(p_assessment->>'fit_processo_capacidade', '')::integer, 0);
  v_fit_decisao integer := coalesce(nullif(p_assessment->>'fit_decisao', '')::integer, 0);
  v_fit_timing integer := coalesce(nullif(p_assessment->>'fit_timing', '')::integer, 0);
  v_exec_diagnostico integer := coalesce(nullif(p_assessment->>'exec_diagnostico', '')::integer, 0);
  v_exec_escuta integer := coalesce(nullif(p_assessment->>'exec_escuta', '')::integer, 0);
  v_exec_confirmacao integer := coalesce(nullif(p_assessment->>'exec_confirmacao_entendimento', '')::integer, 0);
  v_exec_solucao integer := coalesce(nullif(p_assessment->>'exec_solucao_ligada_dor', '')::integer, 0);
  v_exec_transparencia integer := coalesce(nullif(p_assessment->>'exec_transparencia_termos', '')::integer, 0);
  v_exec_proximo integer := coalesce(nullif(p_assessment->>'exec_proximo_passo', '')::integer, 0);
  v_fit_score integer;
  v_execution_score integer;
  v_target_stage text;
BEGIN
  IF nullif(p_assessment->>'lead_cnpj', '') IS NULL THEN
    RAISE EXCEPTION 'Avaliação exige lead_cnpj';
  END IF;
  IF v_outcome IS NULL OR v_outcome NOT IN ('fechou', 'proposta_pedida', 'proxima_marcada', 'perdido', 'no_show') THEN
    RAISE EXCEPTION 'Avaliação exige desfecho canônico';
  END IF;
  IF v_outcome <> 'perdido' AND v_next_step IS NULL THEN
    RAISE EXCEPTION 'Desfecho exige próximo passo com data';
  END IF;
  IF v_outcome = 'perdido' AND nullif(p_assessment->>'motivo_perda', '') IS NULL THEN
    RAISE EXCEPTION 'Perda exige motivo estruturado';
  END IF;
  IF v_outcome = 'perdido' AND p_assessment->>'motivo_perda' = 'outro'
     AND nullif(btrim(p_assessment->>'motivo_perda_detalhe'), '') IS NULL THEN
    RAISE EXCEPTION 'Motivo Outro exige explicação';
  END IF;
  IF v_fit_icp NOT BETWEEN 0 AND 20 OR v_fit_dor NOT BETWEEN 0 AND 25
     OR v_fit_processo NOT BETWEEN 0 AND 20 OR v_fit_decisao NOT BETWEEN 0 AND 20
     OR v_fit_timing NOT BETWEEN 0 AND 15 THEN
    RAISE EXCEPTION 'Componentes de fit fora dos limites';
  END IF;
  IF v_exec_diagnostico NOT BETWEEN 0 AND 25 OR v_exec_escuta NOT BETWEEN 0 AND 15
     OR v_exec_confirmacao NOT BETWEEN 0 AND 15 OR v_exec_solucao NOT BETWEEN 0 AND 15
     OR v_exec_transparencia NOT BETWEEN 0 AND 15 OR v_exec_proximo NOT BETWEEN 0 AND 15 THEN
    RAISE EXCEPTION 'Componentes de execução fora dos limites';
  END IF;

  SELECT * INTO v_lead FROM public.leads
  WHERE cnpj = p_assessment->>'lead_cnpj' AND deleted_at IS NULL
  FOR UPDATE;
  IF v_lead.cnpj IS NULL THEN RAISE EXCEPTION 'Lead não encontrado'; END IF;

  v_fit_score := v_fit_icp + v_fit_dor + v_fit_processo + v_fit_decisao + v_fit_timing;
  v_execution_score := v_exec_diagnostico + v_exec_escuta + v_exec_confirmacao
    + v_exec_solucao + v_exec_transparencia + v_exec_proximo;

  INSERT INTO public.reunioes_avaliacao (
    lead_cnpj, decisor_presente, duracao_min, fala_closer_faixa,
    preco_apresentado, preco_minuto, preco_tratado_na_hora,
    desconto_sem_contrapartida, gatilhos_avanco, desfecho,
    proximo_passo_data, obs, score, created_by,
    meeting_event_id, playbook_version, motivo_perda, motivo_perda_detalhe,
    fit_icp, fit_dor_impacto, fit_processo_capacidade, fit_decisao, fit_timing,
    fit_score, exec_diagnostico, exec_escuta, exec_confirmacao_entendimento,
    exec_solucao_ligada_dor, exec_transparencia_termos, exec_proximo_passo,
    execution_score
  ) VALUES (
    v_lead.cnpj,
    coalesce((p_assessment->>'decisor_presente')::boolean, false),
    nullif(p_assessment->>'duracao_min','')::integer,
    nullif(p_assessment->>'fala_closer_faixa',''),
    coalesce((p_assessment->>'preco_apresentado')::boolean, false),
    nullif(p_assessment->>'preco_minuto','')::integer,
    (p_assessment->>'preco_tratado_na_hora')::boolean,
    coalesce((p_assessment->>'desconto_sem_contrapartida')::boolean, false),
    coalesce((SELECT array_agg(x) FROM jsonb_array_elements_text(coalesce(p_assessment->'gatilhos_avanco','[]'::jsonb)) AS t(x)), '{}'),
    v_outcome, v_next_step, nullif(p_assessment->>'obs',''), v_execution_score,
    coalesce(nullif(p_assessment->>'created_by',''), current_setting('request.jwt.claims', true)::jsonb->>'email'),
    nullif(p_assessment->>'meeting_event_id',''), 'simbiose-sales-v2@2.1.0',
    nullif(p_assessment->>'motivo_perda',''), nullif(p_assessment->>'motivo_perda_detalhe',''),
    v_fit_icp, v_fit_dor, v_fit_processo, v_fit_decisao, v_fit_timing, v_fit_score,
    v_exec_diagnostico, v_exec_escuta, v_exec_confirmacao,
    v_exec_solucao, v_exec_transparencia, v_exec_proximo, v_execution_score
  ) RETURNING id INTO v_id;

  v_target_stage := CASE
    WHEN v_outcome = 'no_show' AND v_lead.estagio_funil = 'Reunião Agendada' THEN 'No-show'
    WHEN v_outcome = 'perdido' THEN 'Fechado Perdido'
    WHEN v_lead.estagio_funil = 'Reunião Agendada' THEN 'Diagnóstico Realizado'
    ELSE v_lead.estagio_funil
  END;

  UPDATE public.leads
  SET fit_score = v_fit_score,
      fit_score_breakdown = jsonb_build_object(
        'icp', v_fit_icp, 'dor_impacto', v_fit_dor,
        'processo_capacidade', v_fit_processo, 'decisao', v_fit_decisao, 'timing', v_fit_timing
      ),
      execution_score = v_execution_score,
      decisor_confirmado = coalesce((p_assessment->>'decisor_presente')::boolean, false),
      data_proximo_passo = v_next_step,
      motivo_perda = CASE WHEN v_outcome = 'perdido' THEN p_assessment->>'motivo_perda' ELSE motivo_perda END,
      motivo_perda_detalhe = CASE WHEN v_outcome = 'perdido' THEN nullif(p_assessment->>'motivo_perda_detalhe', '') ELSE motivo_perda_detalhe END,
      estagio_funil = v_target_stage,
      playbook_version = 'simbiose-sales-v2@2.1.0'
  WHERE cnpj = v_lead.cnpj;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_meeting_assessment_v2(jsonb) TO authenticated;
