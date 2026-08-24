BEGIN;

CREATE OR REPLACE FUNCTION public.record_crm_activity(
  p_lead_cnpj text,
  p_tipo text,
  p_resultado text,
  p_nota text DEFAULT NULL,
  p_direcao text DEFAULT 'out',
  p_ocorrido_em timestamptz DEFAULT now(),
  p_avancar_cadencia boolean DEFAULT false,
  p_contexto jsonb DEFAULT '{}'::jsonb
)
RETURNS SETOF public.leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_role text;
  v_lead public.leads%ROWTYPE;
  v_tentativas integer;
  v_dias integer;
  v_proximo timestamptz;
  v_contexto jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;

  SELECT ur.role::text INTO v_role
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
  ORDER BY CASE ur.role WHEN 'manager' THEN 1 WHEN 'closer' THEN 2 ELSE 3 END
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Usuário sem papel comercial.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lead
  FROM public.leads
  WHERE cnpj = p_lead_cnpj
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF v_role = 'sdr' AND v_lead.estagio_funil IS NOT NULL AND v_lead.status_sdr <> 'Reunião Agendada' THEN
    RAISE EXCEPTION 'Este lead já está sob responsabilidade do closer.' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'closer' AND v_lead.estagio_funil IS NULL THEN
    RAISE EXCEPTION 'Este lead ainda está no funil SDR.' USING ERRCODE = '42501';
  END IF;

  IF p_tipo NOT IN ('whatsapp_in','whatsapp_out','ligacao','email_out','sms_out','reuniao','nota','mudanca_status') THEN
    RAISE EXCEPTION 'Tipo de atividade inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_resultado NOT IN ('sucesso','erro','escalado','recusa','agendado','sem_resposta') THEN
    RAISE EXCEPTION 'Resultado de atividade inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_direcao NOT IN ('in','out') THEN
    RAISE EXCEPTION 'Direção da atividade inválida.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo = 'whatsapp_in' AND p_direcao <> 'in' THEN
    RAISE EXCEPTION 'WhatsApp recebido exige direção de entrada.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo NOT IN ('whatsapp_in','nota') AND p_direcao <> 'out' THEN
    RAISE EXCEPTION 'Este tipo de atividade exige direção de saída.' USING ERRCODE = '22023';
  END IF;
  IF p_resultado = 'agendado' AND (
    p_tipo <> 'reuniao'
    OR v_lead.meeting_event_id IS NULL
    OR v_lead.data_reuniao_agendada IS NULL
    OR v_lead.reuniao_url IS NULL
  ) THEN
    RAISE EXCEPTION 'Agendamento exige evento, data e link reais.' USING ERRCODE = '22023';
  END IF;
  IF p_ocorrido_em > now() + interval '5 minutes' OR p_ocorrido_em < now() - interval '90 days' THEN
    RAISE EXCEPTION 'Data da atividade fora da janela permitida.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_nota, '')) > 4000 THEN
    RAISE EXCEPTION 'Observação excede 4000 caracteres.' USING ERRCODE = '22001';
  END IF;
  IF pg_column_size(coalesce(p_contexto, '{}'::jsonb)) > 16384 THEN
    RAISE EXCEPTION 'Contexto de auditoria excede o limite.' USING ERRCODE = '22001';
  END IF;

  v_contexto := coalesce(p_contexto, '{}'::jsonb)
    - ARRAY['token','authorization','secret','password']
    || jsonb_build_object(
      'origin', coalesce(p_contexto->>'origin', 'crm'),
      'actor_id', auth.uid()::text,
      'actor_role', v_role,
      'operation', CASE WHEN p_avancar_cadencia THEN 'record_and_advance' ELSE 'record_only' END,
      'playbook_version', 'simbiose-sales-v2@2.1.0'
    );

  INSERT INTO public.atividades (
    lead_cnpj, tipo_atividade, resultado, nota, created_at, created_by,
    playbook_version, origem, canal, direcao, metadados
  ) VALUES (
    v_lead.cnpj, p_tipo, p_resultado, nullif(btrim(p_nota), ''), p_ocorrido_em,
    auth.uid()::text, 'simbiose-sales-v2@2.1.0', v_lead.origem_lead,
    p_tipo, p_direcao, v_contexto
  );

  IF p_avancar_cadencia THEN
    IF v_role NOT IN ('sdr','manager') THEN
      RAISE EXCEPTION 'Somente SDR ou manager pode avançar a cadência humana.' USING ERRCODE = '42501';
    END IF;
    IF coalesce(v_lead.status_cadencia, 'ativo') <> 'ativo' THEN
      RAISE EXCEPTION 'A cadência deste lead não está ativa.' USING ERRCODE = '22023';
    END IF;
    IF v_lead.status_sdr IN ('Reunião Agendada','Nurturing','Desqualificado','Opt-out','Arquivo Morto','Cliente Ativo') THEN
      RAISE EXCEPTION 'O status atual não permite avanço de cadência.' USING ERRCODE = '22023';
    END IF;

    v_tentativas := coalesce(v_lead.tentativas_followup, 0) + 1;
    v_dias := (ARRAY[1,2,3,5,7])[least(v_tentativas, 5)];
    v_proximo := (
      date_trunc('day', p_ocorrido_em AT TIME ZONE 'America/Sao_Paulo')
      + make_interval(days => v_dias)
      + interval '9 hours'
    ) AT TIME ZONE 'America/Sao_Paulo';

    UPDATE public.leads
    SET tentativas_followup = v_tentativas,
        data_ultimo_contato = p_ocorrido_em,
        data_proximo_passo = CASE WHEN p_resultado = 'recusa' THEN NULL ELSE v_proximo END,
        status_cadencia = CASE WHEN p_resultado = 'recusa' THEN 'concluido' ELSE status_cadencia END,
        status_sdr = CASE
          WHEN p_resultado = 'recusa' THEN 'Desqualificado'
          WHEN status_sdr = 'A Contatar' AND p_resultado = 'sucesso' THEN 'Em Qualificação'
          ELSE status_sdr
        END,
        playbook_version = 'simbiose-sales-v2@2.1.0'
    WHERE cnpj = v_lead.cnpj
    RETURNING * INTO v_lead;
  ELSE
    UPDATE public.leads
    SET data_ultimo_contato = greatest(coalesce(data_ultimo_contato, p_ocorrido_em), p_ocorrido_em)
    WHERE cnpj = v_lead.cnpj
    RETURNING * INTO v_lead;
  END IF;

  RETURN NEXT v_lead;
END;
$$;

REVOKE ALL ON FUNCTION public.record_crm_activity(text,text,text,text,text,timestamptz,boolean,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_crm_activity(text,text,text,text,text,timestamptz,boolean,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_sdr_status(
  p_lead_cnpj text,
  p_target text,
  p_origin text DEFAULT 'crm'
)
RETURNS SETOF public.leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_role text;
  v_lead public.leads%ROWTYPE;
  v_allowed text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;
  SELECT ur.role::text INTO v_role FROM public.user_roles ur
  WHERE ur.user_id = auth.uid() AND ur.role IN ('sdr','manager')
  ORDER BY CASE ur.role WHEN 'manager' THEN 1 ELSE 2 END LIMIT 1;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Seu papel não permite mover o funil SDR.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE cnpj = p_lead_cnpj FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF v_lead.estagio_funil IS NOT NULL THEN
    RAISE EXCEPTION 'O lead já foi entregue ao closer.' USING ERRCODE = '22023';
  END IF;

  v_allowed := CASE v_lead.status_sdr
    WHEN 'A Contatar' THEN ARRAY['Prospectado','Em Qualificação']
    WHEN 'Prospectado' THEN ARRAY['Em Qualificação']
    ELSE ARRAY[]::text[]
  END;
  IF NOT p_target = ANY(v_allowed) THEN
    RAISE EXCEPTION 'Esta transição exige abertura da ficha ou ação específica.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.leads
  SET status_sdr = p_target,
      playbook_version = 'simbiose-sales-v2@2.1.0'
  WHERE cnpj = v_lead.cnpj
  RETURNING * INTO v_lead;

  INSERT INTO public.atividades (
    lead_cnpj, tipo_atividade, resultado, nota, created_by,
    playbook_version, origem, canal, direcao, metadados
  ) VALUES (
    v_lead.cnpj, 'mudanca_status', 'sucesso',
    format('Status SDR alterado para %s.', p_target), auth.uid()::text,
    'simbiose-sales-v2@2.1.0', v_lead.origem_lead, 'crm', 'out',
    jsonb_build_object(
      'origin', left(coalesce(p_origin, 'crm'), 80),
      'actor_id', auth.uid()::text,
      'actor_role', v_role,
      'operation', 'transition_sdr_status'
    )
  );

  RETURN NEXT v_lead;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_sdr_status(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_sdr_status(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cadencia_hoje(p_cidade text DEFAULT NULL)
RETURNS SETOF public.leads
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM public.leads
  WHERE (p_cidade IS NULL OR cidade = p_cidade)
    AND coalesce(status_cadencia, 'ativo') = 'ativo'
    AND status_sdr IN ('A Contatar','Prospectado','Em Qualificação','Qualificado')
    AND estagio_funil IS NULL
    AND (data_proximo_passo IS NULL OR data_proximo_passo <= CURRENT_TIMESTAMP)
  ORDER BY
    CASE
      WHEN cnpj LIKE 'IND-%'  THEN 1
      WHEN cnpj LIKE 'LIVE-%' THEN 2
      WHEN cnpj LIKE 'REU-%'  THEN 2
      WHEN cnpj LIKE 'IG-%'   THEN 3
      WHEN cnpj LIKE 'FB-%'   THEN 3
      WHEN cnpj LIKE 'WA-%'   THEN 3
      ELSE 5
    END,
    coalesce(pesquisa_realizada, false) DESC,
    lead_score DESC NULLS LAST,
    data_proximo_passo ASC NULLS FIRST
  LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION public.get_cadencia_amanha(p_cidade text DEFAULT NULL)
RETURNS SETOF public.leads
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM public.leads
  WHERE (p_cidade IS NULL OR cidade = p_cidade)
    AND coalesce(status_cadencia, 'ativo') = 'ativo'
    AND status_sdr IN ('A Contatar','Prospectado','Em Qualificação','Qualificado')
    AND estagio_funil IS NULL
    AND data_proximo_passo > CURRENT_TIMESTAMP
    AND data_proximo_passo < CURRENT_TIMESTAMP + interval '48 hours'
  ORDER BY data_proximo_passo ASC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.get_cadencia_hoje(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cadencia_amanha(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
