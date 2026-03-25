-- 1. Drop old permissive "Allow all" policies on leads
DROP POLICY IF EXISTS "Allow all select" ON public.leads;
DROP POLICY IF EXISTS "Allow all insert" ON public.leads;
DROP POLICY IF EXISTS "Allow all update" ON public.leads;
DROP POLICY IF EXISTS "Allow all delete" ON public.leads;

-- 2. Drop old permissive "Allow all" policies on atividades
DROP POLICY IF EXISTS "Allow all select atividades" ON public.atividades;
DROP POLICY IF EXISTS "Allow all insert atividades" ON public.atividades;
DROP POLICY IF EXISTS "Allow all update atividades" ON public.atividades;
DROP POLICY IF EXISTS "Allow all delete atividades" ON public.atividades;

-- 3. New authenticated-only policies for leads
CREATE POLICY "Authenticated select leads" ON public.leads
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert leads" ON public.leads
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated update leads" ON public.leads
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated delete leads" ON public.leads
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(), 'manager')
  );

-- 4. New authenticated-only policies for atividades
CREATE POLICY "Authenticated select atividades" ON public.atividades
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert atividades" ON public.atividades
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated update atividades" ON public.atividades
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated delete atividades" ON public.atividades
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(), 'manager')
  );

-- 5. Create function for daily activity trend (last N days)
CREATE OR REPLACE FUNCTION public.get_activity_trend(p_cidade text DEFAULT NULL, p_days integer DEFAULT 7)
RETURNS TABLE(dia date, total_atividades bigint, total_reunioes bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    d.dia::date,
    COUNT(a.id) AS total_atividades,
    COUNT(a.id) FILTER (WHERE a.resultado = 'Agendou Reunião') AS total_reunioes
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
$$;

-- 6. Create function for conversion funnel counts
CREATE OR REPLACE FUNCTION public.get_conversion_funnel(p_cidade text DEFAULT NULL)
RETURNS TABLE(etapa text, total bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT 'A Contatar' AS etapa, COUNT(*) FROM leads WHERE (p_cidade IS NULL OR cidade = p_cidade) AND status_sdr = 'A Contatar'
  UNION ALL
  SELECT 'Em Qualificação', COUNT(*) FROM leads WHERE (p_cidade IS NULL OR cidade = p_cidade) AND status_sdr = 'Em Qualificação'
  UNION ALL
  SELECT 'Reunião Agendada', COUNT(*) FROM leads WHERE (p_cidade IS NULL OR cidade = p_cidade) AND status_sdr = 'Reunião Agendada'
  UNION ALL
  SELECT 'Fechado Ganho', COUNT(*) FROM leads WHERE (p_cidade IS NULL OR cidade = p_cidade) AND estagio_funil = 'Fechado Ganho'
  UNION ALL
  SELECT 'Fechado Perdido', COUNT(*) FROM leads WHERE (p_cidade IS NULL OR cidade = p_cidade) AND estagio_funil = 'Fechado Perdido';
$$;