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
    estagio_funil: row.estagio_funil || null,
    valor_negocio_estimado: row.valor_negocio_estimado ?? null,
    data_proximo_passo: row.data_proximo_passo || null,
    observacoes_closer: row.observacoes_closer || "",
    pesquisa_realizada: row.pesquisa_realizada ?? false,
    lead_score: row.lead_score ?? null,
    dia_cadencia: row.dia_cadencia ?? 0,
    status_cadencia: row.status_cadencia || "ativo",
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
    origem_lead: row.origem_lead ?? null,
    tipo_lead: row.tipo_lead ?? null,
    owner_id: row.owner_id || row.responsavel_closer || null,
    sdr_id: row.sdr_id || row.responsavel_sdr || null,
    canal_preferido: row.canal_preferido || "nao_definido",
    // Campos nativos do mdew
    responsavel_sdr: row.responsavel_sdr || null,
    responsavel_closer: row.responsavel_closer || null,
    motivo_perda: row.motivo_perda || null,
    tentativas_followup: row.tentativas_followup ?? null,
    data_ultimo_contato: row.data_ultimo_contato || null,
    qtde_funcionarios: row.qtde_funcionarios ?? null,
    cnae: row.cnae || null,
    cnae_grupo: row.cnae_grupo || null,
    cnae_setor: row.cnae_setor || null,
    tipo_empresa: row.tipo_empresa || null,
  };
}

export type StatusTab =
  | "all"
  | "A Contatar"
  | "Prospectado"
  | "Qualificado"
  | "Reunião Agendada"
  | "Negociação"
  | "Cliente Ativo"
  | "Desqualificado";

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
  // Tab by status_sdr — mdew usa: A Contatar, Prospectado, Qualificado,
  // Reunião Agendada, Cliente Ativo, Desqualificado. "Negociação" só existe em estagio_funil.
  if (q.tab !== "all") {
    if (q.tab === "Desqualificado") {
      query = query.like("status_sdr", "Desqualificado%");
    } else if (q.tab === "Negociação") {
      // não tem status_sdr — filtra por estagio_funil (aceita ambas variantes)
      query = query.in("estagio_funil", ["Negociação", "Em Negociação", "Proposta Enviada", "Reunião Realizada"]);
    } else if (q.tab === "Cliente Ativo") {
      // casa status_sdr OU estagio_funil=Fechado Ganho
      query = query.or("status_sdr.eq.Cliente Ativo,estagio_funil.eq.Fechado Ganho");
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
        `razao_social.ilike.${s},fantasia.ilike.${s},cnpj.ilike.${s},cnpj.ilike.${sd},celular1.ilike.${s},celular1.ilike.${sd},email1.ilike.${s}`
      );
    } else {
      query = query.or(
        `razao_social.ilike.${s},fantasia.ilike.${s},cnpj.ilike.${s},celular1.ilike.${s},email1.ilike.${s}`
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
    "Reunião Agendada",
    "Negociação",
    "Cliente Ativo",
    "Desqualificado",
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

/** Lead por id/cnpj — mdew usa cnpj como PK. Tenta cnpj primeiro. */
export async function getLeadById(idOrCnpj: string): Promise<Lead | null> {
  if (!idOrCnpj) return null;
  // cnpj (PK no mdew)
  const byCnpj = await supabase
    .from("leads")
    .select("*")
    .eq("cnpj", idOrCnpj)
    .maybeSingle();
  if (byCnpj.data) return rowToLead(byCnpj.data);
  // fallback: id UUID (schema simbio-spark antigo)
  try {
    const byId = await supabase
      .from("leads")
      .select("*")
      .eq("id", idOrCnpj)
      .maybeSingle();
    if (byId.data) return rowToLead(byId.data);
  } catch {
    // col id não existe no mdew — ignora
  }
  return null;
}

/** Valores distintos de responsável — lê direto da tabela leads (mdew não tem user_roles) */
export async function getDistinctResponsaveis(): Promise<
  { user_id: string; nome: string; role: string }[]
> {
  const [sdrs, closers] = await Promise.all([
    supabase.from("leads").select("responsavel_sdr").not("responsavel_sdr", "is", null).limit(5000),
    supabase.from("leads").select("responsavel_closer").not("responsavel_closer", "is", null).limit(5000),
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
    "Reunião Agendada",
    "Desqualificado",
  ];
  const results = await Promise.all(
    statuses.map(async (s) => {
      let q = supabase.from("leads").select("*", { count: "exact", head: true });
      if (s === "Desqualificado") {
        q = q.like("status_sdr", "Desqualificado%");
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
  // ativos = não-perdidos, não-acelerador
  const { count: ativos } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .not("status_sdr", "like", "Desqualificado%")
    .or("tipo_lead.neq.programa_acelerador,tipo_lead.is.null");

  // novos 7d
  const sevenAgo = new Date();
  sevenAgo.setDate(sevenAgo.getDate() - 7);
  const { count: novos } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .gte("updated_at", sevenAgo.toISOString())
    .or("tipo_lead.neq.programa_acelerador,tipo_lead.is.null");

  // taxa de conversão: "A Contatar" + "Reunião Agendada" → taxa
  const { count: aContatar } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status_sdr", "A Contatar")
    .or("tipo_lead.neq.programa_acelerador,tipo_lead.is.null");
  const { count: reuniao } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status_sdr", "Reunião Agendada")
    .or("tipo_lead.neq.programa_acelerador,tipo_lead.is.null");

  const totalFunil = (aContatar ?? 0) + (reuniao ?? 0);
  const taxa = totalFunil > 0 ? ((reuniao ?? 0) / totalFunil) * 100 : 0;

  // prontos closer = estagio_funil not null
  const { count: prontos } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .not("estagio_funil", "is", null);

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
    .or("tipo_lead.neq.programa_acelerador,tipo_lead.is.null")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(rowToLead);
}
