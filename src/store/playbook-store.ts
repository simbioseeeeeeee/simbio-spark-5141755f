import { supabase } from "@/integrations/supabase/client";

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

export async function objecoesDoLead(cnpj: string): Promise<LeadObjecao[]> {
  const { data, error } = await supabase.from("lead_objecoes" as any)
    .select("*").eq("lead_cnpj", cnpj).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as any[]) as LeadObjecao[];
}

export async function marcarObjecao(cnpj: string, objecaoId: string, createdBy: string,
                                    avaliacaoId?: string) {
  const { error } = await supabase.from("lead_objecoes" as any).insert({
    lead_cnpj: cnpj, objecao_id: objecaoId, created_by: createdBy,
    avaliacao_id: avaliacaoId ?? null,
  });
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
  fechou: "Fechou", proposta_pedida: "Proposta pedida",
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
  score?: number;
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

/** Score 0–100 — a tabela de pesos do brief, aplicada tal qual. */
export function calcularScore(a: Avaliacao, objecoesCategorias: CategoriaObjecao[]): number {
  let s = 0;
  if (a.decisor_presente) s += 20;
  if (a.duracao_min !== null && a.duracao_min >= 30 && a.duracao_min <= 50) s += 15;
  if (a.fala_closer_faixa === "<40" || a.fala_closer_faixa === "40-60") s += 15;
  if (a.preco_apresentado) s += 15;
  if (a.proximo_passo_data) s += 15;
  if (a.gatilhos_avanco.length > 0) s += 10;
  if (!objecoesCategorias.includes("COMPREENSAO")) s += 10;
  const precoCedoSemTratar = objecoesCategorias.includes("PRECO")
    && a.preco_minuto !== null && a.preco_minuto < 20 && a.preco_tratado_na_hora === false;
  if (precoCedoSemTratar) s -= 15;
  if (a.desconto_sem_contrapartida) s -= 20;
  return Math.max(0, Math.min(100, s));
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
  if (objecoesCategorias.includes("PRECO") && a.preco_minuto !== null
      && a.preco_minuto < 20 && a.preco_tratado_na_hora === false)
    p.push(`O preço apareceu no minuto ${a.preco_minuto} e a apresentação continuou. Pare e trate quando isso acontecer.`);
  if (!a.decisor_presente)
    p.push("Reunião sem decisor. O SDR deve confirmar presença antes de agendar.");
  if (a.desconto_sem_contrapartida)
    p.push("Desconto concedido sem troca. Peça prazo, decisão na reunião ou indicação.");
  if (!a.proximo_passo_data && a.desfecho !== "fechou" && a.desfecho !== "perdido")
    p.push("A reunião terminou sem data. 'Vou pensar' sem prazo é objeção não revelada.");
  return p;
}

export async function salvarAvaliacao(a: Avaliacao): Promise<string> {
  const { data, error } = await supabase.from("reunioes_avaliacao" as any)
    .insert({ ...a }).select("id").single();
  if (error) throw error;
  return (data as any).id as string;
}

export async function avaliacoesDoLead(cnpj: string): Promise<Avaliacao[]> {
  const { data, error } = await supabase.from("reunioes_avaliacao" as any)
    .select("*").eq("lead_cnpj", cnpj).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as any[]) as Avaliacao[];
}

// ─── fechamento (Feature C) ─────────────────────────────────────────────────

export type Fechamento = {
  id: string; lead_cnpj: string; plano: string; valor: number;
  periodicidade: "mensal" | "trimestral" | "anual";
  exclusividade: boolean; exclusividade_cidade: string | null;
  exclusividade_inicio: string | null; exclusividade_fim: string | null;
  termo_token: string; aceite_em: string | null;
  asaas_payment_link: string | null; status: string; created_at: string;
};

export async function fechamentosDoLead(cnpj: string): Promise<Fechamento[]> {
  const { data, error } = await supabase.from("fechamentos" as any)
    .select("*").eq("lead_cnpj", cnpj).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as any[]) as Fechamento[];
}

export const API_BASE = "https://api.simbiosedigital.com";

export async function criarFechamento(payload: Record<string, unknown>) {
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
    texto: "Resuma esta reunião em formato de acordo comercial: qual plano foi escolhido, qual valor e periodicidade foram acordados, o que ficou combinado como escopo e quais compromissos eu assumi. Só o que foi dito explicitamente — não complete lacunas." },
  { id: "P7", quando: "final", titulo: "Extração de objeções",
    texto: "Liste todas as objeções que o cliente levantou nesta reunião. Para cada uma, traga a frase literal dele, em que momento apareceu, e se foi respondida ou ficou em aberto. Classifique cada uma como: capacidade financeira, falta de compreensão do produto, risco percebido, dependência de decisor, mercado, preço, timing ou concorrência." },
  { id: "P8", quando: "final", titulo: "Autoavaliação (o mais importante)",
    texto: "Analise esta reunião do ponto de vista de técnica de vendas. Responda: qual foi a proporção de fala entre mim e o cliente; quantas perguntas abertas eu fiz; em que momento a objeção principal apareceu pela primeira vez e o que eu fiz em seguida; se eu levantei alguma objeção que o cliente não havia mencionado; e se, depois de um sinal de \"sim\", eu continuei argumentando. Seja crítico." },
  { id: "P9", quando: "final", titulo: "Próximo passo",
    texto: "Com base nesta reunião, qual é o próximo passo concreto e qual é a data mais provável? Se nenhuma data foi combinada, diga isso explicitamente." },
];

// ─── roteiro (Parte 5, resumo de referência) ────────────────────────────────

export const ROTEIRO_BLOCOS = [
  { bloco: "Antes (SDR)", min: "", oQue: "Confirmar: nº de corretores · VGV médio mensal · investimento em anúncio · quem decide junto · quando começaria. Sem decisor confirmado, fechamento não é agendado." },
  { bloco: "1 · Mapa da região", min: "5", oQue: "Dois ou três dados da cidade dele, soltos. Mostrar que a escolha da praça foi deliberada." },
  { bloco: "2 · Diagnóstico", min: "10", oQue: "Perguntas abertas. ESCUTAR mais do que falar. Anotar a dor com as palavras dele." },
  { bloco: "3 · Apresentação dirigida", min: "15", oQue: "Só as partes que endereçam a dor do bloco 2. A cada três minutos, uma pergunta." },
  { bloco: "4 · Prova do tamanho dele", min: "5", oQue: "Um case de perfil equivalente. Nunca autoridade emprestada." },
  { bloco: "5 · Preço e fechamento", min: "10", oQue: "Conta da folha primeiro, preço depois. CTA único. Se ele disser SIM: encerre (R1)." },
];

export const NUNCA_ENTRA =
  "Tokenização · licença de cidade · valuation · aporte do grupo · nome/número de cliente sem autorização escrita · objeção que ele não levantou · desconto sem contrapartida · FOMO de meta interna.";
