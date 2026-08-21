import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mapActivityToDatabase } from "@/store/leads-store";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("integração frontend do comercial V2", () => {
  it("traduz os rótulos da atividade para os enums minúsculos do banco", () => {
    expect(mapActivityToDatabase("Ligação", "Atendeu")).toEqual({
      tipoAtividade: "ligacao",
      resultadoAtividade: "sucesso",
    });
    expect(mapActivityToDatabase("WhatsApp", "Sem Resposta")).toEqual({
      tipoAtividade: "whatsapp_out",
      resultadoAtividade: "sem_resposta",
    });
    expect(mapActivityToDatabase("Pesquisa", "Pesquisa Concluída")).toEqual({
      tipoAtividade: "nota",
      resultadoAtividade: "sucesso",
    });
  });

  it("não envia campos controlados pelo servidor no update genérico do lead", () => {
    const source = read("src/store/leads-store.ts");
    const updateLeadBody = source.slice(
      source.indexOf("export async function updateLead"),
      source.indexOf("export async function transitionLeadStage"),
    );
    for (const field of [
      "meeting_event_id", "data_reuniao_agendada", "reuniao_url",
      "aceite_em", "payment_status", "pagamento_em", "proposta_enviada_em",
      "no_show_reagenda_tentativas", "ganho_override_em",
    ]) {
      expect(updateLeadBody).not.toContain(`${field}:`);
    }
  });

  it("mantém agenda somente leitura no perfil", () => {
    const source = read("src/components/LeadProfile.tsx");
    // o texto agora explica as 3 fontes que preenchem sozinhas (Larissa,
    // Calendar sync, tl;dv) em vez de cobrar o event_id do closer
    expect(source).toContain("Preenchido automaticamente");
    expect(source).not.toContain('setField("meeting_event_id"');
    expect(source).not.toContain('setField("data_reuniao_agendada"');
    expect(source).not.toContain('setField("reuniao_url"');
  });

  it("gera proposta apenas no diagnóstico e deixa o backend registrar o envio", () => {
    const component = read("src/components/ReuniaoTab.tsx");
    const store = read("src/store/playbook-store.ts");
    expect(component).toContain('const podeGerarProposta = estagioFunil === "Diagnóstico Realizado"');
    expect(component).not.toContain("registrarPropostaEnviada");
    expect(store).not.toContain("export async function registrarPropostaEnviada");
    expect(component).toContain("Gerar rascunho com IA");
    expect(store).toContain("/api/fechamento/rascunho");
  });

  it("não usa exclusividade nem copy antiga e deriva valores do catálogo", () => {
    const component = read("src/components/ReuniaoTab.tsx");
    expect(component).not.toContain("exclusividade_meses");
    expect(component).not.toContain("não é contrato");
    expect(component).not.toContain("exclusividade_inicio");
    expect(component).not.toContain("placeholder=\"exclusividade");
    expect(component).toContain("calcularCotacaoComercial");
    expect(component).toContain("quote_id: quoteId");
  });

  // O vocabulário do front tem de espelhar o CHECK leads_status_sdr_chk do mdew.
  // "Prospectado" e "Cliente Ativo" são estados VIVOS (o facebook-webhook cria todo
  // lead de campanha como Prospectado); tratá-los como legado deixava a matriz de
  // transição sem entrada pra eles e a ficha quebrava ao abrir esses leads.
  it("cobre na matriz de transição todo status aceito pelo banco", async () => {
    const { ALLOWED_SDR_TRANSITIONS } = await import("@/lib/sales-pipeline");
    const statusDoBanco = [
      "A Contatar", "Prospectado", "Em Qualificação", "Qualificado",
      "Reunião Agendada", "Desqualificado", "Nurturing", "Opt-out",
      "Arquivo Morto", "Cliente Ativo",
    ];
    for (const status of statusDoBanco) {
      expect(Array.isArray((ALLOWED_SDR_TRANSITIONS as any)[status])).toBe(true);
    }
  });

  it("não ressuscita a cadência legada nas superfícies ativas", () => {
    const activeSources = [
      read("src/store/leads-overhaul-store.ts"),
      read("src/pages/LeadsOverhaul.tsx"),
    ].join("\n");
    expect(activeSources).not.toMatch(/Última tentativa/);
  });

  it("usa somente Fit 70 para qualificação no closer e rotula os dois scores", () => {
    const pipeline = read("src/components/CloserPipeline.tsx");
    const card = read("src/components/closer/PipelineCard.tsx");
    const filters = read("src/components/closer/PipelineFilters.tsx");
    expect(pipeline).toContain("(l.fit_score ?? 0) >= 70");
    expect(pipeline).not.toContain("l.lead_score");
    expect(card).toContain('Fit {lead.fit_score ?? "—"}/100');
    expect(card).toContain('Execução {lead.execution_score ?? "—"}/100');
    expect(filters).toContain("Fit ≥ 70");
    expect([pipeline, card, filters].join("\n")).not.toMatch(/>=\s*(40|50|60)|Fit[^\n]*(40|50|60)/);
  });

  it("mede tempo de etapa exclusivamente por stage_changed_at", () => {
    const card = read("src/components/closer/PipelineCard.tsx");
    const start = card.indexOf("function daysInStage");
    const daysFunction = card.slice(start, card.indexOf("\n}\n\nexport function PipelineCard", start) + 2);
    expect(daysFunction).toContain("lead.stage_changed_at");
    expect(daysFunction).not.toContain("data_proximo_passo");
    expect(daysFunction).not.toContain("created_at");
  });

  it("tipa a chave de leads por CNPJ e omite campos controlados do update", () => {
    const types = read("src/integrations/supabase/types.ts");
    const rowType = types.slice(types.indexOf("export type LeadDatabaseRow"), types.indexOf("export type LeadDatabaseInsert"));
    expect(rowType).toContain("cnpj: string");
    expect(rowType).not.toMatch(/^\s+(id|owner_id|sdr_id|valor_negocio_estimado|dia_cadencia|canal_preferido):/m);
    expect(types).toContain('Partial<Omit<LeadDatabaseRow, "cnpj" | ServerControlledLeadField>>');
  });
});
