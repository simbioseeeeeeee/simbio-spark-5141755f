
-- Table to persist manager daily targets
CREATE TABLE public.manager_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  leads integer NOT NULL DEFAULT 5,
  atividades integer NOT NULL DEFAULT 30,
  reunioes integer NOT NULL DEFAULT 3,
  fechamentos integer NOT NULL DEFAULT 1,
  pipeline numeric NOT NULL DEFAULT 10000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.manager_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can read own targets"
  ON public.manager_targets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can insert own targets"
  ON public.manager_targets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can update own targets"
  ON public.manager_targets FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'manager'))
  WITH CHECK (user_id = auth.uid());

-- Table to store daily KPI snapshots for alert tracking
CREATE TABLE public.kpi_daily_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  cidade text,
  leads_qualificados integer NOT NULL DEFAULT 0,
  atividades integer NOT NULL DEFAULT 0,
  reunioes integer NOT NULL DEFAULT 0,
  fechamentos integer NOT NULL DEFAULT 0,
  valor_pipeline numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, cidade)
);

ALTER TABLE public.kpi_daily_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read kpi_daily_snapshots"
  ON public.kpi_daily_snapshots FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated insert kpi_daily_snapshots"
  ON public.kpi_daily_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'manager'));

-- Function to check consecutive days below 50% target
CREATE OR REPLACE FUNCTION public.get_kpi_alerts(
  p_cidade text DEFAULT NULL,
  p_target_leads integer DEFAULT 5,
  p_target_atividades integer DEFAULT 30,
  p_target_reunioes integer DEFAULT 3,
  p_target_fechamentos integer DEFAULT 1,
  p_target_pipeline numeric DEFAULT 10000
)
RETURNS TABLE(kpi_name text, consecutive_days integer, current_value numeric, daily_target numeric)
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  rec RECORD;
  days_count integer;
BEGIN
  -- Check each KPI for consecutive days below 50%
  FOR rec IN (
    SELECT
      s.snapshot_date,
      s.leads_qualificados,
      s.atividades,
      s.reunioes,
      s.fechamentos,
      s.valor_pipeline
    FROM kpi_daily_snapshots s
    WHERE (p_cidade IS NULL OR s.cidade IS NULL OR s.cidade = p_cidade)
    ORDER BY s.snapshot_date DESC
    LIMIT 30
  ) LOOP
    -- We'll handle this in the application layer for simplicity
    NULL;
  END LOOP;

  -- Leads
  SELECT COUNT(*) INTO days_count FROM (
    SELECT snapshot_date FROM kpi_daily_snapshots
    WHERE (p_cidade IS NULL OR cidade IS NULL OR cidade = p_cidade)
      AND snapshot_date >= CURRENT_DATE - 10
      AND leads_qualificados < (p_target_leads * 0.5)
    ORDER BY snapshot_date DESC
  ) sub
  WHERE snapshot_date >= CURRENT_DATE - days_count;

  -- Simplified: count recent consecutive days below 50% for each KPI
  -- Leads
  days_count := 0;
  FOR rec IN (
    SELECT snapshot_date, leads_qualificados as val
    FROM kpi_daily_snapshots
    WHERE (p_cidade IS NULL OR cidade IS NULL OR cidade = p_cidade)
    ORDER BY snapshot_date DESC LIMIT 10
  ) LOOP
    IF rec.val < (p_target_leads * 0.5) THEN days_count := days_count + 1;
    ELSE EXIT; END IF;
  END LOOP;
  IF days_count >= 3 THEN
    RETURN QUERY SELECT 'leads'::text, days_count, 0::numeric, p_target_leads::numeric;
  END IF;

  -- Atividades
  days_count := 0;
  FOR rec IN (
    SELECT snapshot_date, atividades as val
    FROM kpi_daily_snapshots
    WHERE (p_cidade IS NULL OR cidade IS NULL OR cidade = p_cidade)
    ORDER BY snapshot_date DESC LIMIT 10
  ) LOOP
    IF rec.val < (p_target_atividades * 0.5) THEN days_count := days_count + 1;
    ELSE EXIT; END IF;
  END LOOP;
  IF days_count >= 3 THEN
    RETURN QUERY SELECT 'atividades'::text, days_count, 0::numeric, p_target_atividades::numeric;
  END IF;

  -- Reunioes
  days_count := 0;
  FOR rec IN (
    SELECT snapshot_date, reunioes as val
    FROM kpi_daily_snapshots
    WHERE (p_cidade IS NULL OR cidade IS NULL OR cidade = p_cidade)
    ORDER BY snapshot_date DESC LIMIT 10
  ) LOOP
    IF rec.val < (p_target_reunioes * 0.5) THEN days_count := days_count + 1;
    ELSE EXIT; END IF;
  END LOOP;
  IF days_count >= 3 THEN
    RETURN QUERY SELECT 'reunioes'::text, days_count, 0::numeric, p_target_reunioes::numeric;
  END IF;

  -- Pipeline
  days_count := 0;
  FOR rec IN (
    SELECT snapshot_date, valor_pipeline as val
    FROM kpi_daily_snapshots
    WHERE (p_cidade IS NULL OR cidade IS NULL OR cidade = p_cidade)
    ORDER BY snapshot_date DESC LIMIT 10
  ) LOOP
    IF rec.val < (p_target_pipeline * 0.5) THEN days_count := days_count + 1;
    ELSE EXIT; END IF;
  END LOOP;
  IF days_count >= 3 THEN
    RETURN QUERY SELECT 'pipeline'::text, days_count, 0::numeric, p_target_pipeline;
  END IF;

  RETURN;
END;
$$;

-- Function to snapshot today's KPIs (called from edge function or manually)
CREATE OR REPLACE FUNCTION public.snapshot_daily_kpis(p_cidade text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_leads bigint;
  v_atividades bigint;
  v_reunioes bigint;
  v_fechamentos bigint;
  v_pipeline numeric;
BEGIN
  SELECT COUNT(*) INTO v_leads FROM leads
    WHERE (p_cidade IS NULL OR cidade = p_cidade) AND lead_score >= 50;

  SELECT COUNT(*) INTO v_atividades FROM atividades a
    INNER JOIN leads l ON l.id = a.lead_id
    WHERE (p_cidade IS NULL OR l.cidade = p_cidade)
      AND a.created_at >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')
      AND a.created_at < ((CURRENT_DATE + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo');

  SELECT COUNT(*) INTO v_reunioes FROM atividades a
    INNER JOIN leads l ON l.id = a.lead_id
    WHERE (p_cidade IS NULL OR l.cidade = p_cidade)
      AND a.resultado = 'Agendou Reunião'
      AND a.created_at >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')
      AND a.created_at < ((CURRENT_DATE + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo');

  SELECT COUNT(*) INTO v_fechamentos FROM leads
    WHERE (p_cidade IS NULL OR cidade = p_cidade) AND estagio_funil = 'Fechado Ganho';

  SELECT COALESCE(SUM(valor_negocio_estimado), 0) INTO v_pipeline FROM leads
    WHERE (p_cidade IS NULL OR cidade = p_cidade)
      AND estagio_funil IS NOT NULL
      AND estagio_funil NOT IN ('Fechado Ganho', 'Fechado Perdido');

  INSERT INTO kpi_daily_snapshots (snapshot_date, cidade, leads_qualificados, atividades, reunioes, fechamentos, valor_pipeline)
  VALUES (CURRENT_DATE, p_cidade, v_leads, v_atividades, v_reunioes, v_fechamentos, v_pipeline)
  ON CONFLICT (snapshot_date, cidade) DO UPDATE SET
    leads_qualificados = EXCLUDED.leads_qualificados,
    atividades = EXCLUDED.atividades,
    reunioes = EXCLUDED.reunioes,
    fechamentos = EXCLUDED.fechamentos,
    valor_pipeline = EXCLUDED.valor_pipeline;
END;
$$;
