-- ─────────────────────────────────────────────────────────────────────────────
-- Destrava do CRM — 2026-08-21 (urgente, reportado pelo Guilherme)
--
-- Três causas do "tudo travado dando vários erros":
--   1. A RPC save_meeting_assessment_v2 NUNCA existiu no banco — todo "salvar
--      avaliação" da aba Reunião falhava na hora.
--   2. A tabela reunioes_avaliacao ficou no schema V1 (16 colunas); o front V2
--      envia fit_*/exec_*/meeting_event_id que não tinham onde cair.
--   3. 13 leads estavam em estagio_funil='Reunião Realizada' — vocabulário do
--      backend que o front não conhece: sumiam do quadro do closer e qualquer
--      transição a partir deles caía em regra de erro. O playbook chama esse
--      estágio de "Diagnóstico Realizado" — unificado aqui.
-- Aditivo e idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. reunioes_avaliacao ganha as colunas do V2 ─────────────────────────────
ALTER TABLE public.reunioes_avaliacao
  ADD COLUMN IF NOT EXISTS meeting_event_id     text,
  ADD COLUMN IF NOT EXISTS playbook_version     text,
  ADD COLUMN IF NOT EXISTS motivo_perda         text,
  ADD COLUMN IF NOT EXISTS motivo_perda_detalhe text,
  ADD COLUMN IF NOT EXISTS fit_icp              integer,
  ADD COLUMN IF NOT EXISTS fit_dor_impacto      integer,
  ADD COLUMN IF NOT EXISTS fit_processo_capacidade integer,
  ADD COLUMN IF NOT EXISTS fit_decisao          integer,
  ADD COLUMN IF NOT EXISTS fit_timing           integer,
  ADD COLUMN IF NOT EXISTS fit_score            integer,
  ADD COLUMN IF NOT EXISTS exec_diagnostico     integer,
  ADD COLUMN IF NOT EXISTS exec_escuta          integer,
  ADD COLUMN IF NOT EXISTS exec_confirmacao_entendimento integer,
  ADD COLUMN IF NOT EXISTS exec_solucao_ligada_dor integer,
  ADD COLUMN IF NOT EXISTS exec_transparencia_termos integer,
  ADD COLUMN IF NOT EXISTS exec_proximo_passo   integer,
  ADD COLUMN IF NOT EXISTS execution_score      integer;

ALTER TABLE public.reunioes_avaliacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reunioes_avaliacao_rw ON public.reunioes_avaliacao;
CREATE POLICY reunioes_avaliacao_rw ON public.reunioes_avaliacao
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 2. a RPC que a aba Reunião chama desde 17/08 e nunca existiu ─────────────
CREATE OR REPLACE FUNCTION public.save_meeting_assessment_v2(p_assessment jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_id uuid;
BEGIN
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
    p_assessment->>'lead_cnpj',
    coalesce((p_assessment->>'decisor_presente')::boolean, false),
    nullif(p_assessment->>'duracao_min','')::integer,
    nullif(p_assessment->>'fala_closer_faixa',''),
    coalesce((p_assessment->>'preco_apresentado')::boolean, false),
    nullif(p_assessment->>'preco_minuto','')::integer,
    (p_assessment->>'preco_tratado_na_hora')::boolean,
    coalesce((p_assessment->>'desconto_sem_contrapartida')::boolean, false),
    coalesce((SELECT array_agg(x) FROM jsonb_array_elements_text(
        coalesce(p_assessment->'gatilhos_avanco','[]'::jsonb)) AS t(x)), '{}'),
    nullif(p_assessment->>'desfecho',''),
    nullif(p_assessment->>'proximo_passo_data','')::date,
    nullif(p_assessment->>'obs',''),
    nullif(p_assessment->>'score','')::integer,
    coalesce(nullif(p_assessment->>'created_by',''),
             current_setting('request.jwt.claims', true)::jsonb->>'email'),
    nullif(p_assessment->>'meeting_event_id',''),
    nullif(p_assessment->>'playbook_version',''),
    nullif(p_assessment->>'motivo_perda',''),
    nullif(p_assessment->>'motivo_perda_detalhe',''),
    nullif(p_assessment->>'fit_icp','')::integer,
    nullif(p_assessment->>'fit_dor_impacto','')::integer,
    nullif(p_assessment->>'fit_processo_capacidade','')::integer,
    nullif(p_assessment->>'fit_decisao','')::integer,
    nullif(p_assessment->>'fit_timing','')::integer,
    nullif(p_assessment->>'fit_score','')::integer,
    nullif(p_assessment->>'exec_diagnostico','')::integer,
    nullif(p_assessment->>'exec_escuta','')::integer,
    nullif(p_assessment->>'exec_confirmacao_entendimento','')::integer,
    nullif(p_assessment->>'exec_solucao_ligada_dor','')::integer,
    nullif(p_assessment->>'exec_transparencia_termos','')::integer,
    nullif(p_assessment->>'exec_proximo_passo','')::integer,
    nullif(p_assessment->>'execution_score','')::integer
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_meeting_assessment_v2(jsonb) TO authenticated;

-- ── 3. unifica o vocabulário do estágio pós-reunião ──────────────────────────
UPDATE public.leads
   SET estagio_funil = 'Diagnóstico Realizado'
 WHERE estagio_funil = 'Reunião Realizada';

COMMIT;
