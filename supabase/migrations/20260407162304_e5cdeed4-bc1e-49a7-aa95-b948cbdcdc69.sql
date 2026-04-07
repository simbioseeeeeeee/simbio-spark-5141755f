-- Function to audit inconsistent leads (Reunião Agendada without matching activity)
CREATE OR REPLACE FUNCTION public.get_reuniao_inconsistencies(p_cidade text DEFAULT NULL)
RETURNS TABLE(id uuid, fantasia text, razao_social text, cidade text, created_at timestamptz)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT l.id, l.fantasia, l.razao_social, l.cidade, l.created_at
  FROM public.leads l
  WHERE l.status_sdr = 'Reunião Agendada'
    AND (p_cidade IS NULL OR l.cidade = p_cidade)
    AND NOT EXISTS (
      SELECT 1 FROM public.atividades a
      WHERE a.lead_id = l.id AND a.resultado = 'Agendou Reunião'
    )
  ORDER BY l.created_at DESC;
$$;

-- Function to check if a specific lead has the meeting activity logged
CREATE OR REPLACE FUNCTION public.lead_has_reuniao_activity(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.atividades a
    WHERE a.lead_id = p_lead_id AND a.resultado = 'Agendou Reunião'
  );
$$;
