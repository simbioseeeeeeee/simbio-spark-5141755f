-- ─────────────────────────────────────────────────────────────────────────────
-- Catálogo comercial — 2026-08-21
--
-- A aba Reunião do CRM chamava GET /api/comercial/catalogo, que NUNCA existiu:
-- o closer via "Catálogo Comercial Indisponível" e não conseguia cotar nem
-- fechar. Os preços passam a viver aqui (o CEO edita sem deploy), e o endpoint
-- só serve o que estiver nesta tabela.
--
-- Valores iniciais vêm do playbook (14/08): alvo R$ 3.000/mês, piso R$ 2.500
-- só com contrapartida. Descontos por compromisso: trimestral -5%, anual -10%.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.comercial_ofertas (
  id                  text PRIMARY KEY,
  label               text NOT NULL,
  audience            text NOT NULL DEFAULT '',
  billing_type        text NOT NULL CHECK (billing_type IN ('one_time', 'recurring')),
  price_brl           numeric,          -- one_time
  base_monthly_brl    numeric,          -- recurring
  setup_brl           numeric NOT NULL DEFAULT 0,
  implementation_business_days int NOT NULL DEFAULT 10,
  commitment_options  text[] NOT NULL DEFAULT ARRAY['mensal','trimestral','anual'],
  includes            text[] NOT NULL DEFAULT '{}',
  excludes            text[] NOT NULL DEFAULT '{}',
  ativo               boolean NOT NULL DEFAULT true,
  ordem               int NOT NULL DEFAULT 100,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.comercial_addons (
  id              text PRIMARY KEY,
  label           text NOT NULL,
  recurring_brl   numeric NOT NULL DEFAULT 0,
  setup_brl       numeric NOT NULL DEFAULT 0,
  unit_brl        numeric NOT NULL DEFAULT 0,
  eligible_offers text[] NOT NULL DEFAULT '{}',
  ativo           boolean NOT NULL DEFAULT true,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- cotações geradas na aba Reunião (o fechamento exige um quote_id real)
CREATE TABLE IF NOT EXISTS public.comercial_cotacoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_cnpj   text NOT NULL,
  offer_id    text NOT NULL,
  commitment  text NOT NULL,
  addons      jsonb NOT NULL DEFAULT '[]',
  quote       jsonb NOT NULL,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comercial_cotacoes_lead_idx
  ON public.comercial_cotacoes (lead_cnpj, created_at DESC);

ALTER TABLE public.comercial_ofertas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comercial_addons   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comercial_cotacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comercial_ofertas_leitura ON public.comercial_ofertas;
CREATE POLICY comercial_ofertas_leitura ON public.comercial_ofertas
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS comercial_addons_leitura ON public.comercial_addons;
CREATE POLICY comercial_addons_leitura ON public.comercial_addons
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS comercial_cotacoes_rw ON public.comercial_cotacoes;
CREATE POLICY comercial_cotacoes_rw ON public.comercial_cotacoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── seed (valores do playbook; o CEO ajusta direto na tabela) ────────────────
INSERT INTO public.comercial_ofertas
  (id, label, audience, billing_type, price_brl, base_monthly_brl, setup_brl,
   implementation_business_days, commitment_options, includes, excludes, ordem)
VALUES
  ('operacao_vendas', 'Operação de Vendas',
   'Imobiliária com time e VGV acima de R$ 1 milhão/mês',
   'recurring', NULL, 3000, 0, 15,
   ARRAY['mensal','trimestral','anual'],
   ARRAY['Agentes de IA atendendo, qualificando e agendando 24/7',
         'Gestão de tráfego (Meta e Google)',
         'CRM com funil, cadência e relatórios',
         'Acompanhamento semanal com o time comercial'],
   ARRAY['Verba de mídia (paga direto às plataformas)',
         'Custo de processamento de IA acima do pacote',
         'Comissão de venda'], 10),

  ('atendimento_ia', 'Atendimento com IA',
   'Imobiliária que já gera demanda e perde lead no atendimento',
   'recurring', NULL, 2500, 0, 10,
   ARRAY['mensal','trimestral','anual'],
   ARRAY['Agente de IA no WhatsApp 24/7',
         'Qualificação e agendamento automáticos',
         'Integração com o CRM do cliente',
         'Painel de conversas e relatórios'],
   ARRAY['Verba de mídia', 'Custo de IA acima do pacote'], 20),

  ('demanda', 'Demanda',
   'Imobiliária que precisa de volume de lead qualificado',
   'recurring', NULL, 2500, 0, 10,
   ARRAY['mensal','trimestral','anual'],
   ARRAY['Gestão de tráfego Meta e Google',
         'Criativos e landing pages',
         'Relatório de origem e custo por lead'],
   ARRAY['Verba de mídia (paga direto às plataformas)'], 30),

  ('imersao', 'Imersão',
   'Quem vai executar internamente com o próprio time',
   'one_time', 5000, NULL, 0, 5,
   ARRAY[]::text[],
   ARRAY['Método completo de operação comercial com IA',
         'Materiais e prompts da casa',
         'Sessões de implantação com o time do cliente'],
   ARRAY['Execução contínua pela Simbiose', 'Verba de mídia'], 40)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.comercial_addons (id, label, recurring_brl, setup_brl, unit_brl, eligible_offers)
VALUES
  ('empreendimento_extra', 'Empreendimento adicional', 400, 0, 0,
   ARRAY['operacao_vendas','atendimento_ia','demanda']),
  ('numero_extra', 'Número de WhatsApp adicional', 250, 0, 0,
   ARRAY['operacao_vendas','atendimento_ia']),
  ('lp_extra', 'Landing page adicional', 0, 600, 600,
   ARRAY['operacao_vendas','demanda'])
ON CONFLICT (id) DO NOTHING;
