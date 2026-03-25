import { supabase } from "@/integrations/supabase/client";
import { Lead, Socio } from "@/types/lead";

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
    pesquisa_realizada: row.pesquisa_realizada || false,
    lead_score: row.lead_score ?? null,
    observacoes_sdr: row.observacoes_sdr || "",
    estagio_funil: row.estagio_funil || null,
    valor_negocio_estimado: row.valor_negocio_estimado || null,
    data_proximo_passo: row.data_proximo_passo || null,
    observacoes_closer: row.observacoes_closer || "",
    created_at: row.created_at,
  };
}

export interface LeadsQuery {
  page: number;
  search?: string;
  statusFilter?: string;
  cidadeFilter?: string;
  ufFilter?: string;
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

export async function getDistinctUFs(): Promise<string[]> {
  const { data, error } = await supabase.rpc("distinct_ufs");
  if (error) throw error;
  return (data || []).map((r: any) => r.uf);
}

export async function getDistinctCidades(uf?: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("distinct_cidades", {
    p_uf: uf && uf !== "all" ? uf : null,
  });
  if (error) throw error;
  return (data || []).map((r: any) => r.cidade);
}

export async function getLeadsPaginated({ page, search, statusFilter, cidadeFilter, ufFilter, pesquisaFilter, scoreFilter, sortByScore }: LeadsQuery): Promise<LeadsResult> {
  let query = supabase
    .from("leads")
    .select("*", { count: "exact" });

  if (statusFilter && statusFilter !== "all") {
    query = query.eq("status_sdr", statusFilter);
  }

  if (ufFilter && ufFilter !== "all") {
    query = query.eq("uf", ufFilter);
  }

  if (cidadeFilter && cidadeFilter !== "all") {
    query = query.eq("cidade", cidadeFilter);
  }

  if (pesquisaFilter === "pesquisados") {
    query = query.eq("pesquisa_realizada", true);
  } else if (pesquisaFilter === "nao_pesquisados") {
    query = query.eq("pesquisa_realizada", false);
  }

  if (scoreFilter === "qualificados") {
    query = query.gte("lead_score", 60);
  }

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    query = query.or(
      `razao_social.ilike.${q},fantasia.ilike.${q},cnpj.ilike.${q},bairro.ilike.${q},cidade.ilike.${q},telefone1.ilike.${q},celular1.ilike.${q}`
    );
  }

  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const orderCol = sortByScore ? "lead_score" : "created_at";
  const ascending = sortByScore ? false : false;

  const { data, error, count } = await query
    .order(orderCol, { ascending, nullsFirst: false })
    .range(from, to);

  if (error) throw error;

  return {
    leads: (data || []).map(rowToLead),
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function getStatusCounts(): Promise<Record<string, number>> {
  // Get total count
  const { count: total, error: totalErr } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true });
  if (totalErr) throw totalErr;

  const statuses = ["A Contatar", "Em Qualificação", "Reunião Agendada", "Desqualificado"];
  const counts: Record<string, number> = { all: total ?? 0 };

  await Promise.all(
    statuses.map(async (s) => {
      const { count, error } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("status_sdr", s);
      if (!error) counts[s] = count ?? 0;
    })
  );

  return counts;
}

export async function getKanbanLeads(): Promise<Lead[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .or("status_sdr.eq.Reunião Agendada,estagio_funil.not.is.null")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []).map(rowToLead);
}

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
      pesquisa_realizada: lead.pesquisa_realizada,
      lead_score: lead.lead_score,
      observacoes_sdr: lead.observacoes_sdr,
      estagio_funil: lead.estagio_funil,
      valor_negocio_estimado: lead.valor_negocio_estimado,
      data_proximo_passo: lead.data_proximo_passo,
      observacoes_closer: lead.observacoes_closer,
    })
    .eq("id", lead.id)
    .select()
    .single();
  if (error) throw error;
  return rowToLead(data);
}
