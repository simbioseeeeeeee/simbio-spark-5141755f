import { supabase } from "@/integrations/supabase/client";
import { Lead } from "@/types/lead";

const PAGE_SIZE = 50;

// mdewbruvzrrxezsbyzmq tem socios como colunas flat (socio1_nome...socio5_nome).
// Aqui sintetizamos em array pra manter compatibilidade com Lead.socios[].
function flatSocios(row: any) {
  const out: any[] = [];
  for (let i = 1; i <= 5; i++) {
    const nome = row[`socio${i}_nome`];
    if (!nome) continue;
    out.push({
      nome,
      telefone1: row[`socio${i}_telefone1`] || undefined,
      telefone2: row[`socio${i}_telefone2`] || undefined,
      celular1: row[`socio${i}_celular1`] || undefined,
      celular2: row[`socio${i}_celular2`] || undefined,
      email1: row[`socio${i}_email1`] || undefined,
    });
  }
  return out;
}

function rowToLead(row: any): Lead {
  return {
    // PK oficial do mdew é cnpj; mantém id pra React keys e compat
    id: row.id || row.cnpj || "",
    cnpj: row.cnpj || "",
    razao_social: row.razao_social || "",
    fantasia: row.fantasia || "",
    data_abertura: row.data_abertura || "",
    situacao: row.situacao || "",
    cnae_descricao: row.cnae_descricao || "",
    logradouro: row.logradouro || "",
    numero: row.numero || "",
    complemento: row.complemento || "",
    bairro: row.bairro || "",
    cidade: row.cidade || "",
    uf: row.uf || "",
    cep: row.cep || "",
    telefone1: row.telefone1 || "",
    telefone2: row.telefone2 || "",
    celular1: row.celular1 || "",
    celular2: row.celular2 || "",
    email1: row.email1 || "",
    email2: row.email2 || "",
    socios: Array.isArray(row.socios) ? row.socios : flatSocios(row),
    status_sdr: row.status_sdr || "A Contatar",
    possui_site: row.possui_site ?? false,
    url_site: row.url_site || "",
    instagram_ativo: row.instagram_ativo ?? false,
    url_instagram: row.url_instagram || "",
    faz_anuncios: row.faz_anuncios ?? false,
    whatsapp_automacao: row.whatsapp_automacao ?? false,
    whatsapp_humano: row.whatsapp_humano ?? false,
    observacoes_sdr: row.observacoes_sdr || "",
    // "Reunião Realizada"/"Negociação" são vocabulário legado do backend —
    // sem normalizar, o lead some do quadro e transições dão erro
    estagio_funil: ({ "Reunião Realizada": "Diagnóstico Realizado",
                      "Negociação": "Em Negociação" } as Record<string, string>)[
                     String(row.estagio_funil)] ?? row.estagio_funil ?? null,
    data_proximo_passo: row.data_proximo_passo || null,
    observacoes_closer: row.observacoes_closer || "",
    pesquisa_realizada: row.pesquisa_realizada ?? false,
    lead_score: row.lead_score ?? null,
    status_cadencia: row.status_cadencia || "ativo",
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
    origem_lead: row.origem_lead ?? null,
    tipo_lead: row.tipo_lead ?? null,
    origem_comercial: row.origem_comercial ?? null,
    indicado_por: row.indicado_por ?? null,
    tipo_conta_comercial: row.tipo_conta_comercial ?? null,
    numero_corretores: row.numero_corretores ?? null,
    icp_confirmado: row.icp_confirmado ?? null,
    temperatura: row.temperatura ?? null,
    mrr_proposta: row.mrr_proposta == null ? null : Number(row.mrr_proposta),
    proposta_realizada_em: row.proposta_realizada_em ?? null,
    proposta_aprovada_em: row.proposta_aprovada_em ?? null,
    proposta_assinada_em: row.proposta_assinada_em ?? null,
    reuniao_realizada_em: row.reuniao_realizada_em ?? null,
    no_show_em: row.no_show_em ?? null,
    // Campos nativos do mdew
    responsavel_sdr: row.responsavel_sdr || null,
    responsavel_closer: row.responsavel_closer || null,
    motivo_perda: row.motivo_perda || null,
    stage_changed_at: row.stage_changed_at || null,
    tentativas_followup: row.tentativas_followup ?? null,
    data_ultimo_contato: row.data_ultimo_contato || null,
    qtde_funcionarios: row.qtde_funcionarios ?? null,
    cnae: row.cnae || null,
    cnae_grupo: row.cnae_grupo || null,
    cnae_setor: row.cnae_setor || null,
    tipo_empresa: row.tipo_empresa || null,
    deleted_at: row.deleted_at || null,
    deleted_by: row.deleted_by || null,
    deletion_reason: row.deletion_reason || null,
  };
}

export type StatusTab =
  | "all"
  | "A Contatar"
  | "Em Qualificação"
  | "Qualificado"
  | "Reunião Agendada"
  | "Em Negociação"
  | "Fechado Ganho"
  | "Fechado Perdido"
  | "Nurturing"
  | "Opt-out"
  | "Desqualificado"
  | "Lixeira";

export interface OverhaulQuery {
  page: number;
  tab: StatusTab;
  origens?: string[];        // array de origem_lead a incluir
  tipos?: string[];          // array de tipo_lead a incluir
  hideAcelerador?: boolean;  // se true, exclui tipo_lead=programa_acelerador
  responsavelId?: string | null;
  cidade?: string | null;
  uf?: string | null;
  lastDays?: number | null;  // 7 | 30 | 90 | null
  search?: string;
  closerReadyOnly?: boolean; // estagio_funil IS NOT NULL
}

export interface OverhaulResult {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
}

function applyCommonFilters(query: any, q: OverhaulQuery) {
  query = q.tab === "Lixeira"
    ? query.not("deleted_at", "is", null)
    : query.is("deleted_at", null);

  // Tabs usam apenas o vocabulário canônico do playbook V2.
  if (q.tab !== "all" && q.tab !== "Lixeira") {
    if (q.tab === "Desqualificado") {
      query = query.eq("status_sdr", "Desqualificado");
    } else if (q.tab === "Em Negociação") {
      query = query.in("estagio_funil", ["Diagnóstico Realizado", "Proposta Enviada", "Em Negociação", "Aguardando Aceite", "Aguardando Pagamento"]);
    } else if (q.tab === "Fechado Ganho" || q.tab === "Fechado Perdido") {
      query = query.eq("estagio_funil", q.tab);
    } else {
      query = query.eq("status_sdr", q.tab);
    }
  }

  if (q.origens && q.origens.length > 0) {
    query = query.in("origem_lead", q.origens);
  }

  if (q.tipos && q.tipos.length > 0) {
    query = query.in("tipo_lead", q.tipos);
  } else if (q.hideAcelerador) {
    query = query.or("tipo_lead.neq.programa_acelerador,tipo_lead.is.null");
  }

  if (q.responsavelId) {
    // mdew usa responsavel_sdr (string nome), não sdr_id UUID
    query = query.eq("responsavel_sdr", q.responsavelId);
  }

  if (q.cidade && q.cidade !== "__all__") {
    query = query.ilike("cidade", `%${q.cidade}%`);
  }
  if (q.uf && q.uf !== "__all__") {
    query = query.eq("uf", q.uf);
  }

  if (q.lastDays && q.lastDays > 0) {
    const since = new Date();
    since.setDate(since.getDate() - q.lastDays);
    query = query.gte("updated_at", since.toISOString());
  }

  if (q.closerReadyOnly) {
    query = query.not("estagio_funil", "is", null);
  }

  if (q.search?.trim()) {
    const raw = q.search.trim();
    const s = `%${raw}%`;
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 6) {
      const sd = `%${digits}%`;
      query = query.or(
        `razao_social.ilike.${s},fantasia.ilike.${s},contato_nome.ilike.${s},cnpj.ilike.${s},cnpj.ilike.${sd},celular1.ilike.${s},celular1.ilike.${sd},email1.ilike.${s}`
      );
    } else {
      query = query.or(
        `razao_social.ilike.${s},fantasia.ilike.${s},contato_nome.ilike.${s},cnpj.ilike.${s},celular1.ilike.${s},email1.ilike.${s}`
      );
    }
  }

  return query;
}

export async function getLeadsOverhaul(q: OverhaulQuery): Promise<OverhaulResult> {
  let query = supabase.from("leads").select("*", { count: "exact" });
  query = applyCommonFilters(query, q);

  const from = q.page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await query
    .order("updated_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (error) throw error;
  return {
    leads: (data || []).map(rowToLead),
    total: count ?? 0,
    page: q.page,
    pageSize: PAGE_SIZE,
  };
}

/** Retorna contagem filtrada mas SEM restrição de tab (pra badges das tabs) */
export async function getTabCounts(
  baseFilters: Omit<OverhaulQuery, "page" | "tab" | "closerReadyOnly">
): Promise<Record<StatusTab, number>> {
  const tabs: StatusTab[] = [
    "all",
    "A Contatar",
    "Em Qualificação",
    "Qualificado",
    "Reunião Agendada",
    "Em Negociação",
    "Fechado Ganho",
    "Fechado Perdido",
    "Nurturing",
    "Opt-out",
    "Desqualificado",
    "Lixeira",
  ];

  const results = await Promise.all(
    tabs.map(async (tab) => {
      let q = supabase.from("leads").select("*", { count: "exact", head: true });
      q = applyCommonFilters(q, { ...baseFilters, tab, page: 0 });
      const { count, error } = await q;
      if (error) return [tab, 0] as const;
      return [tab, count ?? 0] as const;
    })
  );

  const out: Record<string, number> = {};
  results.forEach(([tab, n]) => {
    out[tab] = n;
  });
  return out as Record<StatusTab, number>;
}

/** Lead por CNPJ */
export async function getLeadByCnpj(cnpj: string): Promise<Lead | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("cnpj", cnpj)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToLead(data) : null;
}

/** Lead por CNPJ; o parâmetro preserva o nome antigo por compatibilidade da UI. */
export async function getLeadById(idOrCnpj: string): Promise<Lead | null> {
  if (!idOrCnpj) return null;
  const byCnpj = await supabase
    .from("leads")
    .select("*")
    .eq("cnpj", idOrCnpj)
    .maybeSingle();
  if (byCnpj.error) throw byCnpj.error;
  return byCnpj.data ? rowToLead(byCnpj.data) : null;
}

/** Valores distintos de responsável — lê direto da tabela leads (mdew não tem user_roles) */
export async function getDistinctResponsaveis(): Promise<
  { user_id: string; nome: string; role: string }[]
> {
  const [sdrs, closers] = await Promise.all([
    supabase.from("leads").select("responsavel_sdr").is("deleted_at", null).not("responsavel_sdr", "is", null).limit(5000),
    supabase.from("leads").select("responsavel_closer").is("deleted_at", null).not("responsavel_closer", "is", null).limit(5000),
  ]);

  const names = new Map<string, string>();
  (sdrs.data || []).forEach((r: any) => {
    const n = (r.responsavel_sdr || "").trim();
    if (n) names.set(n, "sdr");
  });
  (closers.data || []).forEach((r: any) => {
    const n = (r.responsavel_closer || "").trim();
    if (n) {
      names.set(n, names.get(n) === "sdr" ? "sdr+closer" : "closer");
    }
  });

  return Array.from(names.entries())
    .map(([nome, role]) => ({ user_id: nome, nome, role }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

/** Distribuição agregada por origem_lead (para dashboard pizza) */
export async function getOrigemDistribution(): Promise<{ origem: string; total: number }[]> {
  // PostgREST não agrega — usamos contagens separadas por valor
  const origens = [
    "receita_federal",
    "bitrix_migrado",
    "whatsapp_entrante",
    "facebook_ads",
    "teste",
  ];
  const results = await Promise.all(
    origens.map(async (origem) => {
      const { count, error } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("origem_lead", origem);
      if (error) return { origem, total: 0 };
      return { origem, total: count ?? 0 };
    })
  );
  return results;
}

/** Distribuição por status_sdr */
export async function getStatusDistribution(hideAcelerador = true): Promise<
  { status: string; total: number }[]
> {
  const statuses = [
    "A Contatar",
    "Em Qualificação",
    "Qualificado",
    "Reunião Agendada",
    "Nurturing",
    "Opt-out",
    "Desqualificado",
  ];
  const results = await Promise.all(
    statuses.map(async (s) => {
      let q = supabase.from("leads").select("*", { count: "exact", head: true }).is("deleted_at", null);
      if (s === "Desqualificado") {
        q = q.eq("status_sdr", "Desqualificado");
      } else {
        q = q.eq("status_sdr", s);
      }
      if (hideAcelerador) {
        q = q.or("tipo_lead.neq.programa_acelerador,tipo_lead.is.null");
      }
      const { count, error } = await q;
      if (error) return { status: s, total: 0 };
      return { status: s, total: count ?? 0 };
    })
  );
  return results;
}

/** Métricas do dashboard home */
export interface DashboardMetrics {
  leads_ativos: number;
  novos_7d: number;
  taxa_reuniao: number;
  prontos_closer: number;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  // Ativos excluem saídas e terminais do playbook V2.
  const { count: ativos } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .not("status_sdr", "in", '("Nurturing","Desqualificado","Opt-out")')
    .or('estagio_funil.is.null,estagio_funil.not.in.("Nurturing","Desqualificado","Opt-out","Fechado Perdido","Fechado Ganho")')
    .or("tipo_lead.neq.programa_acelerador,tipo_lead.is.null");

  // novos 7d
  const sevenAgo = new Date();
  sevenAgo.setDate(sevenAgo.getDate() - 7);
  const { count: novos } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .gte("updated_at", sevenAgo.toISOString())
    .or("tipo_lead.neq.programa_acelerador,tipo_lead.is.null");

  // taxa de conversão: "A Contatar" + "Reunião Agendada" → taxa
  const { count: aContatar } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("status_sdr", "A Contatar")
    .or("tipo_lead.neq.programa_acelerador,tipo_lead.is.null");
  const { count: reuniao } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("status_sdr", "Reunião Agendada")
    .or("tipo_lead.neq.programa_acelerador,tipo_lead.is.null");

  const totalFunil = (aContatar ?? 0) + (reuniao ?? 0);
  const taxa = totalFunil > 0 ? ((reuniao ?? 0) / totalFunil) * 100 : 0;

  // Pipeline em curso, sem saídas e terminais.
  const { count: prontos } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .not("estagio_funil", "is", null)
    .not("estagio_funil", "in", '("Nurturing","Desqualificado","Opt-out","Fechado Perdido","Fechado Ganho")');

  return {
    leads_ativos: ativos ?? 0,
    novos_7d: novos ?? 0,
    taxa_reuniao: Math.round(taxa * 10) / 10,
    prontos_closer: prontos ?? 0,
  };
}

/** Últimos 10 leads atualizados */
export async function getRecentLeads(limit = 10): Promise<Lead[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .is("deleted_at", null)
    .or("tipo_lead.neq.programa_acelerador,tipo_lead.is.null")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(rowToLead);
}

/** Tira o lead da operação SEM apagar histórico: Arquivo Morto + fora do pipeline.
 *  (Excluir de verdade apagaria atividades e faria o pos-reuniao recriar o card.) */
export async function archiveLead(cnpj: string): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({ status_sdr: "Arquivo Morto", estagio_funil: null })
    .eq("cnpj", cnpj)
    .is("deleted_at", null);
  if (error) throw error;
}

export async function softDeleteLead(cnpj: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("crm_soft_delete_lead", {
    p_cnpj: cnpj,
    p_reason: reason,
    p_confirmation: cnpj,
  });
  if (error) throw error;
}

export async function restoreDeletedLead(cnpj: string): Promise<void> {
  const { error } = await supabase.rpc("crm_restore_deleted_lead", { p_cnpj: cnpj });
  if (error) throw error;
}
