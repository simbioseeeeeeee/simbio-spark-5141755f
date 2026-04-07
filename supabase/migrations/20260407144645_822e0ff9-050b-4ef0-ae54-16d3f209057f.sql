
CREATE OR REPLACE FUNCTION public.get_conversion_funnel(p_cidade text DEFAULT NULL::text)
 RETURNS TABLE(etapa text, total bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT 'A Contatar' AS etapa, COUNT(*) FROM leads WHERE (p_cidade IS NULL OR cidade = p_cidade) AND status_sdr = 'A Contatar'
  UNION ALL
  SELECT 'Em Qualificação', COUNT(*) FROM leads WHERE (p_cidade IS NULL OR cidade = p_cidade) AND status_sdr = 'Em Qualificação'
  UNION ALL
  SELECT 'Reunião Agendada', COUNT(*) FROM leads WHERE (p_cidade IS NULL OR cidade = p_cidade) AND status_sdr = 'Reunião Agendada'
  UNION ALL
  SELECT 'Desqualificado', COUNT(*) FROM leads WHERE (p_cidade IS NULL OR cidade = p_cidade) AND status_sdr LIKE 'Desqualificado%'
  UNION ALL
  SELECT 'Fechado Ganho', COUNT(*) FROM leads WHERE (p_cidade IS NULL OR cidade = p_cidade) AND estagio_funil = 'Fechado Ganho'
  UNION ALL
  SELECT 'Fechado Perdido', COUNT(*) FROM leads WHERE (p_cidade IS NULL OR cidade = p_cidade) AND estagio_funil = 'Fechado Perdido';
$function$;
