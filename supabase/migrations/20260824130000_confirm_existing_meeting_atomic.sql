BEGIN;

CREATE OR REPLACE FUNCTION public.confirm_existing_meeting(
  p_lead_cnpj text,
  p_nota text DEFAULT 'Reunião confirmada a partir da evidência existente do Calendar/Meet.'
)
RETURNS SETOF public.leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_role text;
  v_lead public.leads%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;
  SELECT ur.role::text INTO v_role
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid() AND ur.role IN ('sdr','manager')
  ORDER BY CASE ur.role WHEN 'manager' THEN 1 ELSE 2 END
  LIMIT 1;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Somente SDR ou manager pode confirmar uma reunião.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE cnpj = p_lead_cnpj FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_lead.meeting_event_id IS NULL
     OR v_lead.data_reuniao_agendada IS NULL
     OR nullif(btrim(v_lead.reuniao_url), '') IS NULL THEN
    RAISE EXCEPTION 'A reunião exige event_id, data e link confirmados pelo Calendar/Meet.' USING ERRCODE = '22023';
  END IF;
  IF v_lead.estagio_funil IS NOT NULL
     AND v_lead.estagio_funil NOT IN ('Reunião Agendada','No-show')
     AND v_role <> 'manager' THEN
    RAISE EXCEPTION 'Este lead já está sob responsabilidade do closer.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.leads
  SET status_sdr = 'Reunião Agendada',
      estagio_funil = coalesce(estagio_funil, 'Reunião Agendada'),
      data_proximo_passo = NULL,
      playbook_version = 'simbiose-sales-v2@2.1.0'
  WHERE cnpj = p_lead_cnpj
  RETURNING * INTO v_lead;

  IF NOT EXISTS (
    SELECT 1 FROM public.atividades
    WHERE lead_cnpj = p_lead_cnpj
      AND tipo_atividade = 'reuniao'
      AND resultado = 'agendado'
      AND coalesce(metadados->>'meeting_event_id', '') = v_lead.meeting_event_id
  ) THEN
    INSERT INTO public.atividades (
      lead_cnpj, tipo_atividade, resultado, nota, created_by,
      playbook_version, origem, canal, direcao, metadados
    ) VALUES (
      p_lead_cnpj, 'reuniao', 'agendado', left(coalesce(p_nota, ''), 4000), auth.uid()::text,
      'simbiose-sales-v2@2.1.0', v_lead.origem_lead, 'calendar', 'out',
      jsonb_build_object(
        'origin', 'crm_existing_calendar_evidence',
        'meeting_event_id', v_lead.meeting_event_id,
        'meeting_at', v_lead.data_reuniao_agendada,
        'actor_id', auth.uid()::text,
        'actor_role', v_role,
        'operation', 'confirm_existing_meeting'
      )
    );
  END IF;

  RETURN NEXT v_lead;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_existing_meeting(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_existing_meeting(text,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
