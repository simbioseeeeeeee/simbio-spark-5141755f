CREATE OR REPLACE FUNCTION public.get_cadencia_hoje(p_cidade text DEFAULT NULL::text)
 RETURNS SETOF leads
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.leads
  WHERE (p_cidade IS NULL OR cidade = p_cidade)
    AND status_cadencia = 'ativo'
    AND status_sdr NOT IN ('Desqualificado', 'Desqualificado - Sem Perfil', 'Desqualificado - Sem Budget', 'Desqualificado - Sem Interesse', 'Reunião Agendada')
    AND (data_proximo_passo IS NULL OR data_proximo_passo <= CURRENT_TIMESTAMP)
  ORDER BY lead_score DESC NULLS LAST, data_proximo_passo ASC NULLS FIRST
  LIMIT 100;
$function$;