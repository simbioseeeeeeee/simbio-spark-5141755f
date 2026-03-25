
-- Make get_cadencia_hoje accept optional city
CREATE OR REPLACE FUNCTION public.get_cadencia_hoje(p_cidade text DEFAULT NULL)
 RETURNS SETOF leads
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.leads
  WHERE (p_cidade IS NULL OR cidade = p_cidade)
    AND lead_score >= 50
    AND status_cadencia = 'ativo'
    AND status_sdr NOT IN ('Desqualificado', 'Reunião Agendada')
    AND (data_proximo_passo IS NULL OR data_proximo_passo <= CURRENT_TIMESTAMP)
  ORDER BY lead_score DESC NULLS LAST, data_proximo_passo ASC NULLS FIRST
  LIMIT 100;
$function$;

-- Make get_daily_metrics accept optional city
CREATE OR REPLACE FUNCTION public.get_daily_metrics(p_cidade text DEFAULT NULL)
 RETURNS TABLE(pesquisas_hoje bigint, tentativas_hoje bigint, conexoes_hoje bigint, reunioes_hoje bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    COUNT(*) FILTER (WHERE a.tipo_atividade = 'Pesquisa') AS pesquisas_hoje,
    COUNT(*) FILTER (WHERE a.tipo_atividade IN ('WhatsApp', 'Ligação', 'Email')) AS tentativas_hoje,
    COUNT(*) FILTER (WHERE a.resultado IN ('Conectado', 'Atendeu', 'Respondeu')) AS conexoes_hoje,
    COUNT(*) FILTER (WHERE a.resultado = 'Agendou Reunião') AS reunioes_hoje
  FROM public.atividades a
  INNER JOIN public.leads l ON l.id = a.lead_id
  WHERE (p_cidade IS NULL OR l.cidade = p_cidade)
    AND a.created_at >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')
    AND a.created_at < ((CURRENT_DATE + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo');
$function$;
