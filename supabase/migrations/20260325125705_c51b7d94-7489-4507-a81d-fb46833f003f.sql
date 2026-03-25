-- Create leads table
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cnpj TEXT UNIQUE,
  razao_social TEXT,
  fantasia TEXT,
  data_abertura TEXT,
  situacao TEXT,
  cnae_descricao TEXT,
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  telefone1 TEXT,
  telefone2 TEXT,
  celular1 TEXT,
  celular2 TEXT,
  email1 TEXT,
  email2 TEXT,
  socios JSONB DEFAULT '[]'::jsonb,
  status_sdr TEXT NOT NULL DEFAULT 'A Contatar',
  possui_site BOOLEAN NOT NULL DEFAULT false,
  url_site TEXT DEFAULT '',
  instagram_ativo BOOLEAN NOT NULL DEFAULT false,
  url_instagram TEXT DEFAULT '',
  faz_anuncios BOOLEAN NOT NULL DEFAULT false,
  observacoes_sdr TEXT DEFAULT '',
  estagio_funil TEXT,
  valor_negocio_estimado NUMERIC,
  data_proximo_passo TIMESTAMPTZ,
  observacoes_closer TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Allow all operations (internal CRM, no user auth)
CREATE POLICY "Allow all select" ON public.leads FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON public.leads FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON public.leads FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON public.leads FOR DELETE USING (true);

-- Indexes
CREATE INDEX idx_leads_status_sdr ON public.leads (status_sdr);
CREATE INDEX idx_leads_estagio_funil ON public.leads (estagio_funil);
CREATE INDEX idx_leads_cnpj ON public.leads (cnpj);