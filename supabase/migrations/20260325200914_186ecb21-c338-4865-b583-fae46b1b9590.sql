
CREATE OR REPLACE FUNCTION public.get_cadencia_concluidas_hoje(p_cidade text DEFAULT NULL)
RETURNS SETOF leads
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT DISTINCT ON (l.id) l.* FROM public.leads l
  INNER JOIN public.atividades a ON a.lead_id = l.id
  WHERE (p_cidade IS NULL OR l.cidade = p_cidade)
    AND a.created_at::date = CURRENT_DATE
    AND l.status_cadencia IN ('ativo', 'concluido')
  ORDER BY l.id, l.lead_score DESC NULLS LAST
  LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION public.get_cadencia_amanha(p_cidade text DEFAULT NULL)
RETURNS SETOF leads
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT * FROM public.leads
  WHERE (p_cidade IS NULL OR cidade = p_cidade)
    AND status_cadencia = 'ativo'
    AND status_sdr NOT IN ('Desqualificado', 'Reunião Agendada')
    AND data_proximo_passo::date = (CURRENT_DATE + INTERVAL '1 day')::date
  ORDER BY lead_score DESC NULLS LAST, data_proximo_passo ASC
  LIMIT 50;
$$;
