export const PLAYBOOK_VERSION = "simbiose-sales-v2@2.1.0" as const;
export const CATALOG_VERSION = "2.1.0" as const;

// Espelha o CHECK leads_status_sdr_chk. "Prospectado" é como o
// facebook-webhook cria todo lead de campanha; "Arquivo Morto" e "Cliente
// Ativo" são legados da base — sem eles a matriz de transição fica undefined
// e a ficha do lead quebra ao abrir.
export type LeadStatus =
  | "A Contatar"
  | "Prospectado"
  | "Em Qualificação"
  | "Qualificado"
  | "Reunião Agendada"
  | "Nurturing"
  | "Desqualificado"
  | "Opt-out"
  | "Arquivo Morto"
  | "Cliente Ativo";

export type EstagioFunil =
  | "Reunião Agendada"
  | "Diagnóstico Realizado"
  | "Proposta Enviada"
  | "Em Negociação"
  | "Aguardando Aceite"
  | "Aguardando Pagamento"
  | "Fechado Ganho"
  | "No-show"
  | "Nurturing"
  | "Desqualificado"
  | "Opt-out"
  | "Fechado Perdido";

export type OfertaComercial = "Imersão" | "Demanda" | "Atendimento com IA" | "Operação de Vendas";
export type OfferId = "imersao" | "demanda" | "atendimento_ia" | "operacao_vendas";
export type Commitment = "unico" | "mensal" | "trimestral" | "anual";
export type MotivoPerda =
  | "sem_fit"
  | "prioridade_timing"
  | "investimento"
  | "veto_decisor"
  | "concorrente"
  | "desistencia"
  | "outro";
export type PaymentStatus = "nao_iniciado" | "pendente" | "pago" | "vencido" | "cancelado";

export type TipoAtividade = "WhatsApp" | "Ligação" | "Email" | "Pesquisa" | "Visita";
export type ResultadoAtividade = "Conectado" | "Atendeu" | "Respondeu" | "Não Atendeu" | "Caixa Postal" | "Sem Resposta" | "Agendou Reunião" | "Recusou" | "Pesquisa Concluída";

export interface Socio {
  nome: string;
  telefone1?: string;
  telefone2?: string;
  celular1?: string;
  celular2?: string;
  email1?: string;
}

export type OrigemLead =
  | "receita_federal"
  | "bitrix_migrado"
  | "whatsapp_entrante"
  | "facebook_ads"
  | "teste"
  | "outros";

export type TipoLead =
  | "imobiliaria_rf"
  | "programa_acelerador"
  | "lead_outros";

export const ORIGEM_OPTIONS: { value: OrigemLead; label: string }[] = [
  { value: "receita_federal", label: "Receita Federal" },
  { value: "bitrix_migrado", label: "Bitrix Migrado" },
  { value: "whatsapp_entrante", label: "WhatsApp Entrante" },
  { value: "facebook_ads", label: "Facebook Ads" },
  { value: "teste", label: "Teste" },
];

export const TIPO_OPTIONS: { value: TipoLead; label: string }[] = [
  { value: "imobiliaria_rf", label: "Imobiliária (RF)" },
  { value: "programa_acelerador", label: "Programa Acelerador" },
  { value: "lead_outros", label: "Outros" },
];

export const ORIGEM_BADGE_CLASS: Record<string, string> = {
  receita_federal: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30",
  bitrix_migrado: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30",
  whatsapp_entrante: "bg-green-500/15 text-green-700 dark:text-green-300 border border-green-500/30",
  facebook_ads: "bg-pink-500/15 text-pink-700 dark:text-pink-300 border border-pink-500/30",
  teste: "bg-muted text-muted-foreground border",
  outros: "bg-muted text-muted-foreground border",
};

export const ORIGEM_LABEL: Record<string, string> = {
  receita_federal: "Receita Federal",
  bitrix_migrado: "Bitrix",
  whatsapp_entrante: "WhatsApp",
  facebook_ads: "Facebook Ads",
  teste: "Teste",
  outros: "Outros",
};

export const TIPO_LABEL: Record<string, string> = {
  imobiliaria_rf: "Imobiliária (RF)",
  programa_acelerador: "Acelerador",
  lead_outros: "Outros",
};

export interface Lead {
  id: string;
  cnpj: string;
  razao_social: string;
  fantasia: string;
  data_abertura: string;
  situacao: string;
  cnae_descricao: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  telefone1: string;
  telefone2: string;
  celular1: string;
  celular2: string;
  email1: string;
  email2: string;
  socios: Socio[];
  status_sdr: LeadStatus;
  possui_site: boolean;
  url_site: string;
  instagram_ativo: boolean;
  url_instagram: string;
  faz_anuncios: boolean;
  whatsapp_automacao: boolean;
  whatsapp_humano: boolean;
  observacoes_sdr: string;
  estagio_funil: EstagioFunil | null;
  data_proximo_passo: string | null;
  observacoes_closer: string;
  pesquisa_realizada: boolean;
  lead_score: number | null;
  status_cadencia: string;
  created_at: string;
  updated_at?: string | null;
  origem_lead?: string | null;
  tipo_lead?: string | null;
  // Campos reais do Supabase mdewbruvzrrxezsbyzmq (snake_case)
  responsavel_sdr?: string | null;
  responsavel_closer?: string | null;
  motivo_perda?: string | null;
  motivo_perda_detalhe?: string | null;
  meeting_event_id?: string | null;
  data_reuniao_agendada?: string | null;
  reuniao_url?: string | null;
  stage_changed_at?: string | null;
  playbook_version?: string | null;
  fit_score?: number | null;
  fit_score_breakdown?: Record<string, number> | null;
  execution_score?: number | null;
  decisor_confirmado?: boolean;
  oferta_comercial?: OfertaComercial | null;
  proposta_enviada_em?: string | null;
  aceite_em?: string | null;
  payment_status?: PaymentStatus | null;
  pagamento_em?: string | null;
  ganho_override_em?: string | null;
  ganho_override_motivo?: string | null;
  pipeline_review_required?: boolean;
  no_show_reagenda_tentativas?: number;
  tentativas_followup?: number | null;
  data_ultimo_contato?: string | null;
  qtde_funcionarios?: number | null;
  cnae?: string | null;
  cnae_grupo?: string | null;
  cnae_setor?: string | null;
  tipo_empresa?: string | null;
}

export interface Atividade {
  id: string;
  lead_cnpj: string;
  tipo_atividade: string;
  resultado: string;
  nota: string;
  created_at: string;
  created_by?: string | null;
  playbook_version?: string;
  message_key?: string | null;
  origem?: string | null;
  canal?: string | null;
  metadados?: Record<string, unknown>;
}

export const STATUS_OPTIONS: LeadStatus[] = [
  "A Contatar",
  "Prospectado",
  "Em Qualificação",
  "Qualificado",
  "Reunião Agendada",
  "Nurturing",
  "Desqualificado",
  "Opt-out",
];

export const ESTAGIO_FUNIL_OPTIONS: EstagioFunil[] = [
  "Reunião Agendada",
  "Diagnóstico Realizado",
  "Proposta Enviada",
  "Em Negociação",
  "Aguardando Aceite",
  "Aguardando Pagamento",
  "Fechado Ganho",
  "No-show",
  "Nurturing",
  "Desqualificado",
  "Opt-out",
  "Fechado Perdido",
];

export const OFERTA_OPTIONS: { id: OfferId; label: OfertaComercial }[] = [
  { id: "imersao", label: "Imersão" },
  { id: "demanda", label: "Demanda" },
  { id: "atendimento_ia", label: "Atendimento com IA" },
  { id: "operacao_vendas", label: "Operação de Vendas" },
];

export const MOTIVO_PERDA_LABEL: Record<MotivoPerda, string> = {
  sem_fit: "Sem fit",
  prioridade_timing: "Prioridade / timing",
  investimento: "Investimento",
  veto_decisor: "Veto do decisor",
  concorrente: "Concorrente",
  desistencia: "Desistência",
  outro: "Outro",
};

export const TIPO_ATIVIDADE_OPTIONS: TipoAtividade[] = ["WhatsApp", "Ligação", "Email", "Pesquisa", "Visita"];

export const RESULTADO_OPTIONS: ResultadoAtividade[] = [
  "Conectado", "Atendeu", "Respondeu", "Não Atendeu",
  // "Agendou Reunião" sai da lista de propósito: registrar reunião exige evento real
  // na agenda (botão "Agendar reunião" na ficha). Escolher aqui só dava erro.
  "Caixa Postal", "Sem Resposta", "Recusou", "Pesquisa Concluída",
];

export const STATUS_COLORS: Record<LeadStatus, string> = {
  "A Contatar": "bg-muted text-muted-foreground",
  "Prospectado": "bg-warning/15 text-warning border border-warning/30",
  "Arquivo Morto": "bg-muted text-muted-foreground border",
  "Cliente Ativo": "bg-success/15 text-success border border-success/30",
  "Em Qualificação": "bg-warning/15 text-warning border border-warning/30",
  "Qualificado": "bg-success/15 text-success border border-success/30",
  "Reunião Agendada": "bg-primary/15 text-primary border border-primary/30",
  "Nurturing": "bg-muted text-muted-foreground border",
  "Desqualificado": "bg-destructive/15 text-destructive border border-destructive/30",
  "Opt-out": "bg-destructive/15 text-destructive border border-destructive/30",
};

export const ESTAGIO_COLORS: Record<EstagioFunil, string> = {
  "Reunião Agendada": "bg-primary/15 text-primary",
  "Diagnóstico Realizado": "bg-warning/15 text-warning",
  "Proposta Enviada": "bg-primary/15 text-primary",
  "Em Negociação": "bg-warning/15 text-warning",
  "Aguardando Aceite": "bg-warning/15 text-warning",
  "Aguardando Pagamento": "bg-warning/15 text-warning",
  "Fechado Ganho": "bg-success/15 text-success",
  "No-show": "bg-destructive/15 text-destructive",
  "Nurturing": "bg-muted text-muted-foreground",
  "Desqualificado": "bg-destructive/15 text-destructive",
  "Opt-out": "bg-destructive/15 text-destructive",
  "Fechado Perdido": "bg-destructive/15 text-destructive",
};

export function calculateScore(lead: Pick<Lead, 'possui_site' | 'instagram_ativo' | 'faz_anuncios' | 'whatsapp_automacao' | 'whatsapp_humano'>): number {
  let score = 0;
  if (lead.possui_site) score += 30;
  if (lead.instagram_ativo) score += 20;
  if (lead.faz_anuncios) score += 40;
  if (lead.whatsapp_humano) score += 10;
  else if (lead.whatsapp_automacao) score += 5;
  return Math.min(score, 100);
}
