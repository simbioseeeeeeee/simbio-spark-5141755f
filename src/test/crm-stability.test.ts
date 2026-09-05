import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("estabilidade operacional do CRM", () => {
  it("não recarrega o Kanban inteiro a cada UPDATE realtime", () => {
    const source = read("src/components/CloserPipeline.tsx");
    const realtime = source.slice(source.indexOf("// Realtime:"), source.indexOf("// Apply filters"));
    expect(realtime).toContain("rowToLead(newLead)");
    expect(realtime).not.toContain("loadData()");
  });

  it("não faz N+1 de atividades ao abrir o pipeline", () => {
    const source = read("src/components/CloserPipeline.tsx");
    expect(source).not.toContain("getLeadAtividades");
    expect(source).toContain("getLeadsLastContact");
  });

  it("salva etapa e oferta junto com a ficha", () => {
    const store = read("src/store/leads-store.ts");
    const update = store.slice(
      store.indexOf("export async function updateLead"),
      store.indexOf("export async function transitionLeadStage"),
    );
    expect(update).toContain("estagio_funil: lead.estagio_funil");
    expect(update).toContain("oferta_comercial: lead.oferta_comercial");
    expect(update).toContain("decisor_confirmado: lead.decisor_confirmado");
  });

  it("usa uma única RPC para os badges da tela Leads", () => {
    const source = read("src/store/leads-overhaul-store.ts");
    const counts = source.slice(source.indexOf("export async function getTabCounts"), source.indexOf("/** Lead por CNPJ"));
    expect(counts).toContain("crm_lead_tab_counts");
    expect(counts).not.toContain("Promise.all");
  });

  it("libera a busca em todas as cidades e expõe a fila sem Instagram", () => {
    const source = read("src/pages/SocialSelling.tsx");
    expect(source).not.toContain("praca_atual");
    expect(source).toContain(".range(from, from + pageSize - 1)");
    expect(source).toContain("todos para pesquisar");
    expect(source).toContain('a.ig_status === "revisar"');
  });
});
