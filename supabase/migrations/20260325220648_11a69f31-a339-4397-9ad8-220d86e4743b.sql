
CREATE OR REPLACE FUNCTION public.get_pipeline_by_stage(p_cidade text DEFAULT NULL::text)
RETURNS TABLE(estagio text, total_leads bigint, valor_total numeric)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    l.estagio_funil AS estagio,
    COUNT(*) AS total_leads,
    COALESCE(SUM(l.valor_negocio_estimado), 0) AS valor_total
  FROM public.leads l
  WHERE l.estagio_funil IS NOT NULL
    AND l.estagio_funil NOT IN ('Fechado Ganho', 'Fechado Perdido')
    AND (p_cidade IS NULL OR l.cidade = p_cidade)
  GROUP BY l.estagio_funil
  ORDER BY
    CASE l.estagio_funil
      WHEN 'Reunião Agendada' THEN 1
      WHEN 'Reunião Realizada' THEN 2
      WHEN 'Proposta Enviada' THEN 3
      WHEN 'Em Negociação' THEN 4
      ELSE 5
    END;
$$;

CREATE OR REPLACE FUNCTION public.get_activity_breakdown(p_cidade text DEFAULT NULL::text, p_days integer DEFAULT 7)
RETURNS TABLE(tipo text, total bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    a.tipo_atividade AS tipo,
    COUNT(*) AS total
  FROM public.atividades a
  INNER JOIN public.leads l ON l.id = a.lead_id
  WHERE (p_cidade IS NULL OR l.cidade = p_cidade)
    AND a.created_at >= ((CURRENT_DATE - make_interval(days => p_days - 1)) AT TIME ZONE 'America/Sao_Paulo')
  GROUP BY a.tipo_atividade
  ORDER BY total DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_sdr_performance(p_cidade text DEFAULT NULL::text, p_days integer DEFAULT 7)
RETURNS TABLE(user_id uuid, nome text, whatsapps bigint, ligacoes bigint, emails bigint, pesquisas bigint, reunioes bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    ur.user_id,
    ur.nome,
    COUNT(a.id) FILTER (WHERE a.tipo_atividade = 'WhatsApp') AS whatsapps,
    COUNT(a.id) FILTER (WHERE a.tipo_atividade = 'Ligação') AS ligacoes,
    COUNT(a.id) FILTER (WHERE a.tipo_atividade = 'Email') AS emails,
    COUNT(a.id) FILTER (WHERE a.tipo_atividade = 'Pesquisa') AS pesquisas,
    COUNT(a.id) FILTER (WHERE a.resultado = 'Agendou Reunião') AS reunioes
  FROM public.user_roles ur
  LEFT JOIN public.atividades a ON a.sdr_id = ur.user_id
    AND a.created_at >= ((CURRENT_DATE - make_interval(days => p_days - 1)) AT TIME ZONE 'America/Sao_Paulo')
    AND (p_cidade IS NULL OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = a.lead_id AND l.cidade = p_cidade))
  WHERE ur.role IN ('sdr', 'closer')
  GROUP BY ur.user_id, ur.nome
  HAVING COUNT(a.id) > 0
  ORDER BY COUNT(a.id) DESC;
$$;
