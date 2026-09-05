-- ─────────────────────────────────────────────────────────────────────────────
-- Cadência SDR volta a mostrar lead novo — 2026-08-21
--
-- /manager/cadencia estava VAZIA. get_cadencia_hoje exigia:
--     pesquisa_realizada = true  AND  lead_score > 50
-- e a base tem ZERO leads com pesquisa marcada — ou seja, lead que entra hoje
-- (live, Facebook, WhatsApp, Instagram, indicação) nunca aparecia pra Larissa.
--
-- Pedido do CEO: "todo lead que entrar vire uma atividade para a Larissa".
-- Critério novo: está vivo no funil, não foi desqualificado, não tem reunião
-- marcada e o próximo passo já venceu (ou nem existe). Pesquisa e score deixam
-- de ser porteiro e viram só ordem de prioridade.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_cadencia_hoje(p_cidade text DEFAULT NULL)
RETURNS SETOF public.leads
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM public.leads
  WHERE (p_cidade IS NULL OR cidade = p_cidade)
    AND coalesce(status_cadencia, 'ativo') = 'ativo'
    AND status_sdr NOT IN (
      'Desqualificado', 'Desqualificado - Sem Perfil', 'Desqualificado - Sem Budget',
      'Desqualificado - Sem Interesse', 'Reunião Agendada', 'Opt-out',
      'Arquivo Morto', 'Cliente Ativo')
    AND estagio_funil IS NULL          -- quem já está com o closer sai da fila do SDR
    AND (data_proximo_passo IS NULL OR data_proximo_passo <= CURRENT_TIMESTAMP)
  ORDER BY
    -- lead de canal quente primeiro (indicação, live, reunião, Instagram, form)
    CASE
      WHEN cnpj LIKE 'IND-%'  THEN 1
      WHEN cnpj LIKE 'LIVE-%' THEN 2
      WHEN cnpj LIKE 'REU-%'  THEN 2
      WHEN cnpj LIKE 'IG-%'   THEN 3
      WHEN cnpj LIKE 'FB-%'   THEN 3
      WHEN cnpj LIKE 'WA-%'   THEN 3
      ELSE 5
    END,
    coalesce(pesquisa_realizada, false) DESC,   -- já pesquisado sobe
    lead_score DESC NULLS LAST,
    data_proximo_passo ASC NULLS FIRST
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.get_cadencia_hoje(text) TO authenticated;

-- "amanhã" segue a mesma regra, só que olhando pra frente
CREATE OR REPLACE FUNCTION public.get_cadencia_amanha(p_cidade text DEFAULT NULL)
RETURNS SETOF public.leads
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM public.leads
  WHERE (p_cidade IS NULL OR cidade = p_cidade)
    AND coalesce(status_cadencia, 'ativo') = 'ativo'
    AND status_sdr NOT IN (
      'Desqualificado', 'Desqualificado - Sem Perfil', 'Desqualificado - Sem Budget',
      'Desqualificado - Sem Interesse', 'Reunião Agendada', 'Opt-out',
      'Arquivo Morto', 'Cliente Ativo')
    AND estagio_funil IS NULL
    AND data_proximo_passo > CURRENT_TIMESTAMP
    AND data_proximo_passo < CURRENT_TIMESTAMP + interval '48 hours'
  ORDER BY data_proximo_passo ASC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.get_cadencia_amanha(text) TO authenticated;
