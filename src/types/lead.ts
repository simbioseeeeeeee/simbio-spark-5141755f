export type LeadStatus = "A Contatar" | "Em Qualificação" | "Reunião Agendada" | "Desqualificado" | "Desqualificado - Sem Perfil" | "Desqualificado - Sem Budget" | "Desqualificado - Sem Interesse";

export type EstagioFunil = "Reunião Agendada" | "Reunião Realizada" | "Proposta Enviada" | "Em Negociação" | "Fechado Ganho" | "Fechado Perdido";

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
  valor_negocio_estimado: number | null;
  data_proximo_passo: string | null;
  observacoes_closer: string;
  pesquisa_realizada: boolean;
  lead_score: number | null;
  dia_cadencia: number;
  status_cadencia: string;
  created_at: string;
  owner_id?: string | null;
  sdr_id?: string | null;
}

export interface Atividade {
  id: string;
  lead_id: string;
  tipo_atividade: TipoAtividade;
  resultado: ResultadoAtividade;
  nota: string;
  created_at: string;
  sdr_id?: string | null;
}

export const STATUS_OPTIONS: LeadStatus[] = [
  "A Contatar",
  "Em Qualificação",
  "Reunião Agendada",
  "Desqualificado",
  "Desqualificado - Sem Perfil",
  "Desqualificado - Sem Budget",
  "Desqualificado - Sem Interesse",
];

export const ESTAGIO_FUNIL_OPTIONS: EstagioFunil[] = [
  "Reunião Agendada",
  "Reunião Realizada",
  "Proposta Enviada",
  "Em Negociação",
  "Fechado Ganho",
  "Fechado Perdido",
];

export const TIPO_ATIVIDADE_OPTIONS: TipoAtividade[] = ["WhatsApp", "Ligação", "Email", "Pesquisa", "Visita"];

export const RESULTADO_OPTIONS: ResultadoAtividade[] = [
  "Conectado", "Atendeu", "Respondeu", "Não Atendeu",
  "Caixa Postal", "Sem Resposta", "Agendou Reunião", "Recusou", "Pesquisa Concluída",
];

export const STATUS_COLORS: Record<LeadStatus, string> = {
  "A Contatar": "bg-muted text-muted-foreground",
  "Em Qualificação": "bg-warning/15 text-warning border border-warning/30",
  "Reunião Agendada": "bg-primary/15 text-primary border border-primary/30",
  "Desqualificado": "bg-destructive/15 text-destructive border border-destructive/30",
  "Desqualificado - Sem Perfil": "bg-destructive/15 text-destructive border border-destructive/30",
  "Desqualificado - Sem Budget": "bg-destructive/15 text-destructive border border-destructive/30",
  "Desqualificado - Sem Interesse": "bg-destructive/15 text-destructive border border-destructive/30",
};

export const ESTAGIO_COLORS: Record<EstagioFunil, string> = {
  "Reunião Agendada": "bg-primary/15 text-primary",
  "Reunião Realizada": "bg-warning/15 text-warning",
  "Proposta Enviada": "bg-primary/15 text-primary",
  "Em Negociação": "bg-warning/15 text-warning",
  "Fechado Ganho": "bg-success/15 text-success",
  "Fechado Perdido": "bg-destructive/15 text-destructive",
};

// Cadence step definitions (day -> action description)
export const CADENCE_STEPS: Record<number, string> = {
  0: "Primeira Tentativa de Contato",
  1: "Enviar WhatsApp #1",
  2: "Ligar para o Lead",
  3: "Enviar WhatsApp #2",
  4: "Ligar novamente",
  5: "Enviar Email",
  6: "WhatsApp de Follow-up",
  7: "Ligar com abordagem diferente",
  8: "WhatsApp Final",
  9: "Última tentativa (Ligar)",
};

// Gap between cadence steps (in days)
export const CADENCE_GAPS: Record<number, number> = {
  0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 2, 7: 3, 8: 2, 9: 3,
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
