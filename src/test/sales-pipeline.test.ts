import { describe, expect, it } from "vitest";
import {
  calculateExecutionScore,
  calculateFitScore,
  validateSdrTransition,
  validatePipelineTransition,
} from "@/lib/sales-pipeline";
import type { Lead } from "@/types/lead";

const lead = (patch: Partial<Lead> = {}) => ({
  estagio_funil: "Reunião Agendada",
  meeting_event_id: "gcal_event_123",
  data_reuniao_agendada: "2030-08-18T14:00:00.000Z",
  reuniao_url: "https://meet.google.com/abc-defg-hij",
  data_proximo_passo: "2026-08-18T14:00:00.000Z",
  motivo_perda: null,
  motivo_perda_detalhe: null,
  payment_status: "nao_iniciado",
  ganho_override_em: null,
  ganho_override_motivo: null,
  oferta_comercial: null,
  decisor_confirmado: false,
  no_show_reagenda_tentativas: 0,
  aceite_em: null,
  ...patch,
}) as Lead;

describe("pipeline comercial V2", () => {
  it("impede pular a qualificação SDR", () => {
    expect(validateSdrTransition("A Contatar", "Qualificado").ok).toBe(false);
  });

  it("permite opt-out global a partir de qualquer status, inclusive terminal", () => {
    expect(validateSdrTransition("Desqualificado", "Opt-out")).toEqual({ ok: true });
    expect(validateSdrTransition("Reunião Agendada", "Opt-out")).toEqual({ ok: true });
    expect(validateSdrTransition("Opt-out", "Opt-out")).toEqual({ ok: true });
  });

  it("exige evento real também na passagem SDR para reunião", () => {
    expect(validateSdrTransition("Qualificado", "Reunião Agendada").ok).toBe(false);
    expect(validateSdrTransition(
      "Qualificado",
      "Reunião Agendada",
      "gcal_123",
      "2030-08-18T14:00:00Z",
      "https://meet.google.com/abc-defg-hij",
    )).toEqual({ ok: true });
  });

  it("bloqueia reunião sem event_id real", () => {
    const result = validatePipelineTransition(
      lead({ estagio_funil: null, meeting_event_id: null }),
      "Reunião Agendada",
    );
    expect(result).toEqual({ ok: false, reason: "Reunião Agendada exige um event_id real da agenda." });
  });

  it("aceita entrada no closer quando a reunião possui event_id", () => {
    expect(validatePipelineTransition(
      lead({ estagio_funil: null, meeting_event_id: null }),
      "Reunião Agendada",
      {
        eventId: "gcal_event_456",
        meetingAt: "2030-08-18T14:00:00Z",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
      },
    )).toEqual({ ok: true });
  });

  it("bloqueia salto de Reunião Agendada para Proposta Enviada", () => {
    const result = validatePipelineTransition(lead(), "Proposta Enviada", {
      offer: "Operação",
    });
    expect(result.ok).toBe(false);
  });

  it("limita no-show a uma tentativa de reagendamento", () => {
    const result = validatePipelineTransition(
      lead({ estagio_funil: "No-show", no_show_reagenda_tentativas: 1 }),
      "Reunião Agendada",
    );
    expect(result.ok).toBe(false);
  });

  it("exige próximo passo nas etapas comerciais ativas", () => {
    const result = validatePipelineTransition(
      lead({ data_proximo_passo: null }),
      "Diagnóstico Realizado",
    );
    expect(result.ok).toBe(false);
  });

  it("exige oferta canônica ao enviar proposta", () => {
    const result = validatePipelineTransition(
      lead({ estagio_funil: "Diagnóstico Realizado" }),
      "Proposta Enviada",
    );
    expect(result.ok).toBe(false);
  });

  it("não permite proposta sem decisor confirmado", () => {
    const result = validatePipelineTransition(
      lead({ estagio_funil: "Diagnóstico Realizado", oferta_comercial: "Operação" }),
      "Proposta Enviada",
    );
    expect(result).toEqual({ ok: false, reason: "Proposta Enviada exige decisor confirmado." });
  });

  it("separa aceite de pagamento", () => {
    const result = validatePipelineTransition(
      lead({ estagio_funil: "Aguardando Aceite" }),
      "Aguardando Pagamento",
    );
    expect(result).toEqual({ ok: false, reason: "Aguardando Pagamento exige aceite confirmado." });
  });

  it("bloqueia ganho sem pagamento", () => {
    const result = validatePipelineTransition(
      lead({ estagio_funil: "Aguardando Pagamento", aceite_em: "2026-08-17T10:00:00Z" }),
      "Fechado Ganho",
    );
    expect(result.ok).toBe(false);
  });

  it("aceita ganho com pagamento confirmado", () => {
    const result = validatePipelineTransition(
      lead({ estagio_funil: "Aguardando Pagamento", aceite_em: "2026-08-17T10:00:00Z", payment_status: "pago" }),
      "Fechado Ganho",
    );
    expect(result).toEqual({ ok: true });
  });

  it("exige motivo estruturado na perda", () => {
    const result = validatePipelineTransition(
      lead({ estagio_funil: "Em Negociação" }),
      "Fechado Perdido",
    );
    expect(result.ok).toBe(false);
  });

  it("permite registrar perda diretamente na avaliação da reunião com motivo", () => {
    expect(validatePipelineTransition(
      lead({ estagio_funil: "Reunião Agendada" }),
      "Fechado Perdido",
      { lossReason: "sem_fit" },
    )).toEqual({ ok: true });
  });

  it("exige detalhe quando o motivo é Outro", () => {
    const result = validatePipelineTransition(
      lead({ estagio_funil: "Em Negociação" }),
      "Fechado Perdido",
      { lossReason: "outro" },
    );
    expect(result.ok).toBe(false);
  });
});

describe("scores separados", () => {
  it("calcula fit com os pesos 20/25/20/20/15 e limita entradas", () => {
    expect(calculateFitScore({
      icp: 20,
      dorImpacto: 25,
      processoCapacidade: 50,
      decisao: 20,
      timing: 15,
    })).toBe(100);
  });

  it("calcula execução sem duração, preço ou ausência de objeção", () => {
    expect(calculateExecutionScore({
      diagnostico: 20,
      escuta: 10,
      confirmacaoEntendimento: 10,
      solucaoLigadaDor: 10,
      transparenciaTermos: 10,
      proximoPassoDatado: 10,
    })).toBe(70);
  });
});
