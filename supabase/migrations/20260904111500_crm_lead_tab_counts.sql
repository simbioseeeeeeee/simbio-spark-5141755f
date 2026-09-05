-- Uma troca de filtro na tela Leads fazia 12 COUNTs independentes na tabela de
-- 61 mil linhas. Esta RPC aplica os filtros uma vez e devolve todos os badges.
CREATE OR REPLACE FUNCTION public.crm_lead_tab_counts(
  p_origens text[] DEFAULT NULL,
  p_tipos text[] DEFAULT NULL,
  p_hide_acelerador boolean DEFAULT true,
  p_responsavel text DEFAULT NULL,
  p_cidade text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_last_days integer DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE(tab text, total bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH filtrados AS (
    SELECT l.status_sdr, l.estagio_funil, l.deleted_at
    FROM public.leads l
    WHERE (p_origens IS NULL OR l.origem_lead = ANY(p_origens))
      AND (
        p_tipos IS NOT NULL AND l.tipo_lead = ANY(p_tipos)
        OR p_tipos IS NULL AND (NOT p_hide_acelerador OR l.tipo_lead IS DISTINCT FROM 'programa_acelerador')
      )
      AND (p_responsavel IS NULL OR l.responsavel_sdr = p_responsavel)
      AND (p_cidade IS NULL OR l.cidade ILIKE '%' || p_cidade || '%')
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_last_days IS NULL OR l.updated_at >= now() - make_interval(days => p_last_days))
      AND (
        NULLIF(btrim(p_search), '') IS NULL
        OR l.razao_social ILIKE '%' || p_search || '%'
        OR l.fantasia ILIKE '%' || p_search || '%'
        OR l.contato_nome ILIKE '%' || p_search || '%'
        OR l.cnpj ILIKE '%' || p_search || '%'
        OR l.celular1 ILIKE '%' || p_search || '%'
        OR l.email1 ILIKE '%' || p_search || '%'
      )
  )
  SELECT 'all', count(*) FILTER (WHERE deleted_at IS NULL) FROM filtrados
  UNION ALL SELECT 'A Contatar', count(*) FILTER (WHERE deleted_at IS NULL AND status_sdr = 'A Contatar') FROM filtrados
  UNION ALL SELECT 'Em Qualificação', count(*) FILTER (WHERE deleted_at IS NULL AND status_sdr = 'Em Qualificação') FROM filtrados
  UNION ALL SELECT 'Qualificado', count(*) FILTER (WHERE deleted_at IS NULL AND status_sdr = 'Qualificado') FROM filtrados
  UNION ALL SELECT 'Reunião Agendada', count(*) FILTER (WHERE deleted_at IS NULL AND status_sdr = 'Reunião Agendada') FROM filtrados
  UNION ALL SELECT 'Em Negociação', count(*) FILTER (
    WHERE deleted_at IS NULL AND estagio_funil IN ('Diagnóstico Realizado', 'Proposta Enviada', 'Em Negociação', 'Aguardando Aceite', 'Aguardando Pagamento')
  ) FROM filtrados
  UNION ALL SELECT 'Fechado Ganho', count(*) FILTER (WHERE deleted_at IS NULL AND estagio_funil = 'Fechado Ganho') FROM filtrados
  UNION ALL SELECT 'Fechado Perdido', count(*) FILTER (WHERE deleted_at IS NULL AND estagio_funil = 'Fechado Perdido') FROM filtrados
  UNION ALL SELECT 'Nurturing', count(*) FILTER (WHERE deleted_at IS NULL AND status_sdr = 'Nurturing') FROM filtrados
  UNION ALL SELECT 'Opt-out', count(*) FILTER (WHERE deleted_at IS NULL AND status_sdr = 'Opt-out') FROM filtrados
  UNION ALL SELECT 'Desqualificado', count(*) FILTER (WHERE deleted_at IS NULL AND status_sdr = 'Desqualificado') FROM filtrados
  UNION ALL SELECT 'Lixeira', count(*) FILTER (WHERE deleted_at IS NOT NULL) FROM filtrados;
$$;

GRANT EXECUTE ON FUNCTION public.crm_lead_tab_counts(text[], text[], boolean, text, text, text, integer, text) TO authenticated;

COMMENT ON FUNCTION public.crm_lead_tab_counts(text[], text[], boolean, text, text, text, integer, text) IS
  'Contagens dos badges da tela Leads em uma única varredura filtrada.';
