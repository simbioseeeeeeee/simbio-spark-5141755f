
-- Add call-specific columns to atividades
ALTER TABLE public.atividades
  ADD COLUMN IF NOT EXISTS duracao_segundos integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS url_gravacao text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS transcricao text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sentimento text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS de_numero text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS para_numero text DEFAULT NULL;

-- KPIs for calls panel
CREATE OR REPLACE FUNCTION public.get_call_kpis(p_cidade text DEFAULT NULL, p_days integer DEFAULT 7)
RETURNS TABLE(total_ligacoes bigint, duracao_media numeric, taxa_atendimento numeric, reunioes_via_ligacao bigint)
LANGUAGE sql STABLE SET search_path = 'public'
AS $$
  SELECT
    COUNT(*) AS total_ligacoes,
    ROUND(COALESCE(AVG(a.duracao_segundos), 0), 0) AS duracao_media,
    ROUND(
      CASE WHEN COUNT(*) = 0 THEN 0
      ELSE COUNT(*) FILTER (WHERE a.resultado IN ('Atendeu','Conectado','Agendou Reunião'))::numeric / COUNT(*)::numeric * 100
      END, 1
    ) AS taxa_atendimento,
    COUNT(*) FILTER (WHERE a.resultado = 'Agendou Reunião') AS reunioes_via_ligacao
  FROM public.atividades a
  INNER JOIN public.leads l ON l.id = a.lead_id
  WHERE a.tipo_atividade = 'Ligação'
    AND (p_cidade IS NULL OR l.cidade = p_cidade)
    AND a.created_at >= ((CURRENT_DATE - make_interval(days => p_days - 1)) AT TIME ZONE 'America/Sao_Paulo');
$$;

-- List calls with lead info
CREATE OR REPLACE FUNCTION public.get_calls_list(
  p_cidade text DEFAULT NULL,
  p_resultado text DEFAULT NULL,
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 200
)
RETURNS TABLE(
  atividade_id uuid,
  lead_id uuid,
  fantasia text,
  razao_social text,
  cidade text,
  resultado text,
  nota text,
  duracao_segundos integer,
  url_gravacao text,
  transcricao text,
  sentimento text,
  de_numero text,
  para_numero text,
  created_at timestamptz
)
LANGUAGE sql STABLE SET search_path = 'public'
AS $$
  SELECT
    a.id AS atividade_id,
    a.lead_id,
    l.fantasia, l.razao_social, l.cidade,
    a.resultado, a.nota,
    a.duracao_segundos, a.url_gravacao, a.transcricao, a.sentimento,
    a.de_numero, a.para_numero,
    a.created_at
  FROM public.atividades a
  INNER JOIN public.leads l ON l.id = a.lead_id
  WHERE a.tipo_atividade = 'Ligação'
    AND (p_cidade IS NULL OR l.cidade = p_cidade)
    AND (p_resultado IS NULL OR a.resultado = p_resultado)
    AND a.created_at >= ((CURRENT_DATE - make_interval(days => p_days - 1)) AT TIME ZONE 'America/Sao_Paulo')
  ORDER BY a.created_at DESC
  LIMIT p_limit;
$$;
