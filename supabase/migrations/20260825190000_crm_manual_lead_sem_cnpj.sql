-- 25/08/2026 — cadastro manual SEM CNPJ (pedido do CEO: lead atendido no WhatsApp não tem
-- CNPJ à mão; a tela exigia 14 dígitos e a SDR não conseguia cadastrar quem chamou).
--
-- Regras:
--   • p_cnpj vazio  → código gerado pela ORIGEM + telefone (WA-/IG-/CIMI-/LIVE-/IND-/MAN-),
--                     telefone obrigatório (10-13 dígitos), dedupe por telefone (avisa qual
--                     ficha já existe) — origem_lead/tipo_lead são colunas GERADAS pelo prefixo.
--   • p_cnpj 14 dígitos → comportamento antigo (valida CNPJ, checa duplicata por CNPJ).
--   • 'indicacao' passa a ser origem aceita (prefixo IND-; a coluna gerada ainda lê 'outros'
--     até o prefixo ser adicionado à expressão — registrado em observacoes).
--   • razão social aceita o nome da pessoa quando não se sabe a empresa.

CREATE OR REPLACE FUNCTION public.crm_create_manual_lead(
  p_cnpj text,
  p_razao_social text,
  p_fantasia text DEFAULT NULL,
  p_contato_nome text DEFAULT NULL,
  p_celular text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_cidade text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_origem text DEFAULT 'outros',
  p_observacoes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := coalesce(auth.jwt() ->> 'email', 'crm');
  v_role text;
  v_actor_name text;
  v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  v_razao text := nullif(btrim(coalesce(p_razao_social, '')), '');
  v_phone text := regexp_replace(coalesce(p_celular, ''), '\D', '', 'g');
  v_origin text := coalesce(nullif(btrim(p_origem), ''), 'outros');
  v_prefixo text;
  v_existente text;
  v_obs text := nullif(btrim(coalesce(p_observacoes, '')), '');
  v_row public.leads%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sessao expirada' USING ERRCODE = '42501';
  END IF;
  SELECT role::text, nullif(btrim(nome), '')
    INTO v_role, v_actor_name
  FROM public.user_roles
  WHERE user_id = v_actor
  LIMIT 1;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'usuario sem papel no CRM' USING ERRCODE = '42501';
  END IF;

  IF v_origin NOT IN (
    'receita_federal', 'bitrix_migrado', 'whatsapp_entrante', 'facebook_ads',
    'whatsapp_uchat', 'instagram_manual', 'live_simbiose', 'evento_cimi360',
    'indicacao', 'teste', 'outros'
  ) THEN
    RAISE EXCEPTION 'origem de lead invalida';
  END IF;
  IF v_phone <> '' AND length(v_phone) NOT BETWEEN 10 AND 13 THEN
    RAISE EXCEPTION 'telefone deve ter entre 10 e 13 digitos';
  END IF;
  IF nullif(btrim(coalesce(p_email, '')), '') IS NOT NULL
     AND btrim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'email invalido';
  END IF;
  IF upper(coalesce(p_uf, '')) <> '' AND upper(btrim(p_uf)) !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'UF invalida';
  END IF;

  -- nome: empresa OU, se não souber, o nome da pessoa
  IF v_razao IS NULL THEN
    v_razao := nullif(btrim(coalesce(p_fantasia, '')), '');
  END IF;
  IF v_razao IS NULL THEN
    v_razao := nullif(btrim(coalesce(p_contato_nome, '')), '');
  END IF;
  IF v_razao IS NULL OR length(v_razao) < 2 THEN
    RAISE EXCEPTION 'informe a empresa ou o nome da pessoa';
  END IF;

  IF v_cnpj = '' THEN
    -- SEM CNPJ: telefone identifica o lead; código pelo prefixo da origem
    IF v_phone = '' THEN
      RAISE EXCEPTION 'sem CNPJ, o telefone e obrigatorio';
    END IF;
    IF length(v_phone) IN (10, 11) THEN
      v_phone := '55' || v_phone;   -- DDI Brasil, padrão das fichas WA-/LIVE-
    END IF;
    v_prefixo := CASE v_origin
      WHEN 'whatsapp_uchat'   THEN 'WA-'
      WHEN 'whatsapp_entrante' THEN 'WA-'
      WHEN 'instagram_manual' THEN 'IG-'
      WHEN 'evento_cimi360'   THEN 'CIMI-'
      WHEN 'live_simbiose'    THEN 'LIVE-'
      WHEN 'facebook_ads'     THEN 'FB-'
      WHEN 'indicacao'        THEN 'IND-'
      ELSE 'MAN-'
    END;
    v_cnpj := v_prefixo || v_phone;
    -- dedupe por telefone (qualquer prefixo) — avisa qual ficha já existe
    SELECT cnpj INTO v_existente FROM public.leads
     WHERE deleted_at IS NULL
       AND (cnpj = v_cnpj
            OR regexp_replace(coalesce(celular1, ''), '\D', '', 'g') LIKE '%' || right(v_phone, 8)
            OR regexp_replace(coalesce(telefone1, ''), '\D', '', 'g') LIKE '%' || right(v_phone, 8))
     ORDER BY (cnpj = v_cnpj) DESC, created_at DESC
     LIMIT 1;
    IF v_existente IS NOT NULL THEN
      RAISE EXCEPTION 'ja existe ficha com este telefone: % — abra essa ficha em vez de cadastrar de novo', v_existente;
    END IF;
    IF v_origin = 'indicacao' THEN
      v_obs := concat_ws(' | ', '[origem: indicação]', v_obs);
    END IF;
  ELSE
    IF NOT public.crm_valid_cnpj(v_cnpj) THEN
      RAISE EXCEPTION 'CNPJ invalido';
    END IF;
    IF EXISTS (SELECT 1 FROM public.leads WHERE cnpj = v_cnpj AND deleted_at IS NOT NULL) THEN
      RAISE EXCEPTION 'CNPJ esta na Lixeira; restaure o lead em vez de cadastrar novamente';
    END IF;
    IF EXISTS (SELECT 1 FROM public.leads WHERE cnpj = v_cnpj) THEN
      RAISE EXCEPTION 'CNPJ ja cadastrado';
    END IF;
  END IF;

  INSERT INTO public.leads (
    cnpj, razao_social, fantasia, contato_nome, celular1, email1, cidade, uf,
    observacoes_sdr, status_sdr, status_cadencia,
    responsavel_sdr, playbook_version
  ) VALUES (
    v_cnpj, v_razao, coalesce(nullif(btrim(p_fantasia), ''), v_razao), nullif(btrim(p_contato_nome), ''),
    nullif(v_phone, ''), lower(nullif(btrim(p_email), '')), nullif(btrim(p_cidade), ''),
    upper(nullif(btrim(p_uf), '')),
    v_obs, 'A Contatar', 'ativo',
    CASE WHEN v_role = 'sdr' THEN coalesce(v_actor_name, v_email) ELSE NULL END,
    'simbiose-sales-v2@2.1.0'
  )
  RETURNING * INTO v_row;

  INSERT INTO public.atividades (
    lead_cnpj, tipo_atividade, resultado, nota, canal, direcao, created_by,
    origem, metadados, playbook_version
  ) VALUES (
    v_cnpj, 'nota', 'sucesso',
    format('Lead cadastrado manualmente por %s (origem: %s)', v_email, v_origin),
    'crm', 'out', v_email, 'cadastro_manual',
    jsonb_build_object('actor_id', v_actor, 'actor_role', v_role, 'origin', v_origin, 'sem_cnpj', p_cnpj IS NULL OR btrim(p_cnpj) = ''),
    'simbiose-sales-v2@2.1.0'
  );

  RETURN to_jsonb(v_row);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'ja existe ficha com este codigo: %', v_cnpj;
END;
$$;

NOTIFY pgrst, 'reload schema';
