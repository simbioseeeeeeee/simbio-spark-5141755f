import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260817090000_comercial_v2_crm.sql"),
  "utf8",
);

describe("migration comercial V2 contra o schema live", () => {
  it("usa CNPJ e responsáveis textuais, sem as colunas UUID inexistentes em leads", () => {
    expect(sql).not.toMatch(/NEW\.id|target_lead\.id|lead_record\.id/);
    expect(sql).not.toMatch(/REFERENCES\s+public\.leads\(id\)/i);
    expect(sql).toContain("lead_cnpj text NOT NULL");
    expect(sql).toContain("NEW.responsavel_closer");
    expect(sql).toContain("NEW.responsavel_sdr");
  });

  it("preserva e sinaliza os valores legados conhecidos", () => {
    expect(sql).toContain("WHERE status_sdr = 'Cliente Ativo'");
    expect(sql).toContain("estagio_funil = 'Fechado Ganho'");
    expect(sql).toContain("WHERE status_sdr = 'Arquivo Morto'");
    expect(sql).toContain("'Legado: ' || motivo_perda");
    expect(sql).toContain("pipeline_review_required = true");
  });

  it("mantém aceite e pagamento somente leitura fora do webhook", () => {
    expect(sql).toContain("guard_commercial_confirmation_v2");
    expect(sql).toContain("guard_fechamento_confirmation_v2");
    expect(sql).toContain("COALESCE(auth.role(), '') <> 'service_role'");
    expect(sql).toContain("Transição de pagamento não monotônica");
    expect(sql).toContain("Evidência de pagamento é imutável");
    expect(sql).toContain("trg_guard_commercial_confirmation_insert_v2");
  });

  it("preserva escopo como text[] e dá precedência ao opt-out global", () => {
    expect(sql).toContain("escopo text[] NOT NULL DEFAULT '{}'");
    expect(sql).toContain("COALESCE(cardinality(NEW.escopo), 0) = 0");
    expect(sql).not.toContain("ADD COLUMN IF NOT EXISTS escopo text");
    expect(sql).toContain("allowed := NEW.status_sdr = 'Opt-out' OR CASE");
  });

  it("grava avaliação, objeções e estágio pela mesma RPC", () => {
    expect(sql).toContain("save_meeting_assessment_v2");
    expect(sql).toContain("SET avaliacao_id = assessment_id");
    expect(sql).toContain("estagio_funil = target_stage");
    expect(sql).toContain("Avaliação deve usar o event_id atual do lead");
    expect(sql).toContain("v_fit_score := v_fit_icp + v_fit_dor_impacto");
    expect(sql).toContain("v_execution_score := v_exec_diagnostico + v_exec_escuta");
    expect(sql).not.toContain("SET fit_score = COALESCE((p_assessment->>'fit_score')::integer, 0)");
  });

  it("migra o check legado de fechamentos para o status V2", () => {
    expect(sql).toContain("t.relname = 'fechamentos'");
    expect(sql).toContain("pg_get_constraintdef(c.oid) ~* '\\mstatus\\M'");
    expect(sql).toContain("ALTER TABLE public.fechamentos ALTER COLUMN status SET DEFAULT 'rascunho'");
    expect(sql).toContain("fechamentos_status_v2_check");
    expect(sql).toContain("'rascunho', 'proposta_enviada', 'aceito', 'pago', 'vencido', 'cancelado'");
  });

  it("protege tarefas comerciais com RLS e sem acesso anônimo", () => {
    expect(sql).toContain("ALTER TABLE public.sales_tasks ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON TABLE public.sales_tasks FROM anon");
    expect(sql).toContain('CREATE POLICY "Authenticated read sales tasks"');
    expect(sql).toContain('CREATE POLICY "Service role manages sales tasks"');
  });

  it("torna a evidência da agenda somente leitura e completa", () => {
    expect(sql).toContain("guard_meeting_evidence_v2");
    expect(sql).toContain("BEFORE UPDATE OF meeting_event_id, data_reuniao_agendada, reuniao_url");
    expect(sql).toContain("Agenda é somente leitura e deve vir do Calendar/Meet");
    expect(sql).toContain("Evidência da reunião exige event_id, data, horário e link");
    expect(sql).toContain("trg_guard_meeting_evidence_insert_v2");
  });

  it("sincroniza pagamento e etapa em um único update e aceita pagamento antecipado", () => {
    expect(sql).toContain("effective_aceite_em := COALESCE(target_lead.aceite_em, NEW.aceite_em)");
    expect(sql).toContain("WHEN NEW.payment_status = 'pago'");
    expect(sql).toContain("THEN 'Fechado Ganho'");
    expect(sql).toContain("OLD.estagio_funil IN ('Proposta Enviada', 'Em Negociação', 'Aguardando Aceite', 'Aguardando Pagamento')");
  });

  it("recria consumidores do funil com o vocabulário V2", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_cadencia_hoje");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_cadencia_amanha");
    expect(sql).toContain("CREATE OR REPLACE VIEW public.prospeccao_fila");
    expect(sql).toContain("CREATE OR REPLACE VIEW public.comercial_painel_dia");
    expect(sql).toContain("CREATE OR REPLACE VIEW public.vw_simbiose_funil_diario");
    expect(sql).toContain("l.estagio_funil = 'Diagnóstico Realizado'");
    expect(sql).toContain("'Reunião Agendada', 'Nurturing', 'Desqualificado', 'Opt-out'");
  });

  it("registra o timestamp real de cada mudança de etapa", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz");
    expect(sql).toContain("SET stage_changed_at = COALESCE(stage_changed_at, updated_at, created_at, now())");
    expect(sql).toContain("NEW.stage_changed_at := now()");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.initialize_sales_stage_v2");
    expect(sql).toContain("Novos leads entram no funil do closer por Reunião Agendada");
  });

  it("não usa pesquisa digital como qualificação ou prioridade da cadência", () => {
    const cadence = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.get_cadencia_hoje"),
      sql.indexOf("DROP FUNCTION IF EXISTS public.get_reuniao_inconsistencies"),
    );
    const analytics = sql.slice(
      sql.indexOf("DROP FUNCTION IF EXISTS public.get_manager_analytics"),
      sql.indexOf("COMMENT ON COLUMN public.leads.playbook_version"),
    );
    expect(cadence).not.toContain("lead_score");
    expect(analytics).toContain("fit_score >= 70");
    expect(analytics).not.toContain("lead_score");
    expect(analytics).toContain("l.cnpj = a.lead_cnpj");
  });

  it("preserva a ordem pública das colunas das views live", () => {
    const prospeccao = sql.slice(sql.indexOf("CREATE OR REPLACE VIEW public.prospeccao_fila"), sql.indexOf("CREATE OR REPLACE FUNCTION public.canal_maquina"));
    expect(prospeccao).toMatch(/SELECT\s+n\.cnpj,\s+n\.fantasia,\s+COALESCE[\s\S]*?AS contato_nome,\s+n\.cidade,\s+n\.uf,\s+n\.status_sdr,\s+n\.porte_equipe,\s+n\.email1,\s+n\.telefone_e164,/);

    const painel = sql.slice(sql.indexOf("CREATE OR REPLACE VIEW public.comercial_painel_dia"), sql.indexOf("CREATE OR REPLACE VIEW public.vw_simbiose_funil_diario"));
    expect(painel).toMatch(/SELECT\s+COALESCE\(ag\.dia, re\.dia\) AS dia,\s+COALESCE\(ag\.canal, re\.canal\) AS canal,\s+COALESCE\(ag\.reunioes_agendadas, 0\) AS reunioes_agendadas,\s+COALESCE\(re\.reunioes_realizadas, 0\) AS reunioes_realizadas/);
  });

  it("não duplica colunas ou validações dentro do mesmo objeto SQL", () => {
    const assessmentAlter = sql.slice(
      sql.indexOf("ALTER TABLE public.reunioes_avaliacao"),
      sql.indexOf("DROP INDEX IF EXISTS public.idx_reunioes_avaliacao_event"),
    );
    expect(assessmentAlter.match(/ADD COLUMN IF NOT EXISTS fit_score integer/g) || []).toHaveLength(1);

    const meetingGuard = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.guard_meeting_evidence_v2"),
      sql.indexOf("DROP TRIGGER IF EXISTS trg_guard_meeting_evidence_v2"),
    );
    expect(meetingGuard.match(/RAISE EXCEPTION 'Evidência da reunião exige event_id, data, horário e link'/g) || [])
      .toHaveLength(1);

    const stageGuard = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.validate_sales_stage_v2"),
      sql.indexOf("DROP TRIGGER IF EXISTS trg_validate_sales_stage_v2"),
    );
    expect(stageGuard.match(/No-show permite uma única tentativa de reagendamento/g) || []).toHaveLength(1);

    const termsGuard = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.validate_fechamento_terms_v2"),
      sql.indexOf("DROP TRIGGER IF EXISTS trg_validate_fechamento_terms_v2"),
    );
    expect(termsGuard.match(/COALESCE\(cardinality\(NEW\.escopo\), 0\) = 0/g) || []).toHaveLength(1);

    const inconsistenciesSignature = sql.slice(
      sql.indexOf("CREATE FUNCTION public.get_reuniao_inconsistencies"),
      sql.indexOf("LANGUAGE sql", sql.indexOf("CREATE FUNCTION public.get_reuniao_inconsistencies")),
    );
    expect(inconsistenciesSignature.match(/^\s+cnpj text,/gm) || []).toHaveLength(1);
  });
});
