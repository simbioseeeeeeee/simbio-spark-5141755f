-- ─────────────────────────────────────────────────────────────────────────────
-- motivo_perda: CHECK aceita o vocabulário do playbook V2 — 2026-08-23
--
-- "Erro ao salvar — violates check constraint leads_motivo_perda_chk" ao lançar
-- lead como Fechado Perdido: o front (types/lead.ts MotivoPerda) envia o
-- vocabulário do playbook V2 (sem_fit, prioridade_timing, investimento,
-- veto_decisor, concorrente, desistencia, outro) e o CHECK antigo só aceitava
-- o legado (preço, timing, concorrência, não respondeu, sem budget, outro).
-- Divergência já mapeada na W01/PIPELINE-SPEC §5.
--
-- Fix: CHECK vira a UNIÃO dos dois vocabulários — histórico intacto (16 linhas
-- 'não respondeu'), front desbloqueado. A CONSOLIDAÇÃO (migrar legado→V2 e
-- apertar o CHECK) segue como decisão REVIEW aberta na W01.
-- APLICADA em produção 23/08 ~22h45 UTC com NOTIFY pgrst; validada com
-- transação-rollback (V2 grava, valor inválido continua barrado).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.leads DROP CONSTRAINT leads_motivo_perda_chk;
ALTER TABLE public.leads ADD CONSTRAINT leads_motivo_perda_chk CHECK (
  motivo_perda IS NULL OR motivo_perda IN (
    'sem_fit','prioridade_timing','investimento','veto_decisor','concorrente','desistencia','outro',
    'preço','timing','concorrência','não respondeu','sem budget'
  ));
