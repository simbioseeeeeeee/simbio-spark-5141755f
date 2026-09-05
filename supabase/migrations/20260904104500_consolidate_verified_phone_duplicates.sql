-- Consolida somente os 19 pares revisados em 04/09/2026. Todos têm o mesmo
-- telefone BR completo após remover 55/zero de operadora; não usa casamento
-- genérico por últimos dígitos. O perdedor é preservado na Lixeira.
CREATE TEMP TABLE crm_merge_pairs (perdedor text PRIMARY KEY, destino text NOT NULL) ON COMMIT DROP;

INSERT INTO crm_merge_pairs (perdedor, destino) VALUES
  ('WA-5511944926949', 'FB-1786766712'),
  ('WA-5511963036821', 'FB-1786777214'),
  ('WA-5511973912228', 'FB-1787841306'),
  ('COM-5511996739467', 'LIVE-011996739467'),
  ('WA-5519991745310', 'FB-1786756813'),
  ('WA-5521964391023', 'LIVE-5521964391023'),
  ('WA-5521970032974', 'FB-1786894808'),
  ('COM-5521973148500', 'LIVE-021973148500'),
  ('WA-5521974228040', 'LIVE-5521974228040'),
  ('WA-5521988823298', 'FB-1786731310'),
  ('WA-5522998191049', 'FB-1786906507'),
  ('WA-5522999858449', 'FB-1787019914'),
  ('WA-5534984285497', 'LIVE-34984285497'),
  ('WA-5543996637750', 'FB-1788285007'),
  ('WA-5564992011686', 'FB-1786737311'),
  ('WA-5577981030606', 'FB-1787064315'),
  ('WA-558299815204', 'WA-5582999815204'),
  ('WA-5585986407272', 'FB-1786982657'),
  ('WA-5585996904888', 'LIVE-5585996904888');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM crm_merge_pairs p
    LEFT JOIN public.leads perdedor ON perdedor.cnpj = p.perdedor
    LEFT JOIN public.leads destino ON destino.cnpj = p.destino
    WHERE perdedor.cnpj IS NULL OR destino.cnpj IS NULL
  ) THEN
    RAISE EXCEPTION 'Par de consolidação aponta para lead inexistente';
  END IF;
END;
$$;

-- Conserva dados de contato que só existiam na linha perdedora e anexa notas.
UPDATE public.leads AS destino
SET
  email1 = COALESCE(NULLIF(destino.email1, ''), NULLIF(perdedor.email1, '')),
  email2 = COALESCE(NULLIF(destino.email2, ''), NULLIF(perdedor.email2, '')),
  telefone1 = COALESCE(NULLIF(destino.telefone1, ''), NULLIF(perdedor.telefone1, '')),
  telefone2 = COALESCE(NULLIF(destino.telefone2, ''), NULLIF(perdedor.telefone2, '')),
  celular1 = COALESCE(NULLIF(destino.celular1, ''), NULLIF(perdedor.celular1, '')),
  celular2 = COALESCE(NULLIF(destino.celular2, ''), NULLIF(perdedor.celular2, '')),
  contato_nome = COALESCE(NULLIF(destino.contato_nome, ''), NULLIF(perdedor.contato_nome, '')),
  observacoes_sdr = CASE
    WHEN NULLIF(btrim(perdedor.observacoes_sdr), '') IS NULL THEN destino.observacoes_sdr
    WHEN coalesce(destino.observacoes_sdr, '') ILIKE '%' || btrim(perdedor.observacoes_sdr) || '%' THEN destino.observacoes_sdr
    ELSE concat_ws(E'\n\n', NULLIF(btrim(destino.observacoes_sdr), ''),
      '[Consolidado de ' || perdedor.cnpj || '] ' || btrim(perdedor.observacoes_sdr))
  END,
  observacoes_closer = CASE
    WHEN NULLIF(btrim(perdedor.observacoes_closer), '') IS NULL THEN destino.observacoes_closer
    WHEN coalesce(destino.observacoes_closer, '') ILIKE '%' || btrim(perdedor.observacoes_closer) || '%' THEN destino.observacoes_closer
    ELSE concat_ws(E'\n\n', NULLIF(btrim(destino.observacoes_closer), ''),
      '[Consolidado de ' || perdedor.cnpj || '] ' || btrim(perdedor.observacoes_closer))
  END
FROM crm_merge_pairs p
JOIN public.leads perdedor ON perdedor.cnpj = p.perdedor
WHERE destino.cnpj = p.destino;

-- Move o histórico para que a ficha canônica não perca timeline nem vínculo.
UPDATE public.atividades a SET lead_cnpj = p.destino FROM crm_merge_pairs p WHERE a.lead_cnpj = p.perdedor;
UPDATE public.crm_lead_stage_history h SET lead_cnpj = p.destino FROM crm_merge_pairs p WHERE h.lead_cnpj = p.perdedor;
UPDATE public.crm_whatsapp_followups w SET lead_cnpj = p.destino FROM crm_merge_pairs p WHERE w.lead_cnpj = p.perdedor;
UPDATE public.comunidade_membros m SET lead_cnpj = p.destino FROM crm_merge_pairs p WHERE m.lead_cnpj = p.perdedor;

-- Evita colisão dos índices parciais de tarefa/cadência ativa.
UPDATE public.sales_tasks t
SET status = 'cancelada'
FROM crm_merge_pairs p
WHERE t.lead_cnpj = p.perdedor
  AND t.status = 'pendente'
  AND EXISTS (
    SELECT 1 FROM public.sales_tasks d
    WHERE d.lead_cnpj = p.destino AND d.task_type = t.task_type AND d.status = 'pendente'
  );
UPDATE public.sales_tasks t SET lead_cnpj = p.destino FROM crm_merge_pairs p WHERE t.lead_cnpj = p.perdedor;

UPDATE public.lead_cadence_assignments a
SET status = 'cancelled', stopped_at = now(), stop_reason = 'Lead consolidado em ' || p.destino
FROM crm_merge_pairs p
WHERE a.lead_cnpj = p.perdedor
  AND a.status IN ('active', 'paused')
  AND EXISTS (
    SELECT 1 FROM public.lead_cadence_assignments d
    WHERE d.lead_cnpj = p.destino AND d.status IN ('active', 'paused')
  );
UPDATE public.lead_cadence_assignments a SET lead_cnpj = p.destino FROM crm_merge_pairs p WHERE a.lead_cnpj = p.perdedor;

INSERT INTO public.leads_fundidos (perdedor, destino, origem)
SELECT perdedor, destino, 'telefone-br-revisado-20260904' FROM crm_merge_pairs
ON CONFLICT (perdedor) DO UPDATE SET destino = EXCLUDED.destino, origem = EXCLUDED.origem;

UPDATE public.leads AS l
SET
  deleted_previous_state = COALESCE(
    l.deleted_previous_state,
    jsonb_build_object(
      'status_sdr', l.status_sdr,
      'estagio_funil', l.estagio_funil,
      'responsavel_sdr', l.responsavel_sdr,
      'responsavel_closer', l.responsavel_closer,
      'data_proximo_passo', l.data_proximo_passo
    )
  ),
  deleted_at = now(),
  deletion_reason = 'Duplicidade consolidada em ' || p.destino
FROM crm_merge_pairs p
WHERE l.cnpj = p.perdedor AND l.deleted_at IS NULL;
