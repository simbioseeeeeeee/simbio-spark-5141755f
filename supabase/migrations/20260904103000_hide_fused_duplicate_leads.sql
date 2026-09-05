-- Os pares já consolidados em leads_fundidos continuavam aparecendo na tela de
-- Leads porque apenas recebiam "Arquivo Morto". Mantém a linha original e seu
-- estado para recuperação, mas a move para a Lixeira. Novas atividades escritas
-- no código antigo continuam sendo redirecionadas pelo trigger existente.
UPDATE public.leads AS l
SET
  deleted_previous_state = COALESCE(
    l.deleted_previous_state,
    jsonb_build_object(
      'status_sdr', l.status_sdr,
      'estagio_funil', l.estagio_funil,
      'responsavel_sdr', l.responsavel_sdr,
      'responsavel_closer', l.responsavel_closer,
      'data_proximo_passo', l.data_proximo_passo
    )
  ),
  deleted_at = now(),
  deletion_reason = 'Duplicidade consolidada em ' || f.destino
FROM public.leads_fundidos AS f
WHERE l.cnpj = f.perdedor
  AND l.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM public.leads AS destino WHERE destino.cnpj = f.destino);

COMMENT ON TABLE public.leads_fundidos IS
  'Mapa recuperável de identidades consolidadas. O perdedor fica na Lixeira e atividades novas são redirecionadas ao destino.';
