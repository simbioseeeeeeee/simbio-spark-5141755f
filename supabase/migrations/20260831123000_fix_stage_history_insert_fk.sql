-- O histórico referencia leads(cnpj), portanto não pode inserir a linha de
-- auditoria num BEFORE INSERT do próprio lead. O estado inicial já é coberto
-- pelo snapshot da migração anterior; mudanças posteriores seguem auditadas.
DROP TRIGGER IF EXISTS trg_crm_track_commercial_stage ON public.leads;
CREATE TRIGGER trg_crm_track_commercial_stage
  BEFORE UPDATE OF status_sdr, estagio_funil ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_track_commercial_stage();

NOTIFY pgrst, 'reload schema';
