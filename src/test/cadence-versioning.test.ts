import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const baseSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260824120000_cadence_versioning_shadow.sql"),
  "utf8",
);
const managerSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260824123000_cadence_definition_audit.sql"),
  "utf8",
);
const meetingSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260824130000_confirm_existing_meeting_atomic.sql"),
  "utf8",
);

describe("cadência versionada e segura", () => {
  it("nasce em shadow, sem atribuir ou recalcular leads existentes", () => {
    expect(baseSql).toContain("activation_mode text NOT NULL DEFAULT 'shadow'");
    expect(baseSql).toContain("false, 'shadow'");
    expect(baseSql).not.toMatch(/INSERT INTO public\.lead_cadence_assignments/i);
    expect(baseSql).not.toMatch(/UPDATE public\.leads/i);
  });

  it("semeia a régua T0 a D14 e impede recibo duplicado", () => {
    expect(baseSql).toContain("'inbound.whatsapp.t0'");
    expect(baseSql).toContain("'inbound.voice.t15'");
    expect(baseSql).toContain("'inbound.whatsapp.d14'");
    expect(baseSql).toContain("idempotency_key text NOT NULL UNIQUE");
    expect(baseSql).toContain('"terminal":"nurturing"');
  });

  it("restringe configuração a manager e audita alterações", () => {
    expect(managerSql).toContain("Somente manager pode criar cadências");
    expect(managerSql).toContain("cadence_definitions_audit_update");
    expect(managerSql).toContain("cadence_steps_audit_change");
    expect(managerSql).toContain("SECURITY DEFINER");
    expect(managerSql).toContain("GRANT EXECUTE ON FUNCTION public.create_cadence_definition");
  });

  it("mantém canal e ação coerentes no banco", () => {
    expect(managerSql).toContain("channel = 'voice' AND action_kind = 'place_call'");
    expect(managerSql).toContain("channel = 'human_task' AND action_kind IN ('create_task','notify_owner')");
    expect(managerSql).toContain("channel IN ('whatsapp','sms','email') AND action_kind = 'send_template'");
  });
});

describe("confirmação atômica de reunião existente", () => {
  it("exige evidência completa e grava status mais atividade na mesma RPC", () => {
    expect(meetingSql).toContain("meeting_event_id IS NULL");
    expect(meetingSql).toContain("data_reuniao_agendada IS NULL");
    expect(meetingSql).toContain("nullif(btrim(v_lead.reuniao_url), '') IS NULL");
    expect(meetingSql).toContain("SET status_sdr = 'Reunião Agendada'");
    expect(meetingSql).toContain("tipo_atividade, resultado");
    expect(meetingSql).toContain("'reuniao', 'agendado'");
  });

  it("não duplica atividade para o mesmo event_id e limpa somente a cadência", () => {
    expect(meetingSql).toContain("metadados->>'meeting_event_id'");
    expect(meetingSql).toContain("data_proximo_passo = NULL");
    expect(meetingSql).not.toMatch(/data_reuniao_agendada\s*=\s*NULL/);
  });
});
