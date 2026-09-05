-- Índice único que o upsert da aba Reunião realmente usa — 2026-08-21
--
-- O índice anterior era sobre a EXPRESSÃO coalesce(meeting_event_id,''), e o
-- Postgres não aceita isso como alvo de ON CONFLICT (lead_cnpj, meeting_event_id,
-- objecao_id) — erro 42P10 "no unique or exclusion constraint matching".
-- PG 15 permite NULLS NOT DISTINCT: duas linhas com event_id nulo passam a colidir
-- como se fossem iguais, que é o comportamento desejado (reunião sem evento na
-- agenda não pode duplicar a mesma objeção).

DROP INDEX IF EXISTS public.lead_objecoes_lead_evento_objecao_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS lead_objecoes_upsert_uidx
  ON public.lead_objecoes (lead_cnpj, meeting_event_id, objecao_id)
  NULLS NOT DISTINCT;
