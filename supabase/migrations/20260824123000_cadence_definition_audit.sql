BEGIN;

ALTER TABLE public.cadence_steps
  DROP CONSTRAINT IF EXISTS cadence_steps_channel_action_chk;
ALTER TABLE public.cadence_steps
  ADD CONSTRAINT cadence_steps_channel_action_chk CHECK (
    (channel = 'voice' AND action_kind = 'place_call') OR
    (channel = 'human_task' AND action_kind IN ('create_task','notify_owner')) OR
    (channel IN ('whatsapp','sms','email') AND action_kind = 'send_template')
  );

CREATE OR REPLACE FUNCTION public.create_cadence_definition(
  p_cadence_key text,
  p_name text,
  p_purpose text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_definition_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'manager') THEN
    RAISE EXCEPTION 'Somente manager pode criar cadências.' USING ERRCODE = '42501';
  END IF;
  IF p_cadence_key !~ '^[a-z0-9_]+$' OR length(p_cadence_key) > 80 THEN
    RAISE EXCEPTION 'A chave deve usar apenas letras minúsculas, números e underscore.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.cadence_definitions (
    cadence_key, name, purpose, enabled, activation_mode, audience_rule, created_by
  ) VALUES (
    p_cadence_key, btrim(p_name), btrim(p_purpose), false, 'shadow', '{}'::jsonb, auth.uid()
  ) RETURNING id INTO v_definition_id;

  INSERT INTO public.cadence_versions (
    definition_id, version_number, status, change_summary, created_by
  ) VALUES (
    v_definition_id, 1, 'draft', 'Primeiro rascunho da cadência.', auth.uid()
  );

  INSERT INTO public.cadence_audit_log(entity_type, entity_id, action, actor_id, summary)
  VALUES (
    'definition', v_definition_id, 'definition_created', auth.uid(),
    jsonb_build_object('cadence_key', p_cadence_key, 'activation_mode', 'shadow')
  );
  RETURN v_definition_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe uma cadência com esta chave.' USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.create_cadence_definition(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_cadence_definition(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_cadence_definition_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.cadence_audit_log(entity_type, entity_id, action, actor_id, summary)
    VALUES (
      'definition', NEW.id, 'definition_updated', auth.uid(),
      jsonb_build_object(
        'enabled_before', OLD.enabled,
        'enabled_after', NEW.enabled,
        'activation_mode_before', OLD.activation_mode,
        'activation_mode_after', NEW.activation_mode,
        'active_version_changed', OLD.active_version_id IS DISTINCT FROM NEW.active_version_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cadence_definitions_audit_update ON public.cadence_definitions;
CREATE TRIGGER cadence_definitions_audit_update
AFTER UPDATE ON public.cadence_definitions
FOR EACH ROW EXECUTE FUNCTION public.audit_cadence_definition_change();

CREATE OR REPLACE FUNCTION public.audit_cadence_step_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
  v_version_id uuid;
  v_position integer;
  v_channel text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.id;
    v_version_id := OLD.version_id;
    v_position := OLD.position;
    v_channel := OLD.channel;
  ELSE
    v_id := NEW.id;
    v_version_id := NEW.version_id;
    v_position := NEW.position;
    v_channel := NEW.channel;
  END IF;
  INSERT INTO public.cadence_audit_log(entity_type, entity_id, action, actor_id, summary)
  VALUES (
    'step', v_id, lower(TG_OP), auth.uid(),
    jsonb_build_object(
      'version_id', v_version_id,
      'position', v_position,
      'channel', v_channel
    )
  );
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cadence_steps_audit_change ON public.cadence_steps;
CREATE TRIGGER cadence_steps_audit_change
AFTER INSERT OR UPDATE OR DELETE ON public.cadence_steps
FOR EACH ROW EXECUTE FUNCTION public.audit_cadence_step_change();

NOTIFY pgrst, 'reload schema';
COMMIT;
