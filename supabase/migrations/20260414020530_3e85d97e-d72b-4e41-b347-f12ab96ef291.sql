
CREATE OR REPLACE FUNCTION public.get_call_trend(p_cidade text DEFAULT NULL, p_days integer DEFAULT 7)
RETURNS TABLE(dia date, total bigint, atendidas bigint, nao_atendidas bigint)
LANGUAGE sql STABLE SET search_path = 'public'
AS $$
  SELECT
    d.dia::date,
    COUNT(a.id) AS total,
    COUNT(a.id) FILTER (WHERE a.resultado IN ('Atendeu','Conectado','Agendou Reunião')) AS atendidas,
    COUNT(a.id) FILTER (WHERE a.resultado NOT IN ('Atendeu','Conectado','Agendou Reunião')) AS nao_atendidas
  FROM generate_series(
    (CURRENT_DATE - make_interval(days => p_days - 1)),
    CURRENT_DATE,
    '1 day'::interval
  ) AS d(dia)
  LEFT JOIN atividades a ON a.created_at::date = d.dia::date
    AND a.tipo_atividade = 'Ligação'
    AND (p_cidade IS NULL OR EXISTS (SELECT 1 FROM leads l WHERE l.id = a.lead_id AND l.cidade = p_cidade))
  GROUP BY d.dia
  ORDER BY d.dia;
$$;
