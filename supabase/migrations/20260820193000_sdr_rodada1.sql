-- ─────────────────────────────────────────────────────────────────────────────
-- Rodada SDR #1 — 2026-08-20
--
-- Contexto: a reunião de onboarding da SDR expôs erros no CRM. Investigando o
-- banco REAL (e não as migrations do repo, que divergem: a 20260817090000
-- nunca foi aplicada), as causas são:
--
--   1. updateLead() grava 3 colunas que NÃO EXISTEM (playbook_version,
--      pipeline_review_required, motivo_perda_detalhe) → todo "Salvar
--      qualificação" falha no PostgREST. Esta é a causa do erro relatado.
--   2. O front oferece status/estágios que o CHECK do banco rejeita
--      ("Em Qualificação", "Opt-out", "Diagnóstico Realizado", "No-show"…),
--      e não oferece "Prospectado" — que é como o facebook-webhook cria
--      TODO lead de campanha.
--   3. registrarReuniaoAgendada() grava origem/metadados em atividades,
--      colunas que também não existem.
--   4. O painel do dia é matematicamente vazio: get_cadencia_hoje exige
--      pesquisa_realizada=true AND lead_score>50 AND status_cadencia='ativo',
--      e os 112 leads quentes (53 LIVE / 45 FB / 14 REU) têm 0 em cada um.
--
-- Estratégia: resolver por ADIÇÃO. Nenhum dado dos 60k registros é reescrito,
-- nenhum valor legado deixa de ser aceito, o webhook continua gravando
-- "Prospectado". Idempotente — pode rodar de novo sem efeito.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Colunas que o front já usa e o banco não tinha ────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS playbook_version         text,
  ADD COLUMN IF NOT EXISTS pipeline_review_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_perda_detalhe     text,
  ADD COLUMN IF NOT EXISTS canal_preferido          text,
  ADD COLUMN IF NOT EXISTS ganho_override_motivo    text,
  -- evidência de agendamento real (preenchida pelo backend via Calendar, F3)
  ADD COLUMN IF NOT EXISTS meeting_event_id         text,
  ADD COLUMN IF NOT EXISTS data_reuniao_agendada    timestamptz,
  ADD COLUMN IF NOT EXISTS reuniao_url              text;

ALTER TABLE public.atividades
  ADD COLUMN IF NOT EXISTS origem    text,
  ADD COLUMN IF NOT EXISTS metadados jsonb;

-- ── 2. CHECKs alinhados com o vocabulário do front ───────────────────────────
-- Mantém TODOS os valores legados (60.179 leads em "Desqualificado" etc.)
-- e passa a aceitar os que a UI oferece.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_sdr_chk;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_sdr_chk CHECK (
  status_sdr = ANY (ARRAY[
    'A Contatar', 'Prospectado', 'Em Qualificação', 'Qualificado',
    'Reunião Agendada', 'Desqualificado', 'Nurturing', 'Opt-out',
    'Arquivo Morto', 'Cliente Ativo'
  ])
);

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_estagio_funil_chk;
ALTER TABLE public.leads ADD CONSTRAINT leads_estagio_funil_chk CHECK (
  estagio_funil IS NULL OR estagio_funil = ANY (ARRAY[
    'Reunião Agendada', 'Reunião Realizada', 'Diagnóstico Realizado', 'No-show',
    'Proposta Enviada', 'Aguardando Aceite', 'Negociação', 'Em Negociação',
    'Aguardando Pagamento', 'Fechado Ganho', 'Fechado Perdido',
    'Nurturing', 'Desqualificado', 'Opt-out'
  ])
);

-- ── 3. sales_tasks — a fila de trabalho do dia da SDR ────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_cnpj    text NOT NULL REFERENCES public.leads(cnpj) ON DELETE CASCADE,
  task_type    text NOT NULL CHECK (task_type IN ('pesquisar','ligar','followup','reuniao')),
  titulo       text,
  prioridade   integer NOT NULL DEFAULT 5,
  status       text NOT NULL DEFAULT 'pendente'
               CHECK (status IN ('pendente','concluida','cancelada')),
  due_at       timestamptz DEFAULT now(),
  responsavel  text,
  completed_at timestamptz,
  completed_by text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 1 tarefa pendente por tipo por lead: torna o gerador idempotente (roda a cada
-- abertura do painel sem duplicar). Concluir libera a geração do dia seguinte.
CREATE UNIQUE INDEX IF NOT EXISTS sales_tasks_pendente_uniq
  ON public.sales_tasks (lead_cnpj, task_type) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS sales_tasks_fila_idx
  ON public.sales_tasks (status, prioridade DESC, due_at) WHERE status = 'pendente';

ALTER TABLE public.sales_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_tasks_rw ON public.sales_tasks;
CREATE POLICY sales_tasks_rw ON public.sales_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 4. find_leads_similares — o "já existe na base?" que a SDR faz na mão ────
-- Normalização E.164 no mesmo espírito da view prospeccao_fila, mas varrendo a
-- base inteira (a view é filtrada por 4 praças e não serve para dedupe geral).
CREATE OR REPLACE FUNCTION public.find_leads_similares(
  p_fone text DEFAULT NULL,
  p_nome text DEFAULT NULL
)
RETURNS TABLE (
  cnpj text, fantasia text, razao_social text, cidade text, uf text,
  status_sdr text, estagio_funil text, celular1 text, telefone1 text,
  data_ultimo_contato timestamptz, match_tipo text, score real
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH alvo AS (
    SELECT right(regexp_replace(coalesce(p_fone, ''), '\D', '', 'g'), 8) AS fone8,
           nullif(btrim(coalesce(p_nome, '')), '')                       AS nome
  )
  SELECT l.cnpj, l.fantasia, l.razao_social, l.cidade, l.uf,
         l.status_sdr, l.estagio_funil, l.celular1, l.telefone1,
         l.data_ultimo_contato,
         CASE WHEN a.fone8 <> '' AND (
                   right(regexp_replace(coalesce(l.celular1,''),        '\D','','g'), 8) = a.fone8 OR
                   right(regexp_replace(coalesce(l.celular2,''),        '\D','','g'), 8) = a.fone8 OR
                   right(regexp_replace(coalesce(l.telefone1,''),       '\D','','g'), 8) = a.fone8 OR
                   right(regexp_replace(coalesce(l.telefone2,''),       '\D','','g'), 8) = a.fone8 OR
                   right(regexp_replace(coalesce(l.socio1_celular1,''), '\D','','g'), 8) = a.fone8 OR
                   right(regexp_replace(coalesce(l.socio1_telefone1,''),'\D','','g'), 8) = a.fone8
              ) THEN 'telefone' ELSE 'nome' END AS match_tipo,
         CASE WHEN a.nome IS NULL THEN 1.0::real
              ELSE greatest(similarity(coalesce(l.fantasia,''),      a.nome),
                            similarity(coalesce(l.razao_social,''),  a.nome)) END AS score
  FROM public.leads l CROSS JOIN alvo a
  WHERE (a.fone8 <> '' AND (
           right(regexp_replace(coalesce(l.celular1,''),        '\D','','g'), 8) = a.fone8 OR
           right(regexp_replace(coalesce(l.celular2,''),        '\D','','g'), 8) = a.fone8 OR
           right(regexp_replace(coalesce(l.telefone1,''),       '\D','','g'), 8) = a.fone8 OR
           right(regexp_replace(coalesce(l.telefone2,''),       '\D','','g'), 8) = a.fone8 OR
           right(regexp_replace(coalesce(l.socio1_celular1,''), '\D','','g'), 8) = a.fone8 OR
           right(regexp_replace(coalesce(l.socio1_telefone1,''),'\D','','g'), 8) = a.fone8))
     OR (a.nome IS NOT NULL AND length(a.nome) >= 4 AND (
           l.fantasia %> a.nome OR l.razao_social %> a.nome))
  ORDER BY 12 DESC, 11
  LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION public.find_leads_similares(text, text) TO authenticated;

-- Índices para o match por telefone não varrer 60k linhas a cada tecla digitada
CREATE INDEX IF NOT EXISTS leads_celular1_fone8_idx
  ON public.leads (right(regexp_replace(coalesce(celular1,''), '\D', '', 'g'), 8));
CREATE INDEX IF NOT EXISTS leads_telefone1_fone8_idx
  ON public.leads (right(regexp_replace(coalesce(telefone1,''), '\D', '', 'g'), 8));
CREATE INDEX IF NOT EXISTS leads_fantasia_trgm_idx
  ON public.leads USING gin (fantasia gin_trgm_ops);

-- ── 5. sdr_gerar_tarefas_hoje — enche o painel do dia ────────────────────────
-- Critérios próprios e explícitos. NÃO reusa get_cadencia_hoje de propósito:
-- aquela exige pesquisa_realizada + lead_score>50 + status_cadencia='ativo',
-- e nenhum lead quente atende (0 de 112) — é a razão de o painel estar vazio.
CREATE OR REPLACE FUNCTION public.sdr_gerar_tarefas_hoje(p_responsavel text DEFAULT NULL)
RETURNS TABLE (task_type text, criadas integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_pesquisar integer := 0;
  v_ligar     integer := 0;
  v_followup  integer := 0;
BEGIN
  -- PESQUISAR: lead quente que ninguém investigou ainda (a SDR abre Instagram/
  -- site/anúncios antes de falar). Concluir esta tarefa marca pesquisa_realizada,
  -- o que por sua vez habilita o lead na cadência da Larissa.
  WITH novos AS (
    SELECT l.cnpj,
           'Pesquisar ' || coalesce(l.fantasia, l.contato_nome, l.cnpj) AS titulo,
           CASE WHEN l.cnpj LIKE 'IND-%' THEN 9   -- indicação primeiro
                WHEN l.cnpj LIKE 'LIVE-%' THEN 8  -- inscrito na live: quente
                WHEN l.cnpj LIKE 'REU-%'  THEN 8
                ELSE 6 END AS prioridade
    FROM public.leads l
    WHERE coalesce(l.pesquisa_realizada, false) = false
      AND l.status_sdr IN ('A Contatar', 'Prospectado', 'Em Qualificação')
      AND (l.cnpj LIKE 'LIVE-%' OR l.cnpj LIKE 'FB-%' OR l.cnpj LIKE 'IND-%'
           OR l.cnpj LIKE 'REU-%' OR l.cnpj LIKE 'MAN-%')
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
    ORDER BY 3 DESC, l.data_proximo_passo NULLS FIRST
    LIMIT 40
  )
  INSERT INTO public.sales_tasks (lead_cnpj, task_type, titulo, prioridade, responsavel)
  SELECT cnpj, 'ligar', titulo, prioridade, p_responsavel FROM prontos
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_ligar = ROW_COUNT;

  -- FOLLOW-UP: conversa começada que venceu o prazo combinado.
  WITH vencidos AS (
    SELECT l.cnpj,
           'Follow-up ' || coalesce(l.fantasia, l.contato_nome, l.cnpj) AS titulo
    FROM public.leads l
    WHERE l.status_sdr IN ('Prospectado', 'Em Qualificação', 'Qualificado')
      AND l.data_proximo_passo IS NOT NULL
      AND l.data_proximo_passo <= now() - interval '1 day'
      AND coalesce(l.pesquisa_realizada, false) = true
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

COMMIT;
