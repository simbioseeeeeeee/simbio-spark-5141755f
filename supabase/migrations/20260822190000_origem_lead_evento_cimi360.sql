-- ─────────────────────────────────────────────────────────────────────────────
-- origem_lead ganha o prefixo CIMI- => 'evento_cimi360' — 2026-08-22
--
-- Decisão do CEO (22/08): QR da camiseta no CIMI 360 (27-28/08, Riocentro) leva
-- ao WhatsApp de vendas; lead do evento nasce com codigo CIMI-<fone> e precisa
-- de origem própria pra meta de ≥2 vendas ser auditável.
--
-- origem_lead é coluna GERADA da expressão do prefixo de cnpj — Postgres não
-- altera expressão de generated column: é drop/re-add. Três views a leem
-- (lead_pontos_contato, vw_simbiose_funil_diario, comercial_painel_dia) e foram
-- dropadas/recriadas na MESMA transação (definições de pg_views, sem mudança).
-- Distribuição conferida antes/depois: idêntica (aditivo puro).
-- APLICADA em produção em 22/08 ~19h BRT com NOTIFY pgrst.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;
DROP VIEW IF EXISTS lead_pontos_contato;
DROP VIEW IF EXISTS vw_simbiose_funil_diario;
DROP VIEW IF EXISTS comercial_painel_dia;
ALTER TABLE public.leads DROP COLUMN origem_lead;
ALTER TABLE public.leads ADD COLUMN origem_lead text GENERATED ALWAYS AS (
  CASE
    WHEN cnpj LIKE 'BITRIX-%'       THEN 'bitrix_migrado'
    WHEN cnpj LIKE 'FB-%'           THEN 'facebook_ads'
    WHEN cnpj LIKE 'PENDENTE-%'     THEN 'whatsapp_entrante'
    WHEN cnpj LIKE 'CADENCE-TEST-%' THEN 'teste'
    WHEN cnpj LIKE 'TEST-%'         THEN 'teste'
    WHEN cnpj LIKE 'CIMI-%'         THEN 'evento_cimi360'
    WHEN cnpj LIKE 'WA-%'           THEN 'whatsapp_uchat'
    WHEN cnpj LIKE 'LIVE-%'         THEN 'live_simbiose'
    WHEN cnpj LIKE 'IG-%'           THEN 'instagram_manual'
    WHEN cnpj ~ '^[0-9]'            THEN 'receita_federal'
    ELSE 'outros'
  END) STORED;
-- (views recriadas aqui a partir das definições vigentes — ver produção)
COMMIT;
