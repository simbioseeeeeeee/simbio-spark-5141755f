import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260824143000_crm_manual_lead_and_trash.sql");

describe("cadastro e Lixeira de leads", () => {
  it("cadastra por RPC validando identidade, CNPJ e duplicidade", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.crm_create_manual_lead");
    expect(migration).toContain("public.crm_valid_cnpj(v_cnpj)");
    expect(migration).toContain("usuario sem papel no CRM");
    expect(migration).toContain("CNPJ ja cadastrado");
    expect(read("src/components/NewLeadModal.tsx")).toContain('supabase.rpc("crm_create_manual_lead"');
  });

  it("faz exclusão recuperável somente por gestor e preserva a auditoria", () => {
    expect(migration).toContain("v_role IS DISTINCT FROM 'manager'");
    expect(migration).toContain("deleted_previous_state = v_previous");
    expect(migration).toContain("INSERT INTO public.crm_lead_deletion_audit");
    expect(migration).toContain("status = 'cancelada'");
    expect(migration).toContain("status = 'cancelled'");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.leads/i);
    expect(migration).toContain("deleted_at IS NULL OR public.has_role(auth.uid(), 'manager')");
    expect(migration).toContain("WITH CHECK (deleted_at IS NULL)");
  });

  it("bloqueia exclusão de relações comerciais sensíveis", () => {
    expect(migration).toContain("payment_status = 'pago'");
    expect(migration).toContain("estagio_funil = 'Fechado Ganho'");
    expect(migration).toContain("meeting_event_id IS NOT NULL");
    expect(migration).toContain("FROM public.fechamentos");
  });

  it("retira excluídos das listas e mantém uma aba de Lixeira para gestores", () => {
    const store = read("src/store/leads-overhaul-store.ts");
    const page = read("src/pages/LeadsOverhaul.tsx");
    expect(store).toContain('q.tab === "Lixeira"');
    expect(store).toContain('query.is("deleted_at", null)');
    expect(page).toContain('role === "manager"');
    expect(page).toContain('value: "Lixeira"');
  });

  it("restaura com a automação pausada para revisão humana", () => {
    expect(migration).toContain("status_cadencia = 'pausada_handoff'");
    expect(migration).toContain("automation_paused");
    expect(read("src/components/LeadDetailSheet.tsx")).toContain("restoreDeletedLead");
  });
});
