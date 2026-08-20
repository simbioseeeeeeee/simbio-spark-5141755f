import { supabase } from "@/integrations/supabase/client";
import { PLAYBOOK_VERSION, type OfertaComercial } from "@/types/lead";
import {
  calculateExecutionScore,
  calculateFitScore,
} from "@/lib/sales-pipeline";

// Playbook comercial — brief Vinicius (14/08).
// Matriz de objeções, avaliação de reunião com score, prompts de reunião e config
// da Parte 6 (valores que a LIDERANÇA define — nunca inventados aqui).

export type CategoriaObjecao =
  | "CAPACIDADE" | "COMPREENSAO" | "RISCO" | "DECISOR"
  | "MERCADO" | "PRECO" | "TIMING" | "CONCORRENCIA";

export const CATEGORIA_LABEL: Record<CategoriaObjecao, string> = {
  CAPACIDADE: "Capacidade — desqualifica, não contorna",
  COMPREENSAO: "Compreensão — falha da apresentação",
  RISCO: "Risco — medo de errar, falta prova",
  DECISOR: "Decisor — depende de sócio/diretoria",
  MERCADO: "Mercado — culpa o cenário",
  PRECO: "Preço — entende o valor, discute o preço",
  TIMING: "Timing — faz sentido, mas não agora",
  CONCORRENCIA: "Concorrência — já tem ou já se queimou",
};

export type Objecao = {
  id: string;
  categoria: CategoriaObjecao;
  titulo: string;
  gatilhos: string[];
  leitura: string | null;
  resposta: string;
  nao_fazer: string | null;
  desqualifica: boolean;
  origem: string[];
  ativo: boolean;
};

export type LeadObjecao = {
  id: string;
  lead_cnpj: string;
  objecao_id: string;
  superada: boolean | null;   // null = em aberto
  avaliacao_id: string | null;
  meeting_event_id: string | null;
  playbook_version: string;
  contexto: string | null;
  created_at: string;
};

export type ObjecaoStats = {
  id: string; categoria: CategoriaObjecao; titulo: string; desqualifica: boolean;
  frequencia: number; taxa_superacao: number | null; em_perdidos: number;
};

export type PlaybookConfigItem = {
  chave: string; valor: unknown; definido: boolean; nota: string | null;
};

// ─── matriz ─────────────────────────────────────────────────────────────────

export async function listarObjecoes(): Promise<Objecao[]> {
  const { data, error } = await supabase.from("objecoes" as any)
    .select("*").eq("ativo", true).order("id");
  if (error) throw error;
  return (data as any[]) as Objecao[];
}

export async function salvarObjecao(o: Partial<Objecao> & { id: string }) {
  const { error } = await supabase.from("objecoes" as any)
    .upsert({ ...o, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function statsObjecoes(): Promise<ObjecaoStats[]> {
  const { data, error } = await supabase.from("vw_objecoes_stats" as any).select("*");
  if (error) throw error;
  return (data as any[]) as ObjecaoStats[];
}

export async function listarConfig(): Promise<PlaybookConfigItem[]> {
  const { data, error } = await supabase.from("playbook_config" as any).select("*").order("chave");
  if (error) throw error;
  return (data as any[]) as PlaybookConfigItem[];
}

// ─── objeções do lead ───────────────────────────────────────────────────────

export async function objecoesDoLead(cnpj: string, meetingEventId?: string | null): Promise<LeadObjecao[]> {
  let query = supabase.from("lead_objecoes" as any)
    .select("*").eq("lead_cnpj", cnpj);
  if (meetingEventId) query = query.eq("meeting_event_id", meetingEventId);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return (data as any[]) as LeadObjecao[];
}

export async function marcarObjecao(cnpj: string, meetingEventId: string, objecaoId: string, createdBy: string,
                                    avaliacaoId?: string) {
  if (!meetingEventId.trim()) throw new Error("Registre o event_id da reunião antes de marcar objeções.");
  const { error } = await supabase.from("lead_objecoes" as any).upsert({
    lead_cnpj: cnpj, objecao_id: objecaoId, created_by: createdBy,
    avaliacao_id: avaliacaoId ?? null,
    meeting_event_id: meetingEventId,
    playbook_version: PLAYBOOK_VERSION,
  }, { onConflict: "lead_cnpj,meeting_event_id,objecao_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function atualizarObjecaoLead(id: string, patch: Partial<LeadObjecao>) {
  const { error } = await supabase.from("lead_objecoes" as any).update(patch).eq("id", id);
  if (error) throw error;
}

export async function removerObjecaoLead(id: string) {
  const { error } = await supabase.from("lead_objecoes" as any).delete().eq("id", id);
  if (error) throw error;
}

// ─── avaliação de reunião (Feature B) ───────────────────────────────────────

export type FaixaFala = "<40" | "40-60" | "60-80" | ">80";
export type Desfecho = "fechou" | "proposta_pedida" | "proxima_marcada" | "perdido" | "no_show";

export const DESFECHO_LABEL: Record<Desfecho, string> = {
  fechou: "Acordo verbal — seguir para proposta", proposta_pedida: "Proposta pedida",
  proxima_marcada: "Próxima reunião marcada", perdido: "Perdido", no_show: "No-show",
};

export type Avaliacao = {
  id?: string;
  lead_cnpj: string;
  decisor_presente: boolean;
  duracao_min: number | null;
  fala_closer_faixa: FaixaFala | null;
  preco_apresentado: boolean;
  preco_minuto: number | null;
  preco_tratado_na_hora: boolean | null;
  desconto_sem_contrapartida: boolean;
  gatilhos_avanco: string[];
  desfecho: Desfecho | null;
  proximo_passo_data: string | null;
  obs: string | null;
  motivo_perda?: string | null;
  motivo_perda_detalhe?: string | null;
  meeting_event_id: string;
  playbook_version?: string;
  fit_icp: number;
  fit_dor_impacto: number;
  fit_processo_capacidade: number;
  fit_decisao: number;
  fit_timing: number;
  fit_score?: number;
  exec_diagnostico: number;
  exec_escuta: number;
  exec_confirmacao_entendimento: number;
  exec_solucao_ligada_dor: number;
  exec_transparencia_termos: number;
  exec_proximo_passo: number;
  execution_score?: number;
  created_at?: string;
};

export const GATILHOS_AVANCO = [
  "perguntou preço espontaneamente",
  "perguntou prazo de início",
  "trouxe o sócio/decisor pra conversa",
  "pediu proposta",
  "citou concorrente que usa algo parecido",
  "falou de dor com números próprios",
];

export function calcularScoreFit(a: Avaliacao): number {
  return calculateFitScore({
    icp: a.fit_icp,
    dorImpacto: a.fit_dor_impacto,
    processoCapacidade: a.fit_processo_capacidade,
    decisao: a.fit_decisao,
    timing: a.fit_timing,
  });
}

export function calcularScoreExecucao(a: Avaliacao): number {
  return calculateExecutionScore({
    diagnostico: a.exec_diagnostico,
    escuta: a.exec_escuta,
    confirmacaoEntendimento: a.exec_confirmacao_entendimento,
    solucaoLigadaDor: a.exec_solucao_ligada_dor,
    transparenciaTermos: a.exec_transparencia_termos,
    proximoPassoDatado: a.exec_proximo_passo,
  });
}

/** Pontos de melhoria — as frases do brief, direto pro closer. */
export function pontosDeMelhoria(a: Avaliacao, objecoesCategorias: CategoriaObjecao[]): string[] {
  const p: string[] = [];
  if (a.fala_closer_faixa === "60-80" || a.fala_closer_faixa === ">80") {
    const x = a.fala_closer_faixa === ">80" ? "mais de 80%" : "60 a 80%";
    p.push(`Você falou ${x} da reunião. Alvo: abaixo de 60%. A cada três minutos, faça uma pergunta.`);
  }
  if (objecoesCategorias.includes("COMPREENSAO"))
    p.push("O cliente não entendeu o que está comprando. Encurte a apresentação e volte para a dor dele.");
  if (!a.decisor_presente)
    p.push("Confirme quem decide e combine a participação dessa pessoa antes de enviar proposta.");
  if (!a.proximo_passo_data && a.desfecho !== "fechou" && a.desfecho !== "perdido")
    p.push("A reunião terminou sem data. 'Vou pensar' sem prazo é objeção não revelada.");
  return p;
}

export async function salvarAvaliacao(a: Avaliacao): Promise<string> {
  // meeting_event_id deixou de ser obrigatório (21/08): reuniões antigas e as
  // vindas do tl;dv não têm evento no Calendar — exigir bloqueava o closer de
  // avaliar justamente as reuniões que aconteceram. Quando existir, vai junto.
  if (!a.desfecho) throw new Error("Selecione o desfecho da reunião.");
  if (a.desfecho !== "perdido" && !a.proximo_passo_data) {
    throw new Error("O desfecho exige próximo passo com data.");
  }
  if (a.desfecho === "perdido" && !a.motivo_perda) throw new Error("Perda exige motivo estruturado.");
  if (a.desfecho === "perdido" && a.motivo_perda === "outro" && !a.motivo_perda_detalhe?.trim()) {
    throw new Error("O motivo Outro exige explicação.");
  }
  const fitScore = calcularScoreFit(a);
  const executionScore = calcularScoreExecucao(a);
  const assessment = {
    ...a,
    fit_score: fitScore,
    execution_score: executionScore,
    score: executionScore,
    playbook_version: PLAYBOOK_VERSION,
  };
  const { data, error } = await (supabase as any).rpc("save_meeting_assessment_v2", {
    p_assessment: assessment,
  });
  if (error) throw error;
  return String(data);
}

export async function avaliacoesDoLead(cnpj: string, meetingEventId?: string | null): Promise<Avaliacao[]> {
  let query = supabase.from("reunioes_avaliacao" as any)
    .select("*").eq("lead_cnpj", cnpj);
  if (meetingEventId) query = query.eq("meeting_event_id", meetingEventId);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return (data as any[]) as Avaliacao[];
}

// ─── fechamento (Feature C) ─────────────────────────────────────────────────

export type Fechamento = {
  id: string; lead_cnpj: string; plano: string | null; oferta_comercial: OfertaComercial | null; valor: number | null;
  offer_id: string | null; catalog_version: string | null; quote_id: string | null;
  quote_snapshot: Record<string, unknown> | null;
  periodicidade: "unico" | "mensal" | "trimestral" | "anual";
  exclusividade: boolean; exclusividade_cidade: string | null;
  exclusividade_inicio: string | null; exclusividade_fim: string | null;
  termo_token: string; aceite_em: string | null; proposta_enviada_em: string | null;
  asaas_payment_link: string | null; status: string; payment_status: string; pagamento_em: string | null; created_at: string;
};

export async function fechamentosDoLead(cnpj: string): Promise<Fechamento[]> {
  const { data, error } = await supabase.from("fechamentos" as any)
    .select("*").eq("lead_cnpj", cnpj).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as any[]) as Fechamento[];
}

export const API_BASE = "https://api.simbiosedigital.com";

export type FechamentoDraft = {
  ok: true;
  lead_cnpj: string;
  meeting_event_id: string | null;
  dor_impacto: string;
  objetivo: string;
  criterios_decisao: string[];
  oferta_recomendada: OfertaComercial | "";
  escopo_sugerido: string[];
  exclusoes: string[];
  decisor_nome: string;
  objecoes: string[];
  proximo_passo: string;
  missing_evidence: string[];
  requires_human_review: true;
  playbook_version: typeof PLAYBOOK_VERSION;
};

export async function gerarRascunhoFechamento(
  leadCnpj: string,
  meetingEventId?: string | null,
): Promise<FechamentoDraft> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("sessão expirada — faça login de novo");
  const response = await fetch(`${API_BASE}/api/fechamento/rascunho`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      lead_cnpj: leadCnpj,
      ...(meetingEventId ? { meeting_event_id: meetingEventId } : {}),
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.detail || body?.error || `HTTP ${response.status}`);
  if (body?.playbook_version !== PLAYBOOK_VERSION || body?.requires_human_review !== true) {
    throw new Error("Rascunho incompatível com o playbook comercial atual.");
  }
  return body as FechamentoDraft;
}

export async function criarFechamento(payload: Record<string, unknown>) {
  if (!payload.offer_id || !payload.quote_id) throw new Error("Calcule a cotação oficial antes de enviar.");
  if ("valor" in payload || "desconto" in payload) {
    throw new Error("Preço e desconto não podem ser enviados manualmente.");
  }
  const requiredTerms = [
    "objetivo", "decisor_nome", "proximo_passo",
  ];
  const missing = requiredTerms.filter((key) => !String(payload[key] || "").trim());
  if (missing.length > 0) throw new Error("Revise todos os termos materiais antes de aprovar o envio.");
  if (payload.proposal_approved !== true || !payload.proposal_approved_by) {
    throw new Error("A proposta exige aprovação humana identificada.");
  }
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("sessão expirada — faça login de novo");
  const r = await fetch(`${API_BASE}/api/fechamento/criar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.detail || body?.error || `HTTP ${r.status}`);
  return body;
}

// ─── prompts de reunião (Parte 4 do brief, texto integral) ──────────────────

export const PROMPTS_REUNIAO: { id: string; quando: "durante" | "final"; titulo: string; texto: string }[] = [
  { id: "P1", quando: "durante", titulo: "Termômetro, a qualquer momento",
    texto: "Com base na conversa até agora: qual é a dor principal que essa pessoa expressou, com as palavras dela? Liste também qualquer objeção que ela já levantou e que ainda não foi respondida. Seja direto, em no máximo cinco linhas." },
  { id: "P2", quando: "durante", titulo: "Quando sentir que falou demais",
    texto: "Estime a proporção de fala entre mim e o cliente nesta reunião até aqui. Qual foi a última pergunta que eu fiz a ele? Há quanto tempo?" },
  { id: "P3", quando: "durante", titulo: "Antes de apresentar o preço",
    texto: "O cliente já demonstrou entender o que está comprando? Cite as evidências. Ele já sinalizou alguma restrição de orçamento? Se sim, com que palavras?" },
  { id: "P4", quando: "durante", titulo: "Quando o cliente hesitar",
    texto: "Nesta reunião, o que essa pessoa disse que indica interesse real, e o que indica resistência? Separe em duas listas, usando as frases dela." },
  { id: "P5", quando: "durante", titulo: "Checagem de decisor",
    texto: "Pelo que foi dito, essa pessoa decide sozinha? Se não, quem mais participa da decisão e o que ela disse sobre isso?" },
  { id: "P6", quando: "final", titulo: "Resumo para o termo de aceite",
    texto: "Prepare um rascunho para revisão humana: dor e impacto nas palavras do cliente, objetivo, critérios de decisão, oferta recomendada (Imersão, Demanda, Atendimento com IA ou Operação de Vendas), decisor, objeções e próximo passo. Escopo, exclusões e preço vêm somente do catálogo V2.1." },
  { id: "P7", quando: "final", titulo: "Extração de objeções",
    texto: "Liste todas as objeções que o cliente levantou nesta reunião. Para cada uma, traga a frase literal dele, em que momento apareceu, e se foi respondida ou ficou em aberto. Classifique cada uma como: capacidade financeira, falta de compreensão do produto, risco percebido, dependência de decisor, mercado, preço, timing ou concorrência." },
  { id: "P8", quando: "final", titulo: "Autoavaliação (o mais importante)",
    texto: "Analise esta reunião do ponto de vista de técnica de vendas. Responda: qual foi a proporção de fala entre mim e o cliente; quantas perguntas abertas eu fiz; em que momento a objeção principal apareceu pela primeira vez e o que eu fiz em seguida; se eu levantei alguma objeção que o cliente não havia mencionado; e se, depois de um sinal de \"sim\", eu continuei argumentando. Seja crítico." },
  { id: "P9", quando: "final", titulo: "Próximo passo",
    texto: "Com base nesta reunião, qual é o próximo passo concreto e qual é a data mais provável? Se nenhuma data foi combinada, diga isso explicitamente." },
];

// ─── roteiro (Parte 5, resumo de referência) ────────────────────────────────

export const ROTEIRO_BLOCOS = [
  { bloco: "1 · Contexto e acordo", min: "5", oQue: "Confirmar objetivo da conversa, participantes, tempo e como a decisão acontece." },
  { bloco: "2 · Dor, impacto e processo", min: "15", oQue: "Perguntas abertas. Escutar, quantificar impacto e registrar a dor nas palavras do cliente." },
  { bloco: "3 · Operação atual", min: "8", oQue: "Mapear captação, velocidade de atendimento, acompanhamento do time e gargalos entre lead e venda." },
  { bloco: "4 · Solução e prova", min: "10", oQue: "Apresentar somente o que responde ao diagnóstico. Case só com fonte e autorização; caso contrário, anonimizar." },
  { bloco: "5 · Oferta e próximo passo", min: "7", oQue: "Recomendar Imersão, Demanda, Atendimento com IA ou Operação de Vendas, explicar termos materiais e definir o próximo passo com data. Sem decisor, não enviar proposta." },
];

export const NUNCA_ENTRA =
  "Plano ou preço inventado · claim sem fonte · nome/número de cliente sem autorização · objeção fabricada · falsa urgência · omissão de escopo, custos não incluídos, prazo, periodicidade ou cancelamento.";
