
-- Melhoria 4: Add canal_preferido column
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS canal_preferido text NOT NULL DEFAULT 'nao_definido';

-- Melhoria 4: Auto-suggestion trigger
CREATE OR REPLACE FUNCTION public.sugerir_canal_preferido()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.tipo_atividade IN ('whatsapp_in', 'WhatsApp') AND NEW.resultado IN ('Respondeu', 'Conectado') THEN
    UPDATE leads SET canal_preferido = 'whatsapp' WHERE id = NEW.lead_id AND canal_preferido = 'nao_definido';
  ELSIF NEW.tipo_atividade IN ('email_in', 'Email') AND NEW.resultado IN ('Respondeu', 'Conectado') THEN
    UPDATE leads SET canal_preferido = 'email' WHERE id = NEW.lead_id AND canal_preferido = 'nao_definido';
  ELSIF NEW.tipo_atividade = 'Ligação' AND NEW.resultado IN ('Atendeu', 'Conectado', 'Agendou Reunião') THEN
    UPDATE leads SET canal_preferido = 'telefone' WHERE id = NEW.lead_id AND canal_preferido = 'nao_definido';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sugerir_canal_trigger
AFTER INSERT ON public.atividades
FOR EACH ROW EXECUTE FUNCTION public.sugerir_canal_preferido();

-- Melhoria 3: Function to get last contact for multiple leads (batch)
CREATE OR REPLACE FUNCTION public.get_leads_last_contact(p_lead_ids uuid[])
RETURNS TABLE(lead_id uuid, ultimo_contato_em timestamptz, ultimo_contato_tipo text)
LANGUAGE sql STABLE SET search_path = 'public'
AS $$
  SELECT DISTINCT ON (a.lead_id)
    a.lead_id,
    a.created_at AS ultimo_contato_em,
    a.tipo_atividade AS ultimo_contato_tipo
  FROM public.atividades a
  WHERE a.lead_id = ANY(p_lead_ids)
  ORDER BY a.lead_id, a.created_at DESC;
$$;
