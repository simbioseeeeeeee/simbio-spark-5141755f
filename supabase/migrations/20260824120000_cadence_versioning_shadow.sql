BEGIN;

CREATE TABLE IF NOT EXISTS public.cadence_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence_key text NOT NULL UNIQUE CHECK (cadence_key ~ '^[a-z0-9_]+$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 3 AND 120),
  purpose text NOT NULL CHECK (length(btrim(purpose)) BETWEEN 3 AND 500),
  enabled boolean NOT NULL DEFAULT false,
  activation_mode text NOT NULL DEFAULT 'shadow' CHECK (activation_mode IN ('off','shadow','live')),
  audience_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  active_version_id uuid,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cadence_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id uuid NOT NULL REFERENCES public.cadence_definitions(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','retired')),
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  allowed_window jsonb NOT NULL DEFAULT '{"days":[1,2,3,4,5],"start":"09:00","end":"18:00"}'::jsonb,
  stop_rules jsonb NOT NULL DEFAULT '["reply","meeting","opt_out","disqualified","archived","closer_handoff"]'::jsonb,
  response_behavior text NOT NULL DEFAULT 'stop' CHECK (response_behavior IN ('stop','pause','continue')),
  meeting_behavior text NOT NULL DEFAULT 'stop' CHECK (meeting_behavior IN ('stop','pause')),
  change_summary text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES auth.users(id),
  published_at timestamptz,
  UNIQUE (definition_id, version_number)
);

ALTER TABLE public.cadence_definitions
  DROP CONSTRAINT IF EXISTS cadence_definitions_active_version_fk;
ALTER TABLE public.cadence_definitions
  ADD CONSTRAINT cadence_definitions_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES public.cadence_versions(id);

CREATE TABLE IF NOT EXISTS public.cadence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.cadence_versions(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  delay_seconds integer NOT NULL CHECK (delay_seconds >= 0),
  channel text NOT NULL CHECK (channel IN ('whatsapp','voice','sms','email','human_task')),
  action_kind text NOT NULL CHECK (action_kind IN ('send_template','place_call','create_task','notify_owner')),
  executor_kind text NOT NULL CHECK (executor_kind IN ('automatic','human')),
  template_ref text CHECK (template_ref IS NULL OR length(template_ref) <= 200),
  retry_policy jsonb NOT NULL DEFAULT '{"max_attempts":1}'::jsonb,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, position)
);

CREATE TABLE IF NOT EXISTS public.lead_cadence_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_cnpj text NOT NULL REFERENCES public.leads(cnpj) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.cadence_versions(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','stopped','cancelled')),
  current_position integer NOT NULL DEFAULT 0 CHECK (current_position >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  next_due_at timestamptz,
  paused_at timestamptz,
  pause_reason text,
  stopped_at timestamptz,
  stop_reason text,
  lock_version integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_cadence_one_active_idx
  ON public.lead_cadence_assignments (lead_cnpj)
  WHERE status IN ('active','paused');
CREATE INDEX IF NOT EXISTS lead_cadence_due_idx
  ON public.lead_cadence_assignments (next_due_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS lead_cadence_version_idx
  ON public.lead_cadence_assignments (version_id, status);

CREATE TABLE IF NOT EXISTS public.cadence_execution_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.lead_cadence_assignments(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.cadence_steps(id),
  scheduled_at timestamptz NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','running','sent','delivered','failed','skipped','cancelled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  activity_id uuid,
  error_code text,
  error_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS cadence_receipts_assignment_idx
  ON public.cadence_execution_receipts (assignment_id, scheduled_at DESC);

CREATE TABLE IF NOT EXISTS public.cadence_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN ('definition','version','step','assignment')),
  entity_id uuid NOT NULL,
  action text NOT NULL,
  actor_id uuid REFERENCES auth.users(id),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cadence_audit_entity_idx
  ON public.cadence_audit_log (entity_type, entity_id, created_at DESC);

ALTER TABLE public.cadence_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_cadence_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_execution_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cadence_definitions_manager_all ON public.cadence_definitions;
CREATE POLICY cadence_definitions_manager_all ON public.cadence_definitions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));
DROP POLICY IF EXISTS cadence_versions_manager_all ON public.cadence_versions;
CREATE POLICY cadence_versions_manager_all ON public.cadence_versions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));
DROP POLICY IF EXISTS cadence_steps_manager_all ON public.cadence_steps;
CREATE POLICY cadence_steps_manager_all ON public.cadence_steps
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));
DROP POLICY IF EXISTS cadence_assignments_manager_read ON public.lead_cadence_assignments;
CREATE POLICY cadence_assignments_manager_read ON public.lead_cadence_assignments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'manager'));
DROP POLICY IF EXISTS cadence_receipts_manager_read ON public.cadence_execution_receipts;
CREATE POLICY cadence_receipts_manager_read ON public.cadence_execution_receipts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'manager'));
DROP POLICY IF EXISTS cadence_audit_manager_read ON public.cadence_audit_log;
CREATE POLICY cadence_audit_manager_read ON public.cadence_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'manager'));

CREATE OR REPLACE FUNCTION public.cadence_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cadence_definitions_touch ON public.cadence_definitions;
CREATE TRIGGER cadence_definitions_touch BEFORE UPDATE ON public.cadence_definitions
FOR EACH ROW EXECUTE FUNCTION public.cadence_touch_updated_at();
DROP TRIGGER IF EXISTS cadence_steps_touch ON public.cadence_steps;
CREATE TRIGGER cadence_steps_touch BEFORE UPDATE ON public.cadence_steps
FOR EACH ROW EXECUTE FUNCTION public.cadence_touch_updated_at();
DROP TRIGGER IF EXISTS cadence_assignments_touch ON public.lead_cadence_assignments;
CREATE TRIGGER cadence_assignments_touch BEFORE UPDATE ON public.lead_cadence_assignments
FOR EACH ROW EXECUTE FUNCTION public.cadence_touch_updated_at();
DROP TRIGGER IF EXISTS cadence_receipts_touch ON public.cadence_execution_receipts;
CREATE TRIGGER cadence_receipts_touch BEFORE UPDATE ON public.cadence_execution_receipts
FOR EACH ROW EXECUTE FUNCTION public.cadence_touch_updated_at();

CREATE OR REPLACE FUNCTION public.cadence_protect_published_version()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status IN ('published','retired') AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
    IF NEW.status = OLD.status THEN
      RAISE EXCEPTION 'Versões publicadas são imutáveis; crie um novo rascunho.' USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cadence_versions_immutable ON public.cadence_versions;
CREATE TRIGGER cadence_versions_immutable BEFORE UPDATE ON public.cadence_versions
FOR EACH ROW EXECUTE FUNCTION public.cadence_protect_published_version();

CREATE OR REPLACE FUNCTION public.create_cadence_draft(p_definition_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_source public.cadence_versions%ROWTYPE;
  v_new_id uuid;
  v_next integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'manager') THEN
    RAISE EXCEPTION 'Somente manager pode criar versões.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cadence_versions WHERE definition_id = p_definition_id AND status = 'draft') THEN
    RAISE EXCEPTION 'Já existe um rascunho aberto para esta cadência.' USING ERRCODE = '23505';
  END IF;
  SELECT * INTO v_source FROM public.cadence_versions
  WHERE definition_id = p_definition_id
  ORDER BY version_number DESC LIMIT 1;
  SELECT coalesce(max(version_number), 0) + 1 INTO v_next
  FROM public.cadence_versions WHERE definition_id = p_definition_id;

  INSERT INTO public.cadence_versions (
    definition_id, version_number, status, timezone, allowed_window,
    stop_rules, response_behavior, meeting_behavior, change_summary, created_by
  ) VALUES (
    p_definition_id, v_next, 'draft', coalesce(v_source.timezone, 'America/Sao_Paulo'),
    coalesce(v_source.allowed_window, '{"days":[1,2,3,4,5],"start":"09:00","end":"18:00"}'::jsonb),
    coalesce(v_source.stop_rules, '["reply","meeting","opt_out","disqualified","archived","closer_handoff"]'::jsonb),
    coalesce(v_source.response_behavior, 'stop'), coalesce(v_source.meeting_behavior, 'stop'),
    'Rascunho criado a partir da versão anterior', auth.uid()
  ) RETURNING id INTO v_new_id;

  IF v_source.id IS NOT NULL THEN
    INSERT INTO public.cadence_steps (
      version_id, position, delay_seconds, channel, action_kind,
      executor_kind, template_ref, retry_policy, conditions
    ) SELECT v_new_id, position, delay_seconds, channel, action_kind,
      executor_kind, template_ref, retry_policy, conditions
    FROM public.cadence_steps WHERE version_id = v_source.id ORDER BY position;
  END IF;

  INSERT INTO public.cadence_audit_log(entity_type, entity_id, action, actor_id, summary)
  VALUES ('version', v_new_id, 'draft_created', auth.uid(), jsonb_build_object('version_number', v_next));
  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_cadence_version(p_version_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_version public.cadence_versions%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'manager') THEN
    RAISE EXCEPTION 'Somente manager pode publicar versões.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_version FROM public.cadence_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND OR v_version.status <> 'draft' THEN
    RAISE EXCEPTION 'Somente um rascunho existente pode ser publicado.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cadence_steps WHERE version_id = p_version_id) THEN
    RAISE EXCEPTION 'A cadência precisa de pelo menos um passo.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.cadence_versions SET status = 'retired'
  WHERE definition_id = v_version.definition_id AND status = 'published';
  UPDATE public.cadence_versions
  SET status = 'published', published_by = auth.uid(), published_at = now()
  WHERE id = p_version_id;
  UPDATE public.cadence_definitions
  SET active_version_id = p_version_id, enabled = true, activation_mode = 'shadow'
  WHERE id = v_version.definition_id;
  INSERT INTO public.cadence_audit_log(entity_type, entity_id, action, actor_id, summary)
  VALUES ('version', p_version_id, 'published_shadow', auth.uid(), jsonb_build_object('version_number', v_version.version_number));
END;
$$;

REVOKE ALL ON FUNCTION public.create_cadence_draft(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_cadence_version(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_cadence_draft(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_cadence_version(uuid) TO authenticated;

INSERT INTO public.cadence_definitions (
  cadence_key, name, purpose, enabled, activation_mode, audience_rule, created_by
) VALUES (
  'inbound_t0_d14', 'Inbound T0 → D14',
  'Régua inbound canônica; publicada inicialmente somente em shadow, sem atribuição retroativa.',
  false, 'shadow', '{"origins":["inbound"],"requires_no_reply":true}'::jsonb, auth.uid()
) ON CONFLICT (cadence_key) DO NOTHING;

WITH definition AS (
  SELECT id FROM public.cadence_definitions WHERE cadence_key = 'inbound_t0_d14'
), inserted AS (
  INSERT INTO public.cadence_versions (
    definition_id, version_number, status, change_summary, created_by
  )
  SELECT id, 1, 'draft', 'Baseline canônica T0/T+15min/D1/D3/D5/D8/D14; sem reciclagem mensal.', auth.uid()
  FROM definition
  ON CONFLICT (definition_id, version_number) DO NOTHING
  RETURNING id
), version AS (
  SELECT id FROM inserted
  UNION ALL
  SELECT cv.id FROM public.cadence_versions cv JOIN definition d ON d.id = cv.definition_id
  WHERE cv.version_number = 1 LIMIT 1
)
INSERT INTO public.cadence_steps (
  version_id, position, delay_seconds, channel, action_kind, executor_kind, template_ref, conditions
)
SELECT version.id, seed.position, seed.delay_seconds, seed.channel, seed.action_kind,
       seed.executor_kind, seed.template_ref, seed.conditions
FROM version
CROSS JOIN (VALUES
  (1,       0, 'whatsapp', 'send_template', 'automatic', 'inbound.whatsapp.t0',  '{"requires_no_reply":true}'::jsonb),
  (2,     900, 'voice',    'place_call',    'automatic', 'inbound.voice.t15',   '{"requires_no_reply":true,"business_hours_only":true}'::jsonb),
  (3,   86400, 'sms',      'send_template', 'automatic', 'inbound.sms.d1',      '{"requires_no_reply":true}'::jsonb),
  (4,  259200, 'whatsapp', 'send_template', 'automatic', 'inbound.whatsapp.d3', '{"requires_no_reply":true}'::jsonb),
  (5,  432000, 'voice',    'place_call',    'automatic', 'inbound.voice.d5',    '{"requires_no_reply":true,"business_hours_only":true}'::jsonb),
  (6,  691200, 'email',    'send_template', 'automatic', 'inbound.email.d8',    '{"requires_no_reply":true}'::jsonb),
  (7, 1209600, 'whatsapp', 'send_template', 'automatic', 'inbound.whatsapp.d14','{"requires_no_reply":true,"terminal":"nurturing"}'::jsonb)
) AS seed(position, delay_seconds, channel, action_kind, executor_kind, template_ref, conditions)
ON CONFLICT (version_id, position) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;
