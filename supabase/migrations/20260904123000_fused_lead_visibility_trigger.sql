-- Garante que qualquer consolidação futura tenha o mesmo comportamento da UI:
-- o destino permanece operacional e o perdedor vai para a Lixeira recuperável.
CREATE OR REPLACE FUNCTION public.hide_fused_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE cnpj = NEW.destino) THEN
    RAISE EXCEPTION 'Destino da consolidação não existe: %', NEW.destino;
  END IF;

  UPDATE public.leads
  SET
    deleted_previous_state = COALESCE(
      deleted_previous_state,
      jsonb_build_object(
        'status_sdr', status_sdr,
        'estagio_funil', estagio_funil,
        'responsavel_sdr', responsavel_sdr,
        'responsavel_closer', responsavel_closer,
        'data_proximo_passo', data_proximo_passo
      )
    ),
    deleted_at = COALESCE(deleted_at, now()),
    deletion_reason = 'Duplicidade consolidada em ' || NEW.destino
  WHERE cnpj = NEW.perdedor;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_fundidos_hide_loser ON public.leads_fundidos;
CREATE TRIGGER leads_fundidos_hide_loser
AFTER INSERT OR UPDATE OF destino ON public.leads_fundidos
FOR EACH ROW EXECUTE FUNCTION public.hide_fused_lead();
