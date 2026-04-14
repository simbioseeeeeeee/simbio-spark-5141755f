
-- Function: KPIs for follow-ups dashboard
CREATE OR REPLACE FUNCTION public.get_followups_kpis(p_cidade text DEFAULT NULL)
RETURNS TABLE(atrasados bigint, hoje bigint, proximos_3_dias bigint)
LANGUAGE sql STABLE SET search_path = 'public'
AS $$
  SELECT
    COUNT(*) FILTER (WHERE l.data_proximo_passo < now()
      AND (l.status_sdr IN ('A Contatar','Em Qualificação','Reunião Agendada')
           OR l.estagio_funil IN ('Proposta Enviada','Em Negociação','Reunião Agendada','Reunião Realizada'))
    ) AS atrasados,
    COUNT(*) FILTER (WHERE l.data_proximo_passo::date = CURRENT_DATE
      AND (l.status_sdr IN ('A Contatar','Em Qualificação','Reunião Agendada')
           OR l.estagio_funil IN ('Proposta Enviada','Em Negociação','Reunião Agendada','Reunião Realizada'))
    ) AS hoje,
    COUNT(*) FILTER (WHERE l.data_proximo_passo::date > CURRENT_DATE
      AND l.data_proximo_passo::date <= (CURRENT_DATE + 3)
      AND (l.status_sdr IN ('A Contatar','Em Qualificação','Reunião Agendada')
           OR l.estagio_funil IN ('Proposta Enviada','Em Negociação','Reunião Agendada','Reunião Realizada'))
    ) AS proximos_3_dias
  FROM public.leads l
  WHERE l.data_proximo_passo IS NOT NULL
    AND l.status_sdr NOT LIKE 'Desqualificado%'
    AND (p_cidade IS NULL OR l.cidade = p_cidade);
$$;

-- Function: list follow-ups with last contact
CREATE OR REPLACE FUNCTION public.get_followups_list(
  p_cidade text DEFAULT NULL,
  p_status_sdr text DEFAULT NULL,
  p_estagio_funil text DEFAULT NULL,
  p_responsavel_id uuid DEFAULT NULL,
  p_sort text DEFAULT 'data_proximo_passo',
  p_limit integer DEFAULT 200
)
RETURNS TABLE(
  id uuid, fantasia text, razao_social text, cidade text, uf text,
  celular1 text, telefone1 text, email1 text,
  status_sdr text, estagio_funil text, data_proximo_passo timestamptz,
  observacoes_sdr text, observacoes_closer text,
  owner_id uuid, sdr_id uuid,
  ultimo_contato_em timestamptz, ultimo_contato_tipo text
)
LANGUAGE sql STABLE SET search_path = 'public'
AS $$
  SELECT
    l.id, l.fantasia, l.razao_social, l.cidade, l.uf,
    l.celular1, l.telefone1, l.email1,
    l.status_sdr, l.estagio_funil, l.data_proximo_passo,
    l.observacoes_sdr, l.observacoes_closer,
    l.owner_id, l.sdr_id,
    (SELECT a.created_at FROM atividades a WHERE a.lead_id = l.id ORDER BY a.created_at DESC LIMIT 1),
    (SELECT a.tipo_atividade FROM atividades a WHERE a.lead_id = l.id ORDER BY a.created_at DESC LIMIT 1)
  FROM public.leads l
  WHERE l.data_proximo_passo IS NOT NULL
    AND l.status_sdr NOT LIKE 'Desqualificado%'
    AND (p_cidade IS NULL OR l.cidade = p_cidade)
    AND (p_status_sdr IS NULL OR l.status_sdr = p_status_sdr)
    AND (p_estagio_funil IS NULL OR l.estagio_funil = p_estagio_funil)
    AND (p_responsavel_id IS NULL OR l.owner_id = p_responsavel_id OR l.sdr_id = p_responsavel_id)
  ORDER BY l.data_proximo_passo ASC
  LIMIT p_limit;
$$;
