export type LeadStatus = "A Contatar" | "Em Qualificação" | "Reunião Agendada" | "Desqualificado";

export type EstagioFunil = "Reunião Agendada" | "Reunião Realizada" | "Proposta Enviada" | "Em Negociação" | "Fechado Ganho" | "Fechado Perdido";

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
  pesquisa_realizada: boolean;
  lead_score: number | null;
  observacoes_sdr: string;
  estagio_funil: EstagioFunil | null;
  valor_negocio_estimado: number | null;
  data_proximo_passo: string | null;
  observacoes_closer: string;
  created_at: string;
}

export const STATUS_OPTIONS: LeadStatus[] = [
  "A Contatar",
  "Em Qualificação",
  "Reunião Agendada",
  "Desqualificado",
];

export const ESTAGIO_FUNIL_OPTIONS: EstagioFunil[] = [
  "Reunião Agendada",
  "Reunião Realizada",
  "Proposta Enviada",
  "Em Negociação",
  "Fechado Ganho",
  "Fechado Perdido",
];

export const STATUS_COLORS: Record<LeadStatus, string> = {
  "A Contatar": "bg-muted text-muted-foreground",
  "Em Qualificação": "bg-warning/15 text-warning border border-warning/30",
  "Reunião Agendada": "bg-info/15 text-info border border-info/30",
  "Desqualificado": "bg-destructive/15 text-destructive border border-destructive/30",
};

export const ESTAGIO_COLORS: Record<EstagioFunil, string> = {
  "Reunião Agendada": "bg-info/15 text-info",
  "Reunião Realizada": "bg-warning/15 text-warning",
  "Proposta Enviada": "bg-primary/15 text-primary",
  "Em Negociação": "bg-warning/15 text-warning",
  "Fechado Ganho": "bg-success/15 text-success",
  "Fechado Perdido": "bg-destructive/15 text-destructive",
};
