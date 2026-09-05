-- Reconciliação baseada na atividade comercial de 13/08/2026:
-- "VENDA FECHADA — Progetti Construtora ... R$ 3.000/mês, 12 meses,
-- sem implantação. Indicação netspaces."
UPDATE public.leads
SET mrr_proposta = 3000.00,
    origem_comercial = 'indicacao',
    indicado_por = 'Netspaces',
    updated_at = now()
WHERE cnpj = 'REU-160013ec8c99'
  AND estagio_funil = 'Fechado Ganho'
  AND mrr_proposta IS NULL;

INSERT INTO public.atividades (
  lead_cnpj, tipo_atividade, resultado, nota, canal, direcao,
  created_by, playbook_version, origem, metadados
)
SELECT
  'REU-160013ec8c99', 'nota', 'sucesso',
  '[mrr-backfill:2026-08-31] MRR R$ 3.000 confirmado pela nota de venda de 13/08/2026; origem indicação Netspaces.',
  'crm', 'in', 'crm-data-reconciliation', 'simbiose-sales-v2@2.1.0',
  'crm_data_reconciliation',
  jsonb_build_object(
    'event', 'mrr_reconciled',
    'evidence_activity_at', '2026-08-13T23:05:36.719534+00:00',
    'mrr', 3000,
    'source', 'commercial_activity_note'
  )
WHERE EXISTS (
  SELECT 1 FROM public.leads
  WHERE cnpj = 'REU-160013ec8c99'
    AND mrr_proposta = 3000.00
)
AND NOT EXISTS (
  SELECT 1 FROM public.atividades
  WHERE lead_cnpj = 'REU-160013ec8c99'
    AND nota LIKE '[mrr-backfill:2026-08-31]%'
);

NOTIFY pgrst, 'reload schema';
