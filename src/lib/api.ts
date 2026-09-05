import { supabase } from "@/integrations/supabase/client";
import { ApiError } from "@/lib/api-error";

// Backend de vendas (FastAPI no agents server). O CRM fala com ele para o que o
// Supabase sozinho não faz: ligar pela Larissa (Vapi) e mandar WhatsApp pelo
// número oficial (UChat). Toda chamada leva o JWT da sessão — o backend valida
// em /auth/v1/user antes de agir.
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "https://api.simbiosedigital.com";

async function sessionToken(path: string) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) {
    throw new ApiError("Sua sessão expirou. Entre novamente para continuar.", {
      operation: path,
      status: 401,
    });
  }
  return token;
}

async function responsePayload<T>(resp: Response, path: string): Promise<T> {
  const payload: unknown = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const record = typeof payload === "object" && payload !== null
      ? payload as Record<string, unknown>
      : {};
    const detail = typeof record.detail === "string"
      ? record.detail
      : typeof record.error === "string"
        ? record.error
        : `Falha HTTP ${resp.status}`;
    const code = typeof record.code === "string" ? record.code : undefined;
    const requestId = resp.headers.get("x-request-id") ||
      (typeof record.request_id === "string" ? record.request_id : undefined);

    console.error("[crm-api] operação falhou", {
      operation: path,
      status: resp.status,
      code,
      requestId,
    });
    throw new ApiError(detail, {
      operation: path,
      status: resp.status,
      code,
      requestId,
    });
  }
  return payload as T;
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const token = await sessionToken(path);
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return responsePayload<T>(resp, path);
}

export async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const token = await sessionToken(path);

  const resp = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return responsePayload<T>(resp, path);
}

/** Manda a Larissa (IA) ligar para o lead agora. */
export function ligarParaLead(leadCnpj: string) {
  return apiPost<{ ok: boolean; call_id?: string }>("/api/crm/ligar", { lead_cnpj: leadCnpj });
}

/** Envia WhatsApp pelo número oficial. Erro 409 = janela de 24h fechada. */
export function enviarWhatsAppLead(leadCnpj: string, texto: string) {
  return apiPost<{ ok: boolean }>("/api/crm/whatsapp/enviar", { lead_cnpj: leadCnpj, texto });
}

export type AgendamentoOk = {
  ok: true;
  meet_link: string | null;
  event_id: string | null;
  data_legivel: string;
  data_reuniao: string;
};

/** SDR marca o diagnóstico: cria o evento no Google Agenda com Meet, move o
 *  lead pra "Reunião Agendada" e registra a atividade. Antes disso a SDR
 *  marcava na mão na agenda e o CRM nunca ficava sabendo. */
export async function agendarReuniao(leadCnpj: string, quandoIso: string) {
  return apiPost<AgendamentoOk>("/api/crm/agenda/book", {
    lead_cnpj: leadCnpj,
    quando_iso: quandoIso,
  });
}
