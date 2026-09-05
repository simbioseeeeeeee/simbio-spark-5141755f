import { supabase } from "@/integrations/supabase/client";

// Fila de trabalho do dia da SDR (tabela sales_tasks).
//
// Existe porque a cadência antiga (get_cadencia_hoje) exige pesquisa_realizada,
// lead_score > 50 e status_cadencia='ativo' ao mesmo tempo — e nenhum lead novo
// atende os três. O painel ficava vazio mesmo com dezenas de leads quentes
// esperando. Aqui a fila é montada por sdr_gerar_tarefas_hoje(), que trabalha
// com critérios explícitos por tipo de tarefa.

export type TaskType = "pesquisar" | "ligar" | "followup" | "reuniao";

export type SdrTask = {
  id: string;
  lead_cnpj: string;
  task_type: TaskType;
  titulo: string | null;
  prioridade: number;
  status: "pendente" | "concluida" | "cancelada";
  due_at: string | null;
  // vem do join com leads
  fantasia?: string | null;
  contato_nome?: string | null;
  cidade?: string | null;
  uf?: string | null;
  celular1?: string | null;
  telefone1?: string | null;
  status_sdr?: string | null;
  origem_lead?: string | null;
};

/** Gera as tarefas do dia (idempotente: não duplica o que já está pendente). */
export async function gerarTarefasHoje(responsavel?: string) {
  const { data, error } = await (supabase as any).rpc("sdr_gerar_tarefas_hoje", {
    p_responsavel: responsavel ?? null,
  });
  if (error) throw error;
  return (data || []) as { task_type: TaskType; criadas: number }[];
}

export async function listarTarefasPendentes(): Promise<SdrTask[]> {
  const { data, error } = await (supabase as any)
    .from("sales_tasks")
    .select(
      "id, lead_cnpj, task_type, titulo, prioridade, status, due_at, " +
        "leads!inner(fantasia, contato_nome, cidade, uf, celular1, telefone1, status_sdr, origem_lead)",
    )
    .eq("status", "pendente")
    .order("prioridade", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(400); // a fila real já passou de 120 — cortar em silêncio escondia tarefa
  if (error) throw error;
  return (data || []).map((r: any) => ({
    ...r,
    fantasia: r.leads?.fantasia ?? null,
    contato_nome: r.leads?.contato_nome ?? null,
    cidade: r.leads?.cidade ?? null,
    uf: r.leads?.uf ?? null,
    celular1: r.leads?.celular1 ?? null,
    telefone1: r.leads?.telefone1 ?? null,
    status_sdr: r.leads?.status_sdr ?? null,
    origem_lead: r.leads?.origem_lead ?? null,
  })) as SdrTask[];
}

/**
 * Conclui a tarefa. Concluir uma "pesquisar" marca pesquisa_realizada no lead —
 * é o que faz o lead entrar na fila de ligação (e na cadência da Larissa).
 */
export async function concluirTarefa(task: SdrTask, quem?: string) {
  const { error } = await (supabase as any)
    .from("sales_tasks")
    .update({ status: "concluida", completed_at: new Date().toISOString(), completed_by: quem ?? null })
    .eq("id", task.id);
  if (error) throw error;

  if (task.task_type === "pesquisar") {
    const { error: e2 } = await (supabase as any)
      .from("leads")
      .update({ pesquisa_realizada: true })
      .eq("cnpj", task.lead_cnpj);
    if (e2) throw e2;
  }
}

export async function cancelarTarefa(taskId: string) {
  const { error } = await (supabase as any)
    .from("sales_tasks")
    .update({ status: "cancelada", completed_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) throw error;
}
