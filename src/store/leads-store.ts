import { supabase } from "@/integrations/supabase/client";
import { Lead, Socio, Atividade, CADENCE_GAPS } from "@/types/lead";

const PAGE_SIZE = 50;

function rowToLead(row: any): Lead {
  return {
    id: row.id,
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
    socios: Array.isArray(row.socios) ? (row.socios as Socio[]) : [],
    status_sdr: row.status_sdr || "A Contatar",
    possui_site: row.possui_site || false,
    url_site: row.url_site || "",
    instagram_ativo: row.instagram_ativo || false,
    url_instagram: row.url_instagram || "",
    faz_anuncios: row.faz_anuncios || false,
    whatsapp_automacao: row.whatsapp_automacao || false,
    observacoes_sdr: row.observacoes_sdr || "",
    estagio_funil: row.estagio_funil || null,
    valor_negocio_estimado: row.valor_negocio_estimado || null,
    data_proximo_passo: row.data_proximo_passo || null,
    observacoes_closer: row.observacoes_closer || "",
    pesquisa_realizada: row.pesquisa_realizada || false,
    lead_score: row.lead_score ?? null,
    dia_cadencia: row.dia_cadencia ?? 0,
    status_cadencia: row.status_cadencia || "ativo",
    created_at: row.created_at,
  };
}

// ─── Territory ───────────────────────────────────────────────
export async function getDistinctCidades(): Promise<string[]> {
  const { data, error } = await supabase.rpc("distinct_cidades");
  if (error) throw error;
  return (data || []).map((r: any) => r.cidade);
}

// ─── Daily Metrics ───────────────────────────────────────────
export interface DailyMetrics {
  pesquisas_hoje: number;
  tentativas_hoje: number;
  conexoes_hoje: number;
  reunioes_hoje: number;
}

export async function getDailyMetrics(cidade: string): Promise<DailyMetrics> {
  const { data, error } = await supabase.rpc("get_daily_metrics", { p_cidade: cidade });
  if (error) throw error;
  const row = data?.[0] || {};
  return {
    pesquisas_hoje: Number(row.pesquisas_hoje) || 0,
    tentativas_hoje: Number(row.tentativas_hoje) || 0,
    conexoes_hoje: Number(row.conexoes_hoje) || 0,
    reunioes_hoje: Number(row.reunioes_hoje) || 0,
  };
}

// ─── Cadence (Today's Focus) ─────────────────────────────────
export async function getCadenciaHoje(cidade: string): Promise<Lead[]> {
  const { data, error } = await supabase.rpc("get_cadencia_hoje", { p_cidade: cidade });
  if (error) throw error;
  return (data || []).map(rowToLead);
}

// ─── Activities ──────────────────────────────────────────────
export async function registrarAtividade(
  lead: Lead,
  tipo: string,
  resultado: string,
  nota: string
): Promise<Lead> {
  // 1. Insert activity
  const { error: actErr } = await supabase.from("atividades").insert({
    lead_id: lead.id,
    tipo_atividade: tipo,
    resultado: resultado,
    nota: nota,
  });
  if (actErr) throw actErr;

  // 2. Calculate next step
  const novoDia = lead.dia_cadencia + 1;
  const gapDias = CADENCE_GAPS[novoDia] || 2;
  const proximoPasso = new Date();
  proximoPasso.setDate(proximoPasso.getDate() + gapDias);

  // 3. Determine new status
  let newStatus = lead.status_sdr;
  let newStatusCadencia = lead.status_cadencia;
  let newEstagioFunil = lead.estagio_funil;

  if (resultado === "Agendou Reunião") {
    newStatus = "Reunião Agendada" as any;
    newStatusCadencia = "concluido";
    newEstagioFunil = "Reunião Agendada" as any;
  } else if (resultado === "Recusou") {
    newStatus = "Desqualificado" as any;
    newStatusCadencia = "concluido";
  } else if (novoDia >= 10) {
    newStatusCadencia = "expirado";
  } else if (newStatus === "A Contatar") {
    newStatus = "Em Qualificação" as any;
  }

  // 4. Update lead
  const { data, error: updErr } = await supabase
    .from("leads")
    .update({
      dia_cadencia: novoDia,
      status_cadencia: newStatusCadencia,
      data_proximo_passo: proximoPasso.toISOString(),
      status_sdr: newStatus,
      estagio_funil: newEstagioFunil,
    })
    .eq("id", lead.id)
    .select()
    .single();
  if (updErr) throw updErr;

  return rowToLead(data);
}

export async function getLeadAtividades(leadId: string, limit = 10): Promise<Atividade[]> {
  const { data, error } = await supabase.rpc("get_lead_atividades", {
    p_lead_id: leadId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data || []) as Atividade[];
}

// ─── Lead Explorer (Paginated) ──────────────────────────────
export interface LeadsQuery {
  page: number;
  cidade: string;
  search?: string;
  statusFilter?: string;
  pesquisaFilter?: string;
  scoreFilter?: string;
  sortByScore?: boolean;
}

export interface LeadsResult {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getLeadsPaginated(q: LeadsQuery): Promise<LeadsResult> {
  let query = supabase.from("leads").select("*", { count: "exact" });

  // Territory filter (always applied)
  if (q.cidade) {
    query = query.eq("cidade", q.cidade);
  }

  if (q.statusFilter && q.statusFilter !== "all") {
    query = query.eq("status_sdr", q.statusFilter);
  }

  if (q.pesquisaFilter === "pesquisados") {
    query = query.eq("pesquisa_realizada", true);
  } else if (q.pesquisaFilter === "nao_pesquisados") {
    query = query.eq("pesquisa_realizada", false);
  }

  if (q.scoreFilter === "qualificados") {
    query = query.gte("lead_score", 60);
  }

  if (q.search?.trim()) {
    const s = `%${q.search.trim()}%`;
    query = query.or(
      `razao_social.ilike.${s},fantasia.ilike.${s},cnpj.ilike.${s},bairro.ilike.${s},telefone1.ilike.${s},celular1.ilike.${s}`
    );
  }

  const from = q.page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const orderCol = q.sortByScore ? "lead_score" : "created_at";

  const { data, error, count } = await query
    .order(orderCol, { ascending: false, nullsFirst: false })
    .range(from, to);

  if (error) throw error;
  return { leads: (data || []).map(rowToLead), total: count ?? 0, page: q.page, pageSize: PAGE_SIZE };
}

// ─── Kanban (Closer) ─────────────────────────────────────────
export async function getKanbanLeads(cidade: string): Promise<Lead[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("cidade", cidade)
    .or("status_sdr.eq.Reunião Agendada,estagio_funil.not.is.null")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToLead);
}

// ─── Update Lead ─────────────────────────────────────────────
export async function updateLead(lead: Lead): Promise<Lead> {
  const { data, error } = await supabase
    .from("leads")
    .update({
      status_sdr: lead.status_sdr,
      possui_site: lead.possui_site,
      url_site: lead.url_site,
      instagram_ativo: lead.instagram_ativo,
      url_instagram: lead.url_instagram,
      faz_anuncios: lead.faz_anuncios,
      whatsapp_automacao: lead.whatsapp_automacao,
      observacoes_sdr: lead.observacoes_sdr,
      estagio_funil: lead.estagio_funil,
      valor_negocio_estimado: lead.valor_negocio_estimado,
      data_proximo_passo: lead.data_proximo_passo,
      observacoes_closer: lead.observacoes_closer,
      pesquisa_realizada: lead.pesquisa_realizada,
      lead_score: lead.lead_score,
      dia_cadencia: lead.dia_cadencia,
      status_cadencia: lead.status_cadencia,
    })
    .eq("id", lead.id)
    .select()
    .single();
  if (error) throw error;
  return rowToLead(data);
}

// ─── Status Counts ───────────────────────────────────────────
export async function getStatusCounts(cidade: string): Promise<Record<string, number>> {
  const { count: total, error: totalErr } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("cidade", cidade);
  if (totalErr) throw totalErr;

  const statuses = ["A Contatar", "Em Qualificação", "Reunião Agendada", "Desqualificado"];
  const counts: Record<string, number> = { all: total ?? 0 };

  await Promise.all(
    statuses.map(async (s) => {
      const { count, error } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("cidade", cidade)
        .eq("status_sdr", s);
      if (!error) counts[s] = count ?? 0;
    })
  );

  return counts;
}
