
CREATE OR REPLACE FUNCTION public.get_disqualification_trend(p_cidade text DEFAULT NULL::text, p_days integer DEFAULT 30)
 RETURNS TABLE(dia date, total_desq bigint, desq_sem_perfil bigint, desq_sem_budget bigint, desq_sem_interesse bigint, desq_geral bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    d.dia::date,
    COUNT(a.id) FILTER (WHERE a.resultado LIKE 'Desqualificado%' OR a.resultado = 'Recusou') AS total_desq,
    COUNT(a.id) FILTER (WHERE a.resultado = 'Desqualificado - Sem Perfil') AS desq_sem_perfil,
    COUNT(a.id) FILTER (WHERE a.resultado = 'Desqualificado - Sem Budget') AS desq_sem_budget,
    COUNT(a.id) FILTER (WHERE a.resultado = 'Desqualificado - Sem Interesse') AS desq_sem_interesse,
    COUNT(a.id) FILTER (WHERE a.resultado IN ('Recusou', 'Desqualificado')) AS desq_geral
  FROM generate_series(
    (CURRENT_DATE - make_interval(days => p_days - 1)),
    CURRENT_DATE,
    '1 day'::interval
  ) AS d(dia)
  LEFT JOIN atividades a ON a.created_at::date = d.dia::date
    AND (p_cidade IS NULL OR EXISTS (
      SELECT 1 FROM leads l WHERE l.id = a.lead_id AND l.cidade = p_cidade
    ))
  GROUP BY d.dia
  ORDER BY d.dia;
$function$;
