import { supabase } from "@/integrations/supabase/client";
import { Lead } from "@/types/lead";
import { rowToLead } from "@/store/leads-store";

const PAGE_SIZE = 50;

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
  const { data, error } = await (supabase.rpc as any)("crm_lead_tab_counts", {
    p_origens: baseFilters.origens?.length ? baseFilters.origens : null,
    p_tipos: baseFilters.tipos?.length ? baseFilters.tipos : null,
    p_hide_acelerador: baseFilters.tipos?.length ? false : (baseFilters.hideAcelerador ?? false),
    p_responsavel: baseFilters.responsavelId || null,
    p_cidade: baseFilters.cidade && baseFilters.cidade !== "__all__" ? baseFilters.cidade : null,
    p_uf: baseFilters.uf && baseFilters.uf !== "__all__" ? baseFilters.uf : null,
    p_last_days: baseFilters.lastDays || null,
    p_search: baseFilters.search?.trim() || null,
  });
  if (error) throw error;

  const out: Record<string, number> = {};
  for (const row of (data || []) as Array<{ tab: StatusTab; total: number | string }>) {
    out[row.tab] = Number(row.total) || 0;
  }
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
