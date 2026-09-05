import { describe, expect, it } from "vitest";
import { ESTAGIO_LABEL, estagioLabel, ORIGEM_COMERCIAL_LABEL } from "@/types/lead";

describe("inteligência comercial", () => {
  it("mantém os valores técnicos e exibe os novos nomes comerciais", () => {
    expect(ESTAGIO_LABEL["Proposta Enviada"]).toBe("Proposta realizada");
    expect(ESTAGIO_LABEL["Aguardando Aceite"]).toBe("Proposta aprovada");
    expect(ESTAGIO_LABEL["Aguardando Pagamento"]).toBe("Proposta assinada / fechamento");
    expect(estagioLabel("Diagnóstico Realizado")).toBe("Reunião realizada");
  });

  it("expõe as origens acordadas sem misturar o identificador técnico do lead", () => {
    expect(ORIGEM_COMERCIAL_LABEL).toEqual({
      live: "Live",
      diagnostico: "Diagnóstico",
      outbound: "Outbound",
      indicacao: "Indicação",
      outros: "Outros",
    });
  });
});
