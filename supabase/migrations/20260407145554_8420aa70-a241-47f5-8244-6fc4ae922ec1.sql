
DROP FUNCTION IF EXISTS public.get_manager_analytics(text, integer);

CREATE OR REPLACE FUNCTION public.get_manager_analytics(p_cidade text DEFAULT NULL::text, p_days integer DEFAULT 1)
 RETURNS TABLE(
   total_leads_qualificados bigint,
   total_atividades bigint,
   total_reunioes bigint,
   total_fechamentos bigint,
   valor_pipeline numeric,
   total_desqualificados bigint,
   desq_sem_perfil bigint,
   desq_sem_budget bigint,
   desq_sem_interesse bigint,
   desq_geral bigint
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT COUNT(*) FROM leads WHERE (p_cidade IS NULL OR cidade = p_cidade) AND lead_score >= 50),
    (SELECT COUNT(*) FROM atividades a INNER JOIN leads l ON l.id = a.lead_id
     WHERE (p_cidade IS NULL OR l.cidade = p_cidade)
       AND a.created_at >= ((CURRENT_DATE - make_interval(days => p_days - 1)) AT TIME ZONE 'America/Sao_Paulo')),
    (SELECT COUNT(*) FROM atividades a INNER JOIN leads l ON l.id = a.lead_id
     WHERE (p_cidade IS NULL OR l.cidade = p_cidade)
       AND a.resultado = 'Agendou Reunião'
       AND a.created_at >= ((CURRENT_DATE - make_interval(days => p_days - 1)) AT TIME ZONE 'America/Sao_Paulo')),
    (SELECT COUNT(*) FROM leads WHERE (p_cidade IS NULL OR cidade = p_cidade) AND estagio_funil = 'Fechado Ganho'),
    (SELECT COALESCE(SUM(valor_negocio_estimado), 0) FROM leads
     WHERE (p_cidade IS NULL OR cidade = p_cidade)
       AND estagio_funil IS NOT NULL
       AND estagio_funil NOT IN ('Fechado Ganho', 'Fechado Perdido')),
    (SELECT COUNT(*) FROM leads WHERE (p_cidade IS NULL OR cidade = p_cidade) AND status_sdr LIKE 'Desqualificado%'),
    (SELECT COUNT(*) FROM leads WHERE (p_cidade IS NULL OR cidade = p_cidade) AND status_sdr = 'Desqualificado - Sem Perfil'),
    (SELECT COUNT(*) FROM leads WHERE (p_cidade IS NULL OR cidade = p_cidade) AND status_sdr = 'Desqualificado - Sem Budget'),
    (SELECT COUNT(*) FROM leads WHERE (p_cidade IS NULL OR cidade = p_cidade) AND status_sdr = 'Desqualificado - Sem Interesse'),
    (SELECT COUNT(*) FROM leads WHERE (p_cidade IS NULL OR cidade = p_cidade) AND status_sdr = 'Desqualificado')
$function$;
