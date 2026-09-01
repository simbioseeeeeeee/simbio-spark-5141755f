import {
  ESTAGIO_FUNIL_OPTIONS,
  PLAYBOOK_VERSION,
  type EstagioFunil,
  type Lead,
  type LeadStatus,
  type MotivoPerda,
} from "@/types/lead";

export type TransitionContext = {
  eventId?: string | null;
  meetingAt?: string | null;
  meetingUrl?: string | null;
  nextStepAt?: string | null;
  lossReason?: MotivoPerda | null;
  lossReasonDetail?: string | null;
  offer?: Lead["oferta_comercial"];
  managerOverride?: boolean;
  managerOverrideReason?: string | null;
};

export type TransitionValidation = { ok: true } | { ok: false; reason: string };

const ACTIVE_STAGES = new Set<EstagioFunil>([
  "Diagnóstico Realizado",
  "Proposta Enviada",
  "Em Negociação",
  "Aguardando Aceite",
  "Aguardando Pagamento",
]);

const TERMINAL_OR_EXIT_STAGES = new Set<EstagioFunil>([
  "Fechado Ganho",
  "Fechado Perdido",
  "Desqualificado",
  "Opt-out",
  "Nurturing",
]);

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function hasMinimumMeetingNotice(meetingAt: string | null | undefined): boolean {
  if (!meetingAt) return false;
  const timestamp = new Date(meetingAt).getTime();
  return Number.isFinite(timestamp) && timestamp >= Date.now() + TWO_HOURS_MS;
}

// Avanço livre (decisão CEO 01/09): qualquer etapa do funil pode ir para qualquer
// outra. A matriz continua existindo para POPULAR os dropdowns/Kanban — agora com
// todas as etapas. Sem pré-requisito de decisor/pagamento/oferta (ver validadores).
export const ALLOWED_PIPELINE_TRANSITIONS: Record<EstagioFunil, readonly EstagioFunil[]> =
  Object.fromEntries(
    ESTAGIO_FUNIL_OPTIONS.map((s) => [s, ESTAGIO_FUNIL_OPTIONS] as const),
  ) as Record<EstagioFunil, readonly EstagioFunil[]>;

const ALL_SDR_STATUSES: readonly LeadStatus[] = [
  "A Contatar", "Prospectado", "Em Qualificação", "Qualificado", "Reunião Agendada",
  "Nurturing", "Desqualificado", "Opt-out", "Arquivo Morto", "Cliente Ativo",
];

// Avanço livre: qualquer status SDR pode ir para qualquer outro.
export const ALLOWED_SDR_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> =
  Object.fromEntries(
    ALL_SDR_STATUSES.map((s) => [s, ALL_SDR_STATUSES] as const),
  ) as Record<LeadStatus, readonly LeadStatus[]>;

/** Status que a UI pode oferecer a partir do atual, incluindo ficar onde está. */
export function allowedSdrTargets(current: LeadStatus): LeadStatus[] {
  return Array.from(new Set<LeadStatus>([current, ...(ALLOWED_SDR_TRANSITIONS[current] ?? [])]));
}

export function validateSdrTransition(
  current: LeadStatus,
  target: LeadStatus,
  eventId?: string | null,
  meetingAt?: string | null,
  meetingUrl?: string | null,
): TransitionValidation {
  // Avanço livre (decisão CEO 01/09): sem pré-requisitos para mudar o status SDR.
  // (params mantidos por compatibilidade de assinatura com os chamadores.)
  void current; void target; void eventId; void meetingAt; void meetingUrl;
  return { ok: true };
}

export function isPipelineStage(value: string | null | undefined): value is EstagioFunil {
  return ESTAGIO_FUNIL_OPTIONS.includes(value as EstagioFunil);
}

export function validatePipelineTransition(
  lead: Pick<Lead,
    | "estagio_funil"
    | "meeting_event_id"
    | "data_reuniao_agendada"
    | "reuniao_url"
    | "data_proximo_passo"
    | "motivo_perda"
    | "motivo_perda_detalhe"
    | "payment_status"
    | "oferta_comercial"
    | "aceite_em"
    | "decisor_confirmado"
    | "no_show_reagenda_tentativas"
    | "ganho_override_em"
    | "ganho_override_motivo"
  >,
  target: EstagioFunil,
  context: TransitionContext = {},
): TransitionValidation {
  // Avanço livre (decisão CEO 01/09): humano move o lead para qualquer etapa sem
  // exigir decisor, oferta, próximo passo, aceite, pagamento ou motivo. As regras
  // antigas ficaram no histórico do git (rollback: git revert).
  void lead; void target; void context;
  return { ok: true };
}

export type FitScoreInput = {
  icp: number;
  dorImpacto: number;
  processoCapacidade: number;
  decisao: number;
  timing: number;
};

export type ExecutionScoreInput = {
  diagnostico: number;
  escuta: number;
  confirmacaoEntendimento: number;
  solucaoLigadaDor: number;
  transparenciaTermos: number;
  proximoPassoDatado: number;
};

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, Number(value) || 0));

export function calculateFitScore(input: FitScoreInput): number {
  return clamp(input.icp, 20)
    + clamp(input.dorImpacto, 25)
    + clamp(input.processoCapacidade, 20)
    + clamp(input.decisao, 20)
    + clamp(input.timing, 15);
}

export function calculateExecutionScore(input: ExecutionScoreInput): number {
  return clamp(input.diagnostico, 25)
    + clamp(input.escuta, 15)
    + clamp(input.confirmacaoEntendimento, 15)
    + clamp(input.solucaoLigadaDor, 15)
    + clamp(input.transparenciaTermos, 15)
    + clamp(input.proximoPassoDatado, 15);
}

export const SALES_PLAYBOOK_VERSION = PLAYBOOK_VERSION;
