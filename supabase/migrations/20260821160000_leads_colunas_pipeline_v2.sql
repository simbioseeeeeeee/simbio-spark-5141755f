-- ─────────────────────────────────────────────────────────────────────────────
-- Colunas do pipeline V2 que faltavam em `leads` — 2026-08-21
--
-- "Movimentação bloqueada pelo playbook V2 — Could not find the
--  'oferta_comercial' column of 'leads'": mover card no pipeline do closer
-- falhava. O playbook V2 inteiro (oferta cotada, aceite do termo, status de
-- pagamento, override gerencial, no-show, tempo em etapa) foi escrito no front e
-- no backend, mas SETE colunas nunca chegaram ao banco de produção.
--
-- Efeito de cada uma faltando:
--   oferta_comercial            → não dá pra sair de Diagnóstico Realizado
--   decisor_confirmado          → regra "sem decisor não avança" nunca aplicável
--   aceite_em / payment_status  → termo e cobrança não voltam pro card
--   ganho_override_em           → override do gerente sem carimbo de auditoria
--   no_show_reagenda_tentativas → limite de 1 reagendamento não funcionava
--   stage_changed_at            → "tempo em etapa" media sempre errado
-- Aditivo: nada é reescrito.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS oferta_comercial            text,
  ADD COLUMN IF NOT EXISTS decisor_confirmado          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aceite_em                   timestamptz,
  ADD COLUMN IF NOT EXISTS payment_status              text NOT NULL DEFAULT 'nao_iniciado',
  ADD COLUMN IF NOT EXISTS ganho_override_em           timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_reagenda_tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stage_changed_at            timestamptz;

-- vocabulário do payment_status espelha o webhook do Asaas
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_payment_status_chk;
ALTER TABLE public.leads ADD CONSTRAINT leads_payment_status_chk
  CHECK (payment_status IN ('nao_iniciado', 'aguardando', 'pago', 'vencido', 'cancelado'));

-- quem já está no funil ganha um marco inicial de etapa, senão "tempo em etapa"
-- mostraria idade nula pra card antigo
UPDATE public.leads
   SET stage_changed_at = coalesce(data_reuniao_agendada, updated_at, created_at)
 WHERE stage_changed_at IS NULL AND estagio_funil IS NOT NULL;

-- carimba a etapa sozinho a cada mudança de estágio (o front não precisa lembrar)
CREATE OR REPLACE FUNCTION public.marca_stage_changed_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estagio_funil IS DISTINCT FROM OLD.estagio_funil THEN
    NEW.stage_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_stage_changed_at ON public.leads;
CREATE TRIGGER leads_stage_changed_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.marca_stage_changed_at();

COMMENT ON COLUMN public.leads.oferta_comercial IS
  'Oferta escolhida na cotação (Imersão · Demanda · Atendimento com IA · Operação de Vendas).';
COMMENT ON COLUMN public.leads.stage_changed_at IS
  'Quando o estágio mudou pela última vez — base do "tempo em etapa" do pipeline.';
