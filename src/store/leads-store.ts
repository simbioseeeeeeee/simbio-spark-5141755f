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
    whatsapp_humano: row.whatsapp_humano || false,
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
    owner_id: row.owner_id || null,
    sdr_id: row.sdr_id || null,
  };
}

// ─── Territory ───────────────────────────────────────────────
export async function getDistinctCidades(): Promise<string[]> {
  // RPC has default 1000 row limit — fetch all cities in batches
  const all: string[] = [];
  let offset = 0;
  const batchSize = 1000;
  while (true) {
    const { data, error } = await supabase.rpc("distinct_cidades").range(offset, offset + batchSize - 1);
    if (error) throw error;
    const batch = (data || []).map((r: any) => r.cidade);
    all.push(...batch);
    if (batch.length < batchSize) break;
    offset += batchSize;
  }
  return all;
}

// ─── Daily Metrics ───────────────────────────────────────────
export interface DailyMetrics {
  pesquisas_hoje: number;
  tentativas_hoje: number;
  conexoes_hoje: number;
  reunioes_hoje: number;
}

export async function getDailyMetrics(cidade?: string): Promise<DailyMetrics> {
  const params: any = {};
  if (cidade) params.p_cidade = cidade;
  const { data, error } = await supabase.rpc("get_daily_metrics", params);
  if (error) throw error;
  const row: any = data?.[0] || {};
  return {
    pesquisas_hoje: Number(row.pesquisas_hoje) || 0,
    tentativas_hoje: Number(row.tentativas_hoje) || 0,
    conexoes_hoje: Number(row.conexoes_hoje) || 0,
    reunioes_hoje: Number(row.reunioes_hoje) || 0,
  };
}

// ─── Cadence (Today's Focus) ─────────────────────────────────
export async function getCadenciaHoje(cidade?: string): Promise<Lead[]> {
  const params: any = {};
  if (cidade) params.p_cidade = cidade;
  const { data, error } = await supabase.rpc("get_cadencia_hoje", params);
  if (error) throw error;
  return (data || []).map(rowToLead);
}

// ─── Cadence (Completed Today) ───────────────────────────────
export async function getCadenciaConcluidasHoje(cidade?: string): Promise<Lead[]> {
  const params: any = {};
  if (cidade) params.p_cidade = cidade;
  const { data, error } = await supabase.rpc("get_cadencia_concluidas_hoje" as any, params);
  if (error) throw error;
  return (data || []).map(rowToLead);
}

// ─── Cadence (Tomorrow) ─────────────────────────────────────
export async function getCadenciaAmanha(cidade?: string): Promise<Lead[]> {
  const params: any = {};
  if (cidade) params.p_cidade = cidade;
  const { data, error } = await supabase.rpc("get_cadencia_amanha" as any, params);
  if (error) throw error;
  return (data || []).map(rowToLead);
}

// ─── Activities ──────────────────────────────────────────────
export async function registrarAtividade(
  lead: Lead,
  tipo: string,
  resultado: string,
  nota: string,
  userId?: string
): Promise<Lead> {
  // 1. Insert activity with sdr_id tracking
  const insertData: any = {
    lead_id: lead.id,
    tipo_atividade: tipo,
    resultado: resultado,
    nota: nota,
  };
  if (userId) insertData.sdr_id = userId;

  const { error: actErr } = await supabase.from("atividades").insert(insertData);
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

  // 4. Update lead (also set sdr_id if not set)
  const updateData: any = {
    dia_cadencia: novoDia,
    status_cadencia: newStatusCadencia,
    data_proximo_passo: proximoPasso.toISOString(),
    status_sdr: newStatus,
    estagio_funil: newEstagioFunil,
  };
  if (userId && !lead.sdr_id) updateData.sdr_id = userId;

  const { data, error: updErr } = await supabase
    .from("leads")
    .update(updateData)
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
  dateFrom?: string;
  dateTo?: string;
  scoreMin?: number;
  scoreMax?: number;
  cnaeFilter?: string;
}

export interface LeadsResult {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getLeadsPaginated(q: LeadsQuery): Promise<LeadsResult> {
  let query = supabase.from("leads").select("*", { count: "exact" });

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

  if (q.dateFrom) {
    query = query.gte("created_at", q.dateFrom);
  }
  if (q.dateTo) {
    query = query.lte("created_at", q.dateTo);
  }
  if (q.scoreMin !== undefined) {
    query = query.gte("lead_score", q.scoreMin);
  }
  if (q.scoreMax !== undefined) {
    query = query.lte("lead_score", q.scoreMax);
  }
  if (q.cnaeFilter) {
    query = query.ilike("cnae_descricao", `%${q.cnaeFilter}%`);
  }

  if (q.search?.trim()) {
    const raw = q.search.trim();
    const digits = raw.replace(/\D/g, '');
    // If search looks like a CNPJ (mostly digits), also search by digits only
    const s = `%${raw}%`;
    if (digits.length >= 8) {
      const sd = `%${digits}%`;
      query = query.or(
        `razao_social.ilike.${s},fantasia.ilike.${s},cnpj.ilike.${s},cnpj.ilike.${sd},bairro.ilike.${s},telefone1.ilike.${s},celular1.ilike.${s}`
      );
    } else {
      query = query.or(
        `razao_social.ilike.${s},fantasia.ilike.${s},cnpj.ilike.${s},bairro.ilike.${s},telefone1.ilike.${s},celular1.ilike.${s}`
      );
    }
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
export async function getKanbanLeads(cidade?: string): Promise<Lead[]> {
  let query = supabase
    .from("leads")
    .select("*")
    .or("status_sdr.eq.Reunião Agendada,estagio_funil.not.is.null");

  if (cidade) {
    query = query.eq("cidade", cidade);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
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
      whatsapp_humano: lead.whatsapp_humano,
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

  const statuses = ["A Contatar", "Em Qualificação", "Reunião Agendada"];
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

  // Count all disqualification sub-statuses together
  const { count: desqCount, error: desqErr } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("cidade", cidade)
    .like("status_sdr", "Desqualificado%");
  if (!desqErr) counts["Desqualificado"] = desqCount ?? 0;

  return counts;
}

// ─── Manager Analytics ──────────────────────────────────────
export interface ManagerAnalytics {
  total_leads_qualificados: number;
  total_atividades: number;
  total_reunioes: number;
  total_fechamentos: number;
  valor_pipeline: number;
  total_desqualificados: number;
}

export async function getManagerAnalytics(cidade: string | null, days: number): Promise<ManagerAnalytics> {
  const { data, error } = await supabase.rpc("get_manager_analytics" as any, {
    p_cidade: cidade,
    p_days: days,
  });
  if (error) throw error;
  const row: any = data?.[0] || {};
  return {
    total_leads_qualificados: Number(row.total_leads_qualificados) || 0,
    total_atividades: Number(row.total_atividades) || 0,
    total_reunioes: Number(row.total_reunioes) || 0,
    total_fechamentos: Number(row.total_fechamentos) || 0,
    valor_pipeline: Number(row.valor_pipeline) || 0,
    total_desqualificados: Number(row.total_desqualificados) || 0,
  };
}

export interface LeaderboardEntry {
  user_id: string;
  nome: string;
  role: string;
  total_atividades: number;
  total_reunioes: number;
}

export async function getLeaderboard(cidade: string | null, days: number): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("get_leaderboard" as any, {
    p_cidade: cidade,
    p_days: days,
  });
  if (error) throw error;
  return (data || []) as LeaderboardEntry[];
}

// ─── Activity Trend (Charts) ────────────────────────────────
export interface ActivityTrendEntry {
  dia: string;
  total_atividades: number;
  total_reunioes: number;
}

export async function getActivityTrend(cidade: string | null, days: number): Promise<ActivityTrendEntry[]> {
  const { data, error } = await supabase.rpc("get_activity_trend" as any, {
    p_cidade: cidade,
    p_days: days,
  });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    dia: r.dia,
    total_atividades: Number(r.total_atividades) || 0,
    total_reunioes: Number(r.total_reunioes) || 0,
  }));
}

// ─── Conversion Funnel ──────────────────────────────────────
export interface FunnelEntry {
  etapa: string;
  total: number;
}

export async function getConversionFunnel(cidade: string | null): Promise<FunnelEntry[]> {
  const { data, error } = await supabase.rpc("get_conversion_funnel" as any, {
    p_cidade: cidade,
  });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    etapa: r.etapa,
    total: Number(r.total) || 0,
  }));
}

// ─── Pipeline by Stage ──────────────────────────────────────
export interface PipelineStageEntry {
  estagio: string;
  total_leads: number;
  valor_total: number;
}

export async function getPipelineByStage(cidade: string | null): Promise<PipelineStageEntry[]> {
  const { data, error } = await supabase.rpc("get_pipeline_by_stage" as any, {
    p_cidade: cidade,
  });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    estagio: r.estagio,
    total_leads: Number(r.total_leads) || 0,
    valor_total: Number(r.valor_total) || 0,
  }));
}

// ─── Activity Breakdown ─────────────────────────────────────
export interface ActivityBreakdownEntry {
  tipo: string;
  total: number;
}

export async function getActivityBreakdown(cidade: string | null, days: number): Promise<ActivityBreakdownEntry[]> {
  const { data, error } = await supabase.rpc("get_activity_breakdown" as any, {
    p_cidade: cidade,
    p_days: days,
  });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    tipo: r.tipo,
    total: Number(r.total) || 0,
  }));
}

// ─── SDR Performance ────────────────────────────────────────
export interface SdrPerformanceEntry {
  user_id: string;
  nome: string;
  whatsapps: number;
  ligacoes: number;
  emails: number;
  pesquisas: number;
  reunioes: number;
}

export async function getSdrPerformance(cidade: string | null, days: number): Promise<SdrPerformanceEntry[]> {
  const { data, error } = await supabase.rpc("get_sdr_performance" as any, {
    p_cidade: cidade,
    p_days: days,
  });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    user_id: r.user_id,
    nome: r.nome,
    whatsapps: Number(r.whatsapps) || 0,
    ligacoes: Number(r.ligacoes) || 0,
    emails: Number(r.emails) || 0,
    pesquisas: Number(r.pesquisas) || 0,
    reunioes: Number(r.reunioes) || 0,
  }));
}
