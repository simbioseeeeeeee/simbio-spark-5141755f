import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  concluirTarefa,
  gerarTarefasHoje,
  listarTarefasPendentes,
  type SdrTask,
  type TaskType,
} from "@/store/sdr-tasks-store";
import { ligarParaLead } from "@/lib/api";
import {
  CheckCircle2,
  Loader2,
  MessageSquare,
  PhoneCall,
  RefreshCw,
  Search,
  Clock,
} from "lucide-react";

const SECOES: { tipo: TaskType; titulo: string; ajuda: string; icone: any }[] = [
  {
    tipo: "pesquisar",
    titulo: "Pesquisar",
    ajuda: "Abrir site, Instagram e anúncios antes de falar. Concluir libera o lead para ligação.",
    icone: Search,
  },
  {
    tipo: "ligar",
    titulo: "Ligar",
    ajuda: "Já pesquisado e sem próximo passo agendado.",
    icone: PhoneCall,
  },
  {
    tipo: "followup",
    titulo: "Follow-up",
    ajuda: "Conversa começada cujo prazo combinado venceu.",
    icone: Clock,
  },
];

function waUrl(task: SdrTask) {
  const num = (task.celular1 || task.telefone1 || "").replace(/\D/g, "");
  return num ? `https://wa.me/${num.startsWith("55") ? num : "55" + num}` : "#";
}

export function TarefasDoDia({ onAbrirLead }: { onAbrirLead?: (cnpj: string) => void }) {
  const { user } = useAuth();
  const [tarefas, setTarefas] = useState<SdrTask[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async (gerar: boolean) => {
    setCarregando(true);
    try {
      if (gerar) await gerarTarefasHoje(user?.email ?? undefined);
      setTarefas(await listarTarefasPendentes());
    } catch (e: any) {
      toast({ title: "Não consegui montar a fila", description: e?.message, variant: "destructive" });
    } finally {
      setCarregando(false);
    }
  }, [user?.email]);

  useEffect(() => {
    // Gera uma vez por dia por navegador; nas demais aberturas só lê a fila.
    const hoje = new Date().toISOString().slice(0, 10);
    const marca = localStorage.getItem("sdr_tarefas_geradas_em");
    const precisaGerar = marca !== hoje;
    if (precisaGerar) localStorage.setItem("sdr_tarefas_geradas_em", hoje);
    carregar(precisaGerar);
  }, [carregar]);

  async function concluir(task: SdrTask) {
    setOcupado(task.id);
    try {
      await concluirTarefa(task, user?.email ?? undefined);
      setTarefas((atual) => atual.filter((t) => t.id !== task.id));
      toast({
        title: "Feito",
        description:
          task.task_type === "pesquisar"
            ? "Pesquisa registrada — o lead entrou na fila de ligação."
            : "Tarefa concluída.",
      });
    } catch (e: any) {
      toast({ title: "Não consegui concluir", description: e?.message, variant: "destructive" });
    } finally {
      setOcupado(null);
    }
  }

  async function ligar(task: SdrTask) {
    setOcupado(task.id);
    try {
      await ligarParaLead(task.lead_cnpj);
      toast({ title: "Ligação disparada", description: "A Larissa está ligando agora." });
    } catch (e: any) {
      toast({ title: "Não consegui ligar", description: e?.message, variant: "destructive" });
    } finally {
      setOcupado(null);
    }
  }

  const total = tarefas.length;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold">Minhas tarefas de hoje</h2>
          <p className="text-xs text-muted-foreground">
            {carregando ? "montando a fila…" : total === 0 ? "nada pendente — fila zerada" : `${total} pendentes`}
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => carregar(true)} disabled={carregando}>
          {carregando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar fila
        </Button>
      </div>

      <div className="divide-y divide-border">
        {SECOES.map(({ tipo, titulo, ajuda, icone: Icone }) => {
          const doTipo = tarefas.filter((t) => t.task_type === tipo);
          if (!doTipo.length) return null;
          return (
            <div key={tipo} className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icone className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{titulo}</span>
                <span className="text-xs text-muted-foreground">({doTipo.length})</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{ajuda}</p>

              <div className="space-y-2">
                {doTipo.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2">
                    <button
                      className="flex-1 text-left min-w-0"
                      onClick={() => onAbrirLead?.(t.lead_cnpj)}
                      title="Abrir ficha do lead"
                    >
                      <div className="text-sm truncate">
                        {t.fantasia || t.contato_nome || t.lead_cnpj}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[t.contato_nome, [t.cidade, t.uf].filter(Boolean).join("/"), t.status_sdr]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </button>

                    {tipo !== "pesquisar" && (
                      <>
                        <Button size="sm" variant="ghost" className="h-8 px-2" disabled={ocupado === t.id}
                                onClick={() => ligar(t)} title="Larissa liga agora">
                          {ocupado === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneCall className="h-3.5 w-3.5" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 px-2" asChild title="Abrir WhatsApp">
                          <a href={waUrl(t)} target="_blank" rel="noreferrer">
                            <MessageSquare className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </>
                    )}

                    <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={ocupado === t.id}
                            onClick={() => concluir(t)}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Concluir
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {!carregando && total === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Fila zerada. Novos leads geram tarefas automaticamente — ou clique em “Atualizar fila”.
          </div>
        )}
      </div>
    </div>
  );
}
