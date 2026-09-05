import { describe, expect, it } from "vitest";
import {
  ACTIVITY_RESULTS,
  ACTIVITY_TYPES,
  mapLegacyActivity,
  validateActivityDraft,
} from "@/lib/crm-domain";
import { ApiError, apiErrorMessage } from "@/lib/api-error";

describe("contrato de atividades do CRM", () => {
  it("usa somente os valores aceitos pelo banco de produção", () => {
    expect(ACTIVITY_TYPES).toEqual([
      "whatsapp_in", "whatsapp_out", "ligacao", "email_out", "sms_out",
      "reuniao", "nota", "mudanca_status",
    ]);
    expect(ACTIVITY_RESULTS).toEqual([
      "sucesso", "erro", "escalado", "recusa", "agendado", "sem_resposta",
    ]);
    expect(ACTIVITY_RESULTS).not.toContain("realizada");
  });

  it("preserva compatibilidade de rótulo sem enviar o rótulo ao banco", () => {
    expect(mapLegacyActivity("Ligação", "Conectado")).toEqual({
      activityType: "ligacao",
      activityResult: "sucesso",
    });
  });

  it("rejeita atividade futura e observação excessiva", () => {
    expect(validateActivityDraft({
      type: "nota",
      result: "sucesso",
      direction: "out",
      note: "ok",
      occurredAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    })).toMatch(/futuro/);
    expect(validateActivityDraft({
      type: "nota",
      result: "sucesso",
      direction: "out",
      note: "x".repeat(4_001),
      occurredAt: new Date().toISOString(),
    })).toMatch(/4\.000/);
  });
});

describe("mensagens de erro HTTP", () => {
  it("distingue sessão, permissão e conflito", () => {
    expect(apiErrorMessage(new ApiError("", { operation: "save", status: 401 }), "salvar")).toMatch(/sessão/i);
    expect(apiErrorMessage(new ApiError("", { operation: "save", status: 403 }), "salvar")).toMatch(/permissão/i);
    expect(apiErrorMessage(new ApiError("Lead alterado", { operation: "save", status: 409 }), "salvar")).toBe("Lead alterado");
  });
});
