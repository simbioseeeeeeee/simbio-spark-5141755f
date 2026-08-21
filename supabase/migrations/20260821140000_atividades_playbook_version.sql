-- Atividades: coluna de auditoria do playbook — 2026-08-21
--
-- "Could not find the 'playbook_version' column of 'atividades'": o front grava
-- a versão do playbook vigente em toda atividade (registrarAtividade e
-- registrarReuniaoAgendada) desde o V2, mas a coluna só foi criada em `leads`.
-- Resultado: registrar atividade concluída falhava sempre.
-- Aditivo: preserva a auditoria que o playbook V2 pediu.

ALTER TABLE public.atividades
  ADD COLUMN IF NOT EXISTS playbook_version text;

COMMENT ON COLUMN public.atividades.playbook_version IS
  'Versão do playbook comercial vigente quando a atividade foi registrada (ex.: simbiose-sales-v2@2.1.0).';
