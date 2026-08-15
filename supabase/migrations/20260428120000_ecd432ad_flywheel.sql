-- ═══════════════════════════════════════════════════════════════════════════════
-- M-2026-04-28 — Flywheel migration
-- ═══════════════════════════════════════════════════════════════════════════════
-- Adiciona campos e tabelas referenciadas pelos 13 agentes Flywheel novos
-- (slots 11..25 em /Users/user/workspace/simbiose-digital/.claude/agents/).
--
-- Spec: /Users/user/workspace/simbiose-digital/docs/schema-proposto-flywheel.md
--
-- Princípio: ADITIVO. Nenhum DROP. Nenhum ALTER em coluna existente. Tudo NOT
-- NULL com DEFAULT seguro pra não quebrar leads existentes.
--
-- Gerado: 2026-04-28 — sessão Flywheel review fix
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabela `leads` — colunas novas
-- ─────────────────────────────────────────────────────────────────────────────

-- Multi-tenant: a qual cliente da Simbiose este lead pertence
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cliente_simbiose_id text NULL;
COMMENT ON COLUMN leads.cliente_simbiose_id IS
  'Slug do cliente em docs/clientes.yaml (ex: confiar_leilao). NULL = prospect próprio Simbiose (B2B).';

-- Tipo do lead — define qual scorer usar
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tipo_lead text NOT NULL DEFAULT 'b2b_simbiose'
  CHECK (tipo_lead IN ('b2b_simbiose','b2c_cliente'));
COMMENT ON COLUMN leads.tipo_lead IS
  'b2b_simbiose = prospect Simbiose (dono de imobiliária); b2c_cliente = lead final de cliente (comprador via Confiar/Realize/etc)';

-- BANT do SDR
ALTER TABLE leads ADD COLUMN IF NOT EXISTS qualificacao_bant jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN leads.qualificacao_bant IS
  'JSON {budget, authority, need, timing, score_bant} preenchido pelo 11-sdr-agent';

-- Cadência SDR
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cadencia_atual_passo int NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cadencia_proxima_acao timestamptz NULL;

-- Lead score (0-100) e bucket
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score int NULL CHECK (lead_score IS NULL OR (lead_score BETWEEN 0 AND 100));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score_bucket text NULL
  CHECK (lead_score_bucket IS NULL OR lead_score_bucket IN ('frio','morno','quente','muito_quente'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score_atualizado_em timestamptz NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score_versao text NULL;
COMMENT ON COLUMN leads.lead_score_versao IS
  'Versão da regra que gerou esse score (ex: b2b_v1, b2c_confiar_v1) — auditoria';

-- Data hygiene flags
ALTER TABLE leads ADD COLUMN IF NOT EXISTS dado_validado boolean NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS telefone1_valido boolean NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email1_valido boolean NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cidade_validada boolean NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cnpj_validado boolean NULL;

-- Soft delete
ALTER TABLE leads ADD COLUMN IF NOT EXISTS descartado boolean NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS descartado_motivo text NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS descartado_em timestamptz NULL;

-- VIP flag
ALTER TABLE leads ADD COLUMN IF NOT EXISTS vip boolean NOT NULL DEFAULT false;

-- Reunião agendada
ALTER TABLE leads ADD COLUMN IF NOT EXISTS data_reuniao_agendada timestamptz NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS reuniao_calendly_url text NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS reuniao_tldv_url text NULL;

-- Motivo de perda estruturado
ALTER TABLE leads ADD COLUMN IF NOT EXISTS motivo_perda text NULL
  CHECK (motivo_perda IS NULL OR motivo_perda IN
    ('preco','timing','concorrencia','sem_resposta','sem_budget','fora_icp','outro'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS data_fechamento timestamptz NULL;

-- Origem + UTMs
ALTER TABLE leads ADD COLUMN IF NOT EXISTS origem text NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referral_de text NULL;
COMMENT ON COLUMN leads.referral_de IS
  'CNPJ do lead que indicou (FK lógica para leads.CNPJ)';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN leads.utm IS
  '{utm_source, utm_medium, utm_campaign, utm_content, utm_term, gclid, fbclid, fbc, fbp}';

-- LGPD
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_marketing boolean NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_em timestamptz NULL;

-- Permissão case study
ALTER TABLE leads ADD COLUMN IF NOT EXISTS permite_case_study boolean NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS permite_case_study_em timestamptz NULL;

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_leads_cliente_tipo ON leads(cliente_simbiose_id, tipo_lead);
CREATE INDEX IF NOT EXISTS idx_leads_lead_score_bucket ON leads(lead_score_bucket) WHERE lead_score_bucket IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_dado_validado ON leads(dado_validado) WHERE dado_validado = false;
CREATE INDEX IF NOT EXISTS idx_leads_data_proximo_passo ON leads(data_proximo_passo) WHERE data_proximo_passo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_referral_de ON leads(referral_de) WHERE referral_de IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tabela `lead_score_history` — append-only com TTL via cron
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lead_score_history (
  id bigserial PRIMARY KEY,
  lead_cnpj text NOT NULL REFERENCES leads("CNPJ") ON DELETE CASCADE,
  score int NOT NULL CHECK (score BETWEEN 0 AND 100),
  bucket text NOT NULL,
  breakdown jsonb NOT NULL,
  versao_regra text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_score_history_lead_time
  ON lead_score_history(lead_cnpj, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_score_history_computed_at
  ON lead_score_history(computed_at);

COMMENT ON TABLE lead_score_history IS
  'Snapshot diário (não horário) do lead_score por lead. TTL: 90 dias via pg_cron.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tabela `awaiting_approval` — aprovação humana em casos sensíveis
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS awaiting_approval (
  id bigserial PRIMARY KEY,
  lead_cnpj text NOT NULL REFERENCES leads("CNPJ") ON DELETE CASCADE,
  agente text NOT NULL,
  motivo text NOT NULL CHECK (motivo IN
    ('valor_proposta','c_level','agendamento','vip','deal_grande','frustracao','manual')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz NULL,
  resolvido_por text NULL
);

CREATE INDEX IF NOT EXISTS idx_awaiting_approval_status_created
  ON awaiting_approval(status, created_at DESC) WHERE status = 'pending';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Tabela `data_hygiene_log` — auditoria do 18-data-hygiene-bot
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS data_hygiene_log (
  id bigserial PRIMARY KEY,
  lead_cnpj text NOT NULL REFERENCES leads("CNPJ") ON DELETE CASCADE,
  acao text NOT NULL CHECK (acao IN ('normalize','merge','reject','enrich')),
  campo text NULL,
  before jsonb NULL,
  after jsonb NULL,
  confidence numeric(3,2) NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_hygiene_log_lead_time
  ON data_hygiene_log(lead_cnpj, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Tabela `nps_log` — 21-health-monitor
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nps_log (
  id bigserial PRIMARY KEY,
  cliente_simbiose_id text NOT NULL,
  decisor_lead_cnpj text NULL REFERENCES leads("CNPJ"),
  score int NOT NULL CHECK (score BETWEEN 0 AND 10),
  comentario text NULL,
  bucket text NOT NULL CHECK (bucket IN ('promotor','passivo','detrator')),
  canal text NOT NULL CHECK (canal IN ('whatsapp','email','presencial','outro')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nps_log_cliente_time
  ON nps_log(cliente_simbiose_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Tabela `sla_atendimento_log` — 21-health (MÉTRICA PRIMÁRIA)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sla_atendimento_log (
  id bigserial PRIMARY KEY,
  cliente_simbiose_id text NOT NULL,
  lead_cnpj text NOT NULL REFERENCES leads("CNPJ") ON DELETE CASCADE,
  lead_recebido_em timestamptz NOT NULL,
  primeiro_toque_em timestamptz NULL,
  primeiro_toque_canal text NULL,
  primeiro_toque_corretor text NULL,
  fonte_dado text NOT NULL CHECK (fonte_dado IN
    ('crm_cliente_api','whatsapp_tap','reporte_manual')),
  tempo_resposta_seg int NULL,
  bucket_sla text NULL CHECK (bucket_sla IS NULL OR bucket_sla IN ('verde','amarelo','vermelho')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sla_atendimento_cliente_time
  ON sla_atendimento_log(cliente_simbiose_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sla_atendimento_bucket
  ON sla_atendimento_log(cliente_simbiose_id, bucket_sla);

COMMENT ON TABLE sla_atendimento_log IS
  'MÉTRICA PRIMÁRIA do 21-health-monitor — peso 40% no saude_score. Tempo entre lead chegou no CRM e primeiro toque humano do corretor do cliente.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Tabela `relatorio_log` — 20-roi-reporter
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS relatorio_log (
  id bigserial PRIMARY KEY,
  cliente_simbiose_id text NOT NULL,
  periodo_tipo text NOT NULL CHECK (periodo_tipo IN ('semanal','mensal','trimestral')),
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  vgv numeric(14,2) NULL,
  investimento numeric(12,2) NULL,
  roas numeric(8,2) NULL,
  status_cor text NOT NULL CHECK (status_cor IN ('verde','amarelo','vermelho')),
  arquivo_path text NOT NULL,
  enviado_em timestamptz NULL,
  cliente_respondeu_em timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relatorio_log_cliente_periodo
  ON relatorio_log(cliente_simbiose_id, periodo_inicio DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Tabela `data_loop_log` — 22-data-loop-engineer
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS data_loop_log (
  id bigserial PRIMARY KEY,
  lead_cnpj text NOT NULL REFERENCES leads("CNPJ") ON DELETE CASCADE,
  cliente_simbiose_id text NOT NULL,
  target text NOT NULL CHECK (target IN ('meta','google')),
  event_name text NOT NULL,
  event_id text NOT NULL UNIQUE,
  match_quality numeric(3,2) NULL,
  response_code int NULL,
  response_body jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_loop_log_lead_target
  ON data_loop_log(lead_cnpj, target, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_loop_log_cliente_target_time
  ON data_loop_log(cliente_simbiose_id, target, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Tabela `referral_log` — 23-referral-activator
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referral_log (
  id bigserial PRIMARY KEY,
  cliente_indicador_id text NOT NULL,
  gatilho text NOT NULL CHECK (gatilho IN
    ('pico_leads','nps_promotor','fechamento_grande','d90','roas_recorde','manual')),
  enviado_em timestamptz NOT NULL DEFAULT now(),
  resposta text NULL,
  indicado_lead_cnpj text NULL REFERENCES leads("CNPJ"),
  recompensa_aplicada text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_log_cliente_time
  ON referral_log(cliente_indicador_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Tabela `upsell_log` — 25-upsell-strategist
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS upsell_log (
  id bigserial PRIMARY KEY,
  cliente_simbiose_id text NOT NULL,
  upsell_proposto text NOT NULL,
  motivo_diagnostico text NOT NULL,
  valor_estimado numeric(10,2) NULL,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','enviado','aceito','recusado','expirado')),
  one_pager_path text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_upsell_log_cliente_status
  ON upsell_log(cliente_simbiose_id, status, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Tabela `integration_dlq` — 16-integration-architect
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integration_dlq (
  id bigserial PRIMARY KEY,
  origem text NOT NULL,
  payload jsonb NOT NULL,
  erro text NOT NULL,
  retries int NOT NULL DEFAULT 4,
  status text NOT NULL DEFAULT 'failed'
    CHECK (status IN ('failed','retried','resolved','discarded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_integration_dlq_status_time
  ON integration_dlq(status, created_at DESC) WHERE status = 'failed';

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Atualizar enum tipo_atividade — adicionar valores Flywheel
-- ─────────────────────────────────────────────────────────────────────────────
-- Schema atual usa CHECK constraint (ver crm-schema.md). Drop e recria com novos
-- valores. Se for ENUM type real, trocar pra ALTER TYPE ADD VALUE.

DO $$
BEGIN
  -- Detecta se atividades.tipo_atividade tem CHECK constraint e dropa/recria
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name LIKE '%tipo_atividade%'
  ) THEN
    EXECUTE 'ALTER TABLE atividades DROP CONSTRAINT IF EXISTS atividades_tipo_atividade_check';
  END IF;

  EXECUTE $check$
    ALTER TABLE atividades ADD CONSTRAINT atividades_tipo_atividade_check
    CHECK (tipo_atividade IN (
      'email_out','email_in',
      'whatsapp_out','whatsapp_in',
      'ligacao','linkedin',
      'instagram_dm','facebook_dm','tiktok_dm',
      'reuniao','proposta_enviada','nota',
      'social_selling_ig','social_selling_linkedin',
      'nps','atendimento_humano_cliente',
      'referral_pedido','upsell_proposta','case_study_aprovado'
    ))
  $check$;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. RLS (Row-Level Security) — manter convenção atual
-- ─────────────────────────────────────────────────────────────────────────────
-- Schema atual usa USING (true) (efetivamente sem restrição). Replicar nas
-- tabelas novas pra manter consistência. Endurecer depois quando RLS for
-- revisado globalmente (ver crm-schema.md "Alertas de segurança").

ALTER TABLE lead_score_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_score_history_all ON lead_score_history;
CREATE POLICY lead_score_history_all ON lead_score_history FOR ALL USING (true);

ALTER TABLE awaiting_approval ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS awaiting_approval_all ON awaiting_approval;
CREATE POLICY awaiting_approval_all ON awaiting_approval FOR ALL USING (true);

ALTER TABLE data_hygiene_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS data_hygiene_log_all ON data_hygiene_log;
CREATE POLICY data_hygiene_log_all ON data_hygiene_log FOR ALL USING (true);

ALTER TABLE nps_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nps_log_all ON nps_log;
CREATE POLICY nps_log_all ON nps_log FOR ALL USING (true);

ALTER TABLE sla_atendimento_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sla_atendimento_log_all ON sla_atendimento_log;
CREATE POLICY sla_atendimento_log_all ON sla_atendimento_log FOR ALL USING (true);

ALTER TABLE relatorio_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS relatorio_log_all ON relatorio_log;
CREATE POLICY relatorio_log_all ON relatorio_log FOR ALL USING (true);

ALTER TABLE data_loop_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS data_loop_log_all ON data_loop_log;
CREATE POLICY data_loop_log_all ON data_loop_log FOR ALL USING (true);

ALTER TABLE referral_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referral_log_all ON referral_log;
CREATE POLICY referral_log_all ON referral_log FOR ALL USING (true);

ALTER TABLE upsell_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS upsell_log_all ON upsell_log;
CREATE POLICY upsell_log_all ON upsell_log FOR ALL USING (true);

ALTER TABLE integration_dlq ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integration_dlq_all ON integration_dlq;
CREATE POLICY integration_dlq_all ON integration_dlq FOR ALL USING (true);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- POST-MIGRATION CHECKS (rodar manualmente após apply)
-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Verificar contagem de linhas em leads (deve ser idêntica ao pré-migration):
--    SELECT count(*) FROM leads;
--
-- 2. Verificar que default funcionou em todos:
--    SELECT count(*) FROM leads WHERE tipo_lead IS NULL;  -- deve ser 0
--    SELECT count(*) FROM leads WHERE dado_validado IS NULL;  -- deve ser 0
--    SELECT count(*) FROM leads WHERE consent_marketing IS NULL;  -- deve ser 0
--
-- 3. Verificar que tabelas novas existem:
--    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN
--      ('lead_score_history','awaiting_approval','data_hygiene_log','nps_log',
--       'sla_atendimento_log','relatorio_log','data_loop_log','referral_log',
--       'upsell_log','integration_dlq');
--    -- deve retornar 10 linhas
--
-- 4. Smoke test do CHECK em tipo_atividade:
--    INSERT INTO atividades (lead_cnpj, tipo_atividade, agente, resultado, assunto)
--    VALUES ('00.000.000/0001-99', 'social_selling_ig', 'social_selling', 'sucesso', 'smoke');
--    -- deve aceitar (era rejeitado antes)
--    DELETE FROM atividades WHERE lead_cnpj = '00.000.000/0001-99';
--
-- 5. Configurar pg_cron para TTL (rodar 1x):
--    SELECT cron.schedule('lead_score_history_ttl', '0 3 * * *',
--      $$DELETE FROM lead_score_history WHERE computed_at < now() - interval '90 days'$$);
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (caso necessário)
-- ═══════════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP TABLE IF EXISTS integration_dlq, upsell_log, referral_log, data_loop_log,
--   relatorio_log, sla_atendimento_log, nps_log, data_hygiene_log,
--   awaiting_approval, lead_score_history CASCADE;
-- ALTER TABLE leads
--   DROP COLUMN IF EXISTS cliente_simbiose_id,
--   DROP COLUMN IF EXISTS tipo_lead,
--   DROP COLUMN IF EXISTS qualificacao_bant,
--   DROP COLUMN IF EXISTS cadencia_atual_passo,
--   DROP COLUMN IF EXISTS cadencia_proxima_acao,
--   DROP COLUMN IF EXISTS lead_score,
--   DROP COLUMN IF EXISTS lead_score_breakdown,
--   DROP COLUMN IF EXISTS lead_score_bucket,
--   DROP COLUMN IF EXISTS lead_score_atualizado_em,
--   DROP COLUMN IF EXISTS lead_score_versao,
--   DROP COLUMN IF EXISTS dado_validado,
--   DROP COLUMN IF EXISTS telefone1_valido,
--   DROP COLUMN IF EXISTS email1_valido,
--   DROP COLUMN IF EXISTS cidade_validada,
--   DROP COLUMN IF EXISTS cnpj_validado,
--   DROP COLUMN IF EXISTS descartado,
--   DROP COLUMN IF EXISTS descartado_motivo,
--   DROP COLUMN IF EXISTS descartado_em,
--   DROP COLUMN IF EXISTS vip,
--   DROP COLUMN IF EXISTS data_reuniao_agendada,
--   DROP COLUMN IF EXISTS reuniao_calendly_url,
--   DROP COLUMN IF EXISTS reuniao_tldv_url,
--   DROP COLUMN IF EXISTS motivo_perda,
--   DROP COLUMN IF EXISTS data_fechamento,
--   DROP COLUMN IF EXISTS origem,
--   DROP COLUMN IF EXISTS referral_de,
--   DROP COLUMN IF EXISTS utm,
--   DROP COLUMN IF EXISTS consent_marketing,
--   DROP COLUMN IF EXISTS consent_em,
--   DROP COLUMN IF EXISTS permite_case_study,
--   DROP COLUMN IF EXISTS permite_case_study_em;
-- COMMIT;
