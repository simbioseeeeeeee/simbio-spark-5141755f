import { supabase } from "@/integrations/supabase/client";

export interface EventCount {
  event_type: string;
  total: number;
  success_true: number;
  success_false: number;
}

export interface CadenceFailure {
  channel: string;
  step_tipo: string;
  total: number;
}

export interface NextDispatch {
  cnpj: string;
  fantasia: string | null;
  contato_nome: string | null;
  status_sdr: string | null;
  origem_lead: string | null;
  data_proximo_passo: string;
  tentativas_followup: number | null;
}

export interface SistemaSummary {
  lastEventAt: string | null;
  eventsLast24h: EventCount[];
  cadenceTotal24h: number;
  cadenceSuccess24h: number;
  cadenceFailures24h: CadenceFailure[];
  nextDispatches: NextDispatch[];
  ignoredCounts: { unknown: number; pendente: number; blocked_owner: number };
}

const HOURS_24_ISO = () =>
  new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const HOURS_NEXT_24_ISO = () =>
  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

export async function getSistemaSummary(): Promise<SistemaSummary> {
  const since = HOURS_24_ISO();
  const nowIso = new Date().toISOString();
  const next24 = HOURS_NEXT_24_ISO();

  const [logsRes, lastRes, dispatchesRes] = await Promise.all([
    supabase
      .from("sdr_agent_logs" as any)
      .select("event_type, success")
      .gte("created_at", since)
      .limit(50000),
    supabase
      .from("sdr_agent_logs" as any)
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("leads")
      .select(
        "cnpj, fantasia, contato_nome, status_sdr, origem_lead, data_proximo_passo, tentativas_followup"
      )
      .gte("data_proximo_passo", nowIso)
      .lte("data_proximo_passo", next24)
      .order("data_proximo_passo", { ascending: true })
      .limit(50),
  ]);

  if (logsRes.error) throw logsRes.error;

  const logs = (logsRes.data ?? []) as Array<{
    event_type: string | null;
    success: boolean | null;
  }>;

  const eventMap = new Map<string, EventCount>();
  for (const l of logs) {
    const k = l.event_type ?? "<null>";
    if (!eventMap.has(k)) {
      eventMap.set(k, { event_type: k, total: 0, success_true: 0, success_false: 0 });
    }
    const ec = eventMap.get(k)!;
    ec.total += 1;
    if (l.success === true) ec.success_true += 1;
    else if (l.success === false) ec.success_false += 1;
  }
  const eventsLast24h = Array.from(eventMap.values()).sort(
    (a, b) => b.total - a.total
  );

  const cadenceRow = eventMap.get("cadence_step");
  const cadenceTotal24h = cadenceRow?.total ?? 0;
  const cadenceSuccess24h = cadenceRow?.success_true ?? 0;

  const failuresRes = await supabase
    .from("sdr_agent_logs" as any)
    .select("channel, metadata")
    .eq("event_type", "cadence_step")
    .eq("success", false)
    .gte("created_at", since)
    .limit(1000);

  const failureMap = new Map<string, CadenceFailure>();
  if (!failuresRes.error) {
    for (const row of (failuresRes.data ?? []) as Array<{
      channel: string | null;
      metadata: Record<string, unknown> | null;
    }>) {
      const channel = row.channel ?? "?";
      const step_tipo =
        (row.metadata && (row.metadata as any).step_tipo) || "?";
      const k = `${channel}|${step_tipo}`;
      if (!failureMap.has(k)) {
        failureMap.set(k, { channel, step_tipo: String(step_tipo), total: 0 });
      }
      failureMap.get(k)!.total += 1;
    }
  }
  const cadenceFailures24h = Array.from(failureMap.values()).sort(
    (a, b) => b.total - a.total
  );

  const ignoredCounts = {
    unknown: eventMap.get("ignored_unknown_contact")?.total ?? 0,
    pendente: eventMap.get("ignored_pendente_lead")?.total ?? 0,
    blocked_owner: eventMap.get("ignored_blocked_owner")?.total ?? 0,
  };

  const lastEventAt =
    !lastRes.error && lastRes.data && lastRes.data.length > 0
      ? (lastRes.data[0] as any).created_at
      : null;

  const nextDispatches = ((dispatchesRes.data ?? []) as NextDispatch[]).filter(
    (d) =>
      !(d.cnpj || "").startsWith("PENDENTE-") &&
      d.origem_lead !== "bitrix_migrado"
  );

  return {
    lastEventAt,
    eventsLast24h,
    cadenceTotal24h,
    cadenceSuccess24h,
    cadenceFailures24h,
    nextDispatches,
    ignoredCounts,
  };
}
