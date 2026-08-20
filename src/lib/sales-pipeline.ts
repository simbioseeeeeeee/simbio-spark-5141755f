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

export const ALLOWED_PIPELINE_TRANSITIONS: Record<EstagioFunil, readonly EstagioFunil[]> = {
  "Reunião Agendada": ["Diagnóstico Realizado", "No-show", "Nurturing", "Desqualificado", "Fechado Perdido", "Opt-out"],
  "Diagnóstico Realizado": ["Proposta Enviada", "Nurturing", "Desqualificado", "Fechado Perdido", "Opt-out"],
  "Proposta Enviada": ["Em Negociação", "Aguardando Aceite", "Nurturing", "Fechado Perdido", "Opt-out"],
  "Em Negociação": ["Aguardando Aceite", "Proposta Enviada", "Nurturing", "Fechado Perdido", "Opt-out"],
  "Aguardando Aceite": ["Em Negociação", "Aguardando Pagamento", "Fechado Perdido", "Opt-out"],
  "Aguardando Pagamento": ["Fechado Ganho", "Em Negociação", "Fechado Perdido", "Opt-out"],
  "No-show": ["Reunião Agendada", "Nurturing", "Desqualificado", "Opt-out"],
  "Nurturing": ["Reunião Agendada", "Diagnóstico Realizado", "Opt-out"],
  "Desqualificado": [],
  "Opt-out": [],
  "Fechado Ganho": [],
  "Fechado Perdido": ["Em Negociação"],
};

export const ALLOWED_SDR_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  "A Contatar": ["Prospectado", "Em Qualificação", "Nurturing", "Desqualificado", "Opt-out"],
  // Prospectado = o webhook já mandou o primeiro toque e o lead ainda não respondeu.
  "Prospectado": ["Em Qualificação", "Qualificado", "Nurturing", "Desqualificado", "Opt-out"],
  "Em Qualificação": ["Qualificado", "Nurturing", "Desqualificado", "Opt-out"],
  "Qualificado": ["Reunião Agendada", "Em Qualificação", "Nurturing", "Desqualificado", "Opt-out"],
  "Reunião Agendada": ["Qualificado", "Nurturing", "Opt-out"],
  "Nurturing": ["Em Qualificação", "Qualificado", "Desqualificado", "Opt-out"],
  "Desqualificado": ["Nurturing"],
  "Opt-out": [],
  "Arquivo Morto": ["A Contatar", "Nurturing"],
  "Cliente Ativo": ["Nurturing"],
};

/** Status que a UI pode oferecer a partir do atual, incluindo ficar onde está. */
export function allowedSdrTargets(current: LeadStatus): LeadStatus[] {
  return [current, ...(ALLOWED_SDR_TRANSITIONS[current] ?? [])];
}

export function validateSdrTransition(
  current: LeadStatus,
  target: LeadStatus,
  eventId?: string | null,
  meetingAt?: string | null,
  meetingUrl?: string | null,
): TransitionValidation {
  if (current === target) return { ok: true };
  if (target === "Opt-out") return { ok: true };
  // status vindo do banco que a matriz não conhece não pode derrubar a ficha
  const permitidos = ALLOWED_SDR_TRANSITIONS[current] ?? [];
  if (!permitidos.includes(target)) {
    return { ok: false, reason: `Transição SDR não permitida: ${current} → ${target}.` };
  }
  if (target === "Reunião Agendada" && !eventId?.trim()) {
    return { ok: false, reason: "Reunião Agendada exige um event_id real da agenda." };
  }
  if (target === "Reunião Agendada" && (!meetingAt || !meetingUrl?.trim())) {
    return { ok: false, reason: "Reunião Agendada exige data, horário e link reais." };
  }
  if (target === "Reunião Agendada" && !hasMinimumMeetingNotice(meetingAt)) {
    return { ok: false, reason: "O diagnóstico exige antecedência mínima de 2 horas." };
  }
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
  const current = lead.estagio_funil;

  if (current === target) return { ok: true };
  if (current === "No-show" && target === "Reunião Agendada" && (lead.no_show_reagenda_tentativas || 0) >= 1) {
    return { ok: false, reason: "No-show permite uma única tentativa de reagendamento; mova para Nurturing." };
  }
  if (current && isPipelineStage(current)) {
    const allowed = ALLOWED_PIPELINE_TRANSITIONS[current] ?? [];
    if (!allowed.includes(target)) {
      return { ok: false, reason: `Transição não permitida: ${current} → ${target}.` };
    }
  } else if (target !== "Reunião Agendada") {
    return { ok: false, reason: "A entrada no funil do closer deve acontecer por Reunião Agendada." };
  }

  if (target === "Reunião Agendada" && !(context.eventId || lead.meeting_event_id)?.trim()) {
    return { ok: false, reason: "Reunião Agendada exige um event_id real da agenda." };
  }
  if (target === "Reunião Agendada" && (!(context.meetingAt || lead.data_reuniao_agendada) || !(context.meetingUrl || lead.reuniao_url)?.trim())) {
    return { ok: false, reason: "Reunião Agendada exige data, horário e link reais." };
  }
  if (target === "Reunião Agendada" && !hasMinimumMeetingNotice(context.meetingAt || lead.data_reuniao_agendada)) {
    return { ok: false, reason: "O diagnóstico exige antecedência mínima de 2 horas." };
  }

  if (ACTIVE_STAGES.has(target) && !(context.nextStepAt || lead.data_proximo_passo)) {
    return { ok: false, reason: `${target} exige próximo passo com data.` };
  }

  if (target === "Proposta Enviada" && !(context.offer || lead.oferta_comercial)) {
    return { ok: false, reason: "Proposta Enviada exige uma oferta comercial canônica." };
  }
  if (target === "Proposta Enviada" && !lead.decisor_confirmado) {
    return { ok: false, reason: "Proposta Enviada exige decisor confirmado." };
  }

  if (target === "Aguardando Pagamento" && !lead.aceite_em) {
    return { ok: false, reason: "Aguardando Pagamento exige aceite confirmado." };
  }

  if (target === "Fechado Perdido") {
    const reason = context.lossReason || lead.motivo_perda;
    if (!reason) return { ok: false, reason: "Fechado Perdido exige motivo estruturado." };
    if (reason === "outro" && !(context.lossReasonDetail || lead.motivo_perda_detalhe)?.trim()) {
      return { ok: false, reason: "O motivo 'Outro' exige uma explicação." };
    }
  }

  if (target === "Fechado Ganho") {
    const paid = lead.payment_status === "pago";
    const override = context.managerOverride === true
      || Boolean(lead.ganho_override_em && lead.ganho_override_motivo?.trim());
    const overrideReason = context.managerOverrideReason || lead.ganho_override_motivo;
    if (!paid && !(override && overrideReason?.trim())) {
      return { ok: false, reason: "Fechado Ganho exige pagamento confirmado ou override gerencial justificado." };
    }
  }

  if (TERMINAL_OR_EXIT_STAGES.has(target) && target !== "Fechado Perdido" && target !== "Fechado Ganho") {
    return { ok: true };
  }

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
