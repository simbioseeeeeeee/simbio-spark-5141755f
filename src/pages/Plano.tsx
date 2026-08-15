import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { ListChecks, Circle, PlayCircle, CheckCircle2, Ban, Filter } from "lucide-react";

// Backlog do sprint comercial. É a FONTE DE VERDADE do que está sendo executado —
// o mapa (artifact) é a leitura para quem não opera. Estado compartilhado de propósito:
// Guilherme, Paulo, Rayana e Claude mexem no mesmo lugar.

type Status = "nao_iniciado" | "em_andamento" | "concluido" | "bloqueado";

type Tarefa = {
  id: number;
  codigo: string;
  prioridade: string;
  frente: string;
  titulo: string;
  detalhe: string | null;
  trava: string | null;
  dono: string;
  status: Status;
  nota: string | null;
  semana: number;
  ordem: number;
  concluido_em: string | null;
  atualizado_em: string | null;
};

const STATUS: { key: Status; label: string; icon: React.ElementType; cls: string }[] = [
  { key: "nao_iniciado", label: "não começou", icon: Circle, cls: "text-muted-foreground" },
  { key: "em_andamento", label: "fazendo", icon: PlayCircle, cls: "text-amber-500" },
  { key: "concluido", label: "concluído", icon: CheckCircle2, cls: "text-green-500" },
  { key: "bloqueado", label: "travado", icon: Ban, cls: "text-destructive" },
];

const PRIO_CLS: Record<string, string> = {
  P0: "border-destructive text-destructive",
  P1: "border-amber-500 text-amber-500",
  P2: "border-primary text-primary",
  P3: "border-muted-foreground text-muted-foreground",
};

const DONO_LABEL: Record<string, string> = {
  guilherme: "Guilherme", paulo: "Paulo", rayana: "Rayana", claude: "Claude",
};

export default function Plano() {
  const [loading, setLoading] = useState(true);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [filtroDono, setFiltroDono] = useState<string | null>(null);
  const [ocultarFeitas, setOcultarFeitas] = useState(false);
  const [editandoNota, setEditandoNota] = useState<number | null>(null);
  const [salvando, setSalvando] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("plano_tarefas" as any)
      .select("*")
      .order("ordem", { ascending: true });
    setTarefas(((data as any[]) || []) as Tarefa[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // quem estiver com a tela aberta vê a marcação do outro
    const ch = supabase
      .channel("plano-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "plano_tarefas" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  async function mudarStatus(t: Tarefa, novo: Status) {
    setSalvando(t.id);
    setTarefas((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: novo } : x)));
    await supabase.from("plano_tarefas" as any).update({ status: novo }).eq("id", t.id);
    setSalvando(null);
  }

  async function salvarNota(t: Tarefa, nota: string) {
    setTarefas((prev) => prev.map((x) => (x.id === t.id ? { ...x, nota } : x)));
    setEditandoNota(null);
    await supabase.from("plano_tarefas" as any).update({ nota: nota || null }).eq("id", t.id);
  }

  const visiveis = useMemo(() => {
    let v = tarefas;
    if (filtroDono) v = v.filter((t) => t.dono === filtroDono);
    if (ocultarFeitas) v = v.filter((t) => t.status !== "concluido");
    return v;
  }, [tarefas, filtroDono, ocultarFeitas]);

  const cont = useMemo(() => {
    const c: Record<string, number> = { nao_iniciado: 0, em_andamento: 0, concluido: 0, bloqueado: 0 };
    for (const t of tarefas) c[t.status] = (c[t.status] || 0) + 1;
    return c;
  }, [tarefas]);

  const pct = tarefas.length ? Math.round((cont.concluido / tarefas.length) * 100) : 0;
  const porPrioridade = useMemo(() => {
    const g: Record<string, Tarefa[]> = {};
    for (const t of visiveis) (g[t.prioridade] ||= []).push(t);
    return g;
  }, [visiveis]);

  if (loading) {
    return <AppLayout><div className="space-y-4 p-6"><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        {/* progresso */}
        <Card>
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <div className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-primary" />
                <span className="font-semibold">Plano do sprint</span>
                <span className="text-xs text-muted-foreground">11–31/08 · 5 vendas</span>
              </div>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold tabular-nums leading-none">{cont.concluido}</span>
                <span className="pb-0.5 text-muted-foreground">/ {tarefas.length} concluídas</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {STATUS.map(({ key, label, icon: Icon, cls }) => (
                  <span key={key} className={`flex items-center gap-1.5 text-xs ${cls}`}>
                    <Icon className="h-3.5 w-3.5" />
                    <b className="tabular-nums">{cont[key] || 0}</b> {label}
                  </span>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                {["guilherme", "paulo", "rayana", "claude"].map((d) => (
                  <button key={d} onClick={() => setFiltroDono(filtroDono === d ? null : d)}
                    className={`border px-2 py-1 text-xs transition-colors ${
                      filtroDono === d ? "border-primary bg-primary/10" : "text-muted-foreground hover:bg-muted/50"}`}>
                    {DONO_LABEL[d]}
                  </button>
                ))}
                <button onClick={() => setOcultarFeitas((v) => !v)}
                  className={`border px-2 py-1 text-xs ${ocultarFeitas ? "border-primary bg-primary/10" : "text-muted-foreground hover:bg-muted/50"}`}>
                  {ocultarFeitas ? "ocultando feitas" : "mostrando tudo"}
                </button>
              </div>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded bg-muted">
              <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </CardContent>
        </Card>

        {/* tarefas por prioridade */}
        {["P0", "P1", "P2", "P3"].filter((p) => porPrioridade[p]?.length).map((p) => (
          <div key={p} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`border px-2 py-0.5 text-xs font-mono ${PRIO_CLS[p]}`}>{p}</span>
              <span className="text-sm text-muted-foreground">
                {p === "P0" ? "destrava tudo — sai primeiro"
                  : p === "P1" ? "depende do P0"
                  : p === "P2" ? "depende de criativo pronto" : "depois"}
              </span>
            </div>
            <div className="divide-y rounded-lg border">
              {porPrioridade[p].map((t) => {
                const st = STATUS.find((s) => s.key === t.status)!;
                return (
                  <div key={t.id} className={`p-3 ${t.status === "concluido" ? "opacity-55" : ""}`}>
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{t.codigo}</span>
                          <span className={`font-medium ${t.status === "concluido" ? "line-through" : ""}`}>
                            {t.titulo}
                          </span>
                          <Badge variant="outline" className="text-[10px]">{t.frente}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{DONO_LABEL[t.dono] || t.dono}</Badge>
                        </div>
                        {t.detalhe && <p className="mt-0.5 text-xs text-muted-foreground">{t.detalhe}</p>}
                        {t.trava && t.trava !== "—" && t.status !== "concluido" && (
                          <p className="mt-0.5 text-xs text-amber-600">trava: {t.trava}</p>
                        )}
                        {editandoNota === t.id ? (
                          <Input autoFocus defaultValue={t.nota || ""} className="mt-1.5 h-8 text-xs"
                            placeholder="o que mudou hoje?"
                            onBlur={(e) => salvarNota(t, e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && salvarNota(t, (e.target as HTMLInputElement).value)} />
                        ) : (
                          <button onClick={() => setEditandoNota(t.id)}
                            className="mt-1 text-left text-xs text-muted-foreground hover:text-foreground">
                            {t.nota ? `“${t.nota}”` : "+ anotar"}
                          </button>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        {STATUS.map(({ key, label, icon: Icon, cls }) => (
                          <button key={key} disabled={salvando === t.id}
                            onClick={() => mudarStatus(t, key)}
                            title={label}
                            className={`flex items-center gap-1 border px-2 py-1 text-xs transition-colors ${
                              t.status === key ? `border-current ${cls} bg-muted/40` : "text-muted-foreground hover:bg-muted/50"}`}>
                            <Icon className="h-3 w-3" />
                            <span className="hidden sm:inline">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
