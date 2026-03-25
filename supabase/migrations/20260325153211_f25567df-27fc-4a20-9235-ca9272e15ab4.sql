ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS pesquisa_realizada boolean NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_score integer DEFAULT null;