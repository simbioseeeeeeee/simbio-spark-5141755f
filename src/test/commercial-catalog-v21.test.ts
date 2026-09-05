import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("catálogo comercial V2.1", () => {
  it("expõe somente as quatro ofertas novas para propostas", () => {
    const types = read("src/types/lead.ts");
    expect(types).toContain('id: "imersao"');
    expect(types).toContain('id: "demanda"');
    expect(types).toContain('id: "atendimento_ia"');
    expect(types).toContain('id: "operacao_vendas"');
    expect(types).not.toContain('id: "operacao_avancada"');
    expect(types).toContain('PLAYBOOK_VERSION = "simbiose-sales-v2@2.1.0"');
    expect(types).toContain('CATALOG_VERSION = "2.1.0"');
  });

  it("não aceita preço ou desconto digitado no fluxo novo", () => {
    const component = read("src/components/ReuniaoTab.tsx");
    const store = read("src/store/playbook-store.ts");
    expect(component).not.toMatch(/placeholder=["'][^"']*(preço|desconto|valor)/i);
    expect(component).toContain("calcularCotacaoComercial");
    expect(store).toContain("Calcule a cotação oficial antes de enviar");
    expect(store).toContain("Preço e desconto não podem ser enviados manualmente");
  });

  it("mantém ofertas antigas apenas na compatibilidade do banco", () => {
    const migration = read("supabase/migrations/20260817090000_comercial_v2_crm.sql");
    const active = [
      read("src/components/ReuniaoTab.tsx"),
      read("src/store/playbook-store.ts"),
      read("src/types/lead.ts"),
    ].join("\n");
    expect(migration).toContain("Operação avançada");
    expect(active).not.toContain("operacao_avancada");
  });
});
