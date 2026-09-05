-- lead_objecoes ganha as colunas que a aba Reunião grava — 2026-08-21
--
-- Mesma família do erro de `atividades.playbook_version`: o front (marcarObjecao)
-- envia meeting_event_id + playbook_version e faz upsert com
-- onConflict "lead_cnpj,meeting_event_id,objecao_id" — nada disso existia no banco.
-- Efeito: marcar objeção na reunião falhava sempre, e a matriz de objeções (o
-- passo 4 do framework do playbook) nunca recebia dado real.

ALTER TABLE public.lead_objecoes
  ADD COLUMN IF NOT EXISTS meeting_event_id text,
  ADD COLUMN IF NOT EXISTS playbook_version text;

-- o upsert precisa de um índice único que cubra exatamente essas 3 colunas.
-- COALESCE porque reunião sem evento na agenda (tl;dv, legado) tem event_id nulo
-- e ainda assim não pode duplicar a mesma objeção.
CREATE UNIQUE INDEX IF NOT EXISTS lead_objecoes_lead_evento_objecao_uidx
  ON public.lead_objecoes (lead_cnpj, coalesce(meeting_event_id, ''), objecao_id);

COMMENT ON COLUMN public.lead_objecoes.meeting_event_id IS
  'Evento da agenda em que a objeção apareceu — liga a objeção à reunião específica.';
