import { supabase } from "@/integrations/supabase/client";

// Backend de vendas (FastAPI no agents server). O CRM fala com ele para o que o
// Supabase sozinho não faz: ligar pela Larissa (Vapi) e mandar WhatsApp pelo
// número oficial (UChat). Toda chamada leva o JWT da sessão — o backend valida
// em /auth/v1/user antes de agir.
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "https://api.simbiosedigital.com";

export async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("sessão expirada — faça login de novo");

  const resp = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error((payload as any)?.detail || (payload as any)?.error || `HTTP ${resp.status}`);
  }
  return payload as T;
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
