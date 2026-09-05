-- ─────────────────────────────────────────────────────────────────────────────
-- Gerador de tarefas da SDR v2 — 2026-08-21
--
-- Reportado pelo CEO: "os leads que estão entrando não estão caindo na cadência
-- do SDR". Duas causas medidas:
--   1. O filtro de origem listava prefixos (LIVE/FB/IND/REU/MAN) e esquecia
--      WA- (inbound WhatsApp) e IG- (Instagram) — esses leads NUNCA ganhavam
--      tarefa. Critério novo: qualquer cnpj sintético (não-numérico) é lead
--      quente; a base fria importada (cnpj numérico) continua fora.
--   2. O lote de 40 era selecionado ANTES de checar quem já tem tarefa — as
--      vagas eram desperdiçadas em conflitos e lead novo ficava de fora.
--      Agora o SELECT já exclui quem tem tarefa pendente.
-- (O cron de 30/30min no servidor passa a chamar a função — antes só o
--  navegador da SDR chamava, 1x/dia.)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sdr_gerar_tarefas_hoje(p_responsavel text DEFAULT NULL)
RETURNS TABLE (task_type text, criadas integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_pesquisar integer := 0;
  v_ligar     integer := 0;
  v_followup  integer := 0;
BEGIN
  -- PESQUISAR: lead quente (origem inbound = cnpj sintético) sem pesquisa.
  WITH novos AS (
    SELECT l.cnpj,
           'Pesquisar ' || coalesce(l.fantasia, l.contato_nome, l.cnpj) AS titulo,
           CASE WHEN l.cnpj LIKE 'IND-%' THEN 9
                WHEN l.cnpj LIKE 'LIVE-%' THEN 8
                WHEN l.cnpj LIKE 'REU-%'  THEN 8
                WHEN l.cnpj LIKE 'IG-%'   THEN 7
                ELSE 6 END AS prioridade
    FROM public.leads l
    WHERE coalesce(l.pesquisa_realizada, false) = false
      AND l.status_sdr IN ('A Contatar', 'Prospectado', 'Em Qualificação')
      AND l.cnpj !~ '^[0-9]'          -- base fria importada fica fora
      AND NOT EXISTS (SELECT 1 FROM public.sales_tasks t
                      WHERE t.lead_cnpj = l.cnpj
                        AND t.task_type = 'pesquisar'
                        AND t.status = 'pendente')
    ORDER BY 3 DESC, l.created_at DESC
    LIMIT 40
  )
  INSERT INTO public.sales_tasks (lead_cnpj, task_type, titulo, prioridade, responsavel)
  SELECT cnpj, 'pesquisar', titulo, prioridade, p_responsavel FROM novos
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_pesquisar = ROW_COUNT;

  -- LIGAR: já pesquisado e sem próximo passo futuro.
  WITH prontos AS (
    SELECT l.cnpj,
           'Ligar para ' || coalesce(l.fantasia, l.contato_nome, l.cnpj) AS titulo,
           CASE WHEN l.status_sdr = 'Qualificado' THEN 9 ELSE 7 END AS prioridade
    FROM public.leads l
    WHERE coalesce(l.pesquisa_realizada, false) = true
      AND l.status_sdr IN ('A Contatar', 'Prospectado', 'Em Qualificação', 'Qualificado')
      AND (l.data_proximo_passo IS NULL OR l.data_proximo_passo <= now())
      AND coalesce(l.celular1, l.telefone1, l.socio1_celular1) IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.sales_tasks t
                      WHERE t.lead_cnpj = l.cnpj
                        AND t.task_type = 'ligar'
                        AND t.status = 'pendente')
    ORDER BY 3 DESC, l.data_proximo_passo NULLS FIRST
    LIMIT 40
  )
  INSERT INTO public.sales_tasks (lead_cnpj, task_type, titulo, prioridade, responsavel)
  SELECT cnpj, 'ligar', titulo, prioridade, p_responsavel FROM prontos
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_ligar = ROW_COUNT;

  -- FOLLOW-UP: conversa começada com prazo vencido há 1+ dia.
  WITH vencidos AS (
    SELECT l.cnpj,
           'Follow-up ' || coalesce(l.fantasia, l.contato_nome, l.cnpj) AS titulo
    FROM public.leads l
    WHERE l.status_sdr IN ('Prospectado', 'Em Qualificação', 'Qualificado')
      AND l.data_proximo_passo IS NOT NULL
      AND l.data_proximo_passo <= now() - interval '1 day'
      AND coalesce(l.pesquisa_realizada, false) = true
      AND NOT EXISTS (SELECT 1 FROM public.sales_tasks t
                      WHERE t.lead_cnpj = l.cnpj
                        AND t.task_type = 'followup'
                        AND t.status = 'pendente')
    ORDER BY l.data_proximo_passo
    LIMIT 30
  )
  INSERT INTO public.sales_tasks (lead_cnpj, task_type, titulo, prioridade, responsavel)
  SELECT cnpj, 'followup', titulo, 8, p_responsavel FROM vencidos
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_followup = ROW_COUNT;

  RETURN QUERY
    SELECT 'pesquisar'::text, v_pesquisar
    UNION ALL SELECT 'ligar'::text, v_ligar
    UNION ALL SELECT 'followup'::text, v_followup;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sdr_gerar_tarefas_hoje(text) TO authenticated;
