export const ACTIVITY_TYPES = [
  "whatsapp_in",
  "whatsapp_out",
  "ligacao",
  "email_out",
  "sms_out",
  "reuniao",
  "nota",
  "mudanca_status",
] as const;

export const ACTIVITY_RESULTS = [
  "sucesso",
  "erro",
  "escalado",
  "recusa",
  "agendado",
  "sem_resposta",
] as const;

export const ACTIVITY_DIRECTIONS = ["in", "out"] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export type ActivityResult = (typeof ACTIVITY_RESULTS)[number];
export type ActivityDirection = (typeof ACTIVITY_DIRECTIONS)[number];

export type ActivityDraft = {
  type: ActivityType;
  result: ActivityResult;
  direction: ActivityDirection;
  note: string;
  occurredAt: string;
};

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  whatsapp_in: "WhatsApp recebido",
  whatsapp_out: "WhatsApp enviado",
  ligacao: "Ligação",
  email_out: "E-mail enviado",
  sms_out: "SMS enviado",
  reuniao: "Reunião",
  nota: "Nota / observação",
  mudanca_status: "Mudança de status",
};

export const ACTIVITY_RESULT_LABEL: Record<ActivityResult, string> = {
  sucesso: "Sucesso",
  erro: "Erro",
  escalado: "Escalado",
  recusa: "Recusou",
  agendado: "Agendado",
  sem_resposta: "Sem resposta",
};

export const ACTIVITY_DIRECTION_LABEL: Record<ActivityDirection, string> = {
  in: "Entrada",
  out: "Saída",
};

const LEGACY_ACTIVITY_TYPE: Record<string, ActivityType> = {
  WhatsApp: "whatsapp_out",
  Ligação: "ligacao",
  Email: "email_out",
  Pesquisa: "nota",
  Visita: "nota",
};

const LEGACY_ACTIVITY_RESULT: Record<string, ActivityResult> = {
  Conectado: "sucesso",
  Atendeu: "sucesso",
  Respondeu: "sucesso",
  "Não Atendeu": "sem_resposta",
  "Caixa Postal": "sem_resposta",
  "Sem Resposta": "sem_resposta",
  "Agendou Reunião": "agendado",
  Recusou: "recusa",
  "Pesquisa Concluída": "sucesso",
};

export function isActivityType(value: string): value is ActivityType {
  return (ACTIVITY_TYPES as readonly string[]).includes(value);
}
export function isActivityResult(value: string): value is ActivityResult {
  return (ACTIVITY_RESULTS as readonly string[]).includes(value);
}

export function isActivityDirection(value: string): value is ActivityDirection {
  return (ACTIVITY_DIRECTIONS as readonly string[]).includes(value);
}

export function mapLegacyActivity(type: string, result: string) {
  const activityType = isActivityType(type) ? type : LEGACY_ACTIVITY_TYPE[type];
  const activityResult = isActivityResult(result) ? result : LEGACY_ACTIVITY_RESULT[result];

  if (!activityType || !activityResult) {
    throw new Error("Tipo ou resultado de atividade fora do vocabulário comercial.");
  }

  return { activityType, activityResult };
}

export function validateActivityDraft(draft: ActivityDraft): string | null {
  if (!isActivityType(draft.type)) return "Selecione um tipo de atividade válido.";
  if (!isActivityResult(draft.result)) return "Selecione um resultado válido.";
  if (!isActivityDirection(draft.direction)) return "Selecione a direção da atividade.";
  if (!draft.occurredAt || Number.isNaN(new Date(draft.occurredAt).getTime())) {
    return "Informe uma data e hora válidas.";
  }
  if (new Date(draft.occurredAt).getTime() > Date.now() + 5 * 60_000) {
    return "A atividade não pode estar no futuro.";
  }
  if (draft.note.length > 4_000) return "A observação deve ter no máximo 4.000 caracteres.";
  return null;
}
