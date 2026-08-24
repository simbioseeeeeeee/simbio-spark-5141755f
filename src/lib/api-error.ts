export type ApiErrorContext = {
  operation: string;
  status?: number;
  code?: string;
  requestId?: string;
};

export class ApiError extends Error {
  readonly operation: string;
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(message: string, context: ApiErrorContext) {
    super(message);
    this.name = "ApiError";
    this.operation = context.operation;
    this.status = context.status;
    this.code = context.code;
    this.requestId = context.requestId;
  }
}
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function apiErrorMessage(error: unknown, action: string): string {
  if (!(error instanceof ApiError)) return errorMessage(error, `Não foi possível ${action}. Tente novamente.`);

  switch (error.status) {
    case 400:
    case 422:
      return error.message || `Revise os dados antes de ${action}.`;
    case 401:
      return "Sua sessão expirou. Entre novamente para continuar.";
    case 403:
      return `Seu perfil não tem permissão para ${action}.`;
    case 409:
      return error.message || `O lead mudou enquanto você trabalhava. Atualize a ficha e tente novamente.`;
    default:
      return error.message || `Não foi possível ${action}. Tente novamente.`;
  }
}
