import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { BookOpen, AlertTriangle, Ban, Pencil, Check, X } from "lucide-react";
import {
  listarObjecoes, salvarObjecao, statsObjecoes, listarConfig,
  CATEGORIA_LABEL, ROTEIRO_BLOCOS, NUNCA_ENTRA,
  type Objecao, type ObjecaoStats, type PlaybookConfigItem, type CategoriaObjecao,
} from "@/store/playbook-store";

// Playbook comercial — matriz de objeções (brief Vinicius) + o que realimenta o
// passo 4 do framework: frequência, taxa de superação e objeções dos perdidos.

const ORDEM: CategoriaObjecao[] = [
  "CAPACIDADE", "COMPREENSAO", "RISCO", "DECISOR", "PRECO", "TIMING", "MERCADO", "CONCORRENCIA",
];

const CONFIG_LABEL: Record<string, string> = {
  vgv_corte: "Critério de corte de VGV",
  politica_desconto: "Política de desconto",
  janela_exclusividade: "Janela de exclusividade padrão",
  claims_aprovados: "Claims aprovados com fonte",
  cases_autorizados: "Autorização de uso de case",
  case_por_perfil: "Um case por perfil",
};

export default function Playbook() {
  const [loading, setLoading] = useState(true);
  const [objecoes, setObjecoes] = useState<Objecao[]>([]);
  const [stats, setStats] = useState<ObjecaoStats[]>([]);
  const [config, setConfig] = useState<PlaybookConfigItem[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ resposta: string; nao_fazer: string }>({ resposta: "", nao_fazer: "" });

  const load = useCallback(async () => {
    try {
      const [o, s, c] = await Promise.all([listarObjecoes(), statsObjecoes(), listarConfig()]);
      setObjecoes(o); setStats(s); setConfig(c);
    } catch (e: any) {
      toast({ title: "Erro ao carregar o playbook", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const statPor = useMemo(() => new Map(stats.map((s) => [s.id, s])), [stats]);
  const pendentes = config.filter((c) => !c.definido);

  async function salvarEdicao(o: Objecao) {
    try {
      await salvarObjecao({ id: o.id, resposta: draft.resposta, nao_fazer: draft.nao_fazer });
      setEditando(null);
      load();
    } catch (e: any) {
      toast({ title: "Não salvou", description: e?.message, variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <AppLayout><div className="space-y-4 p-6">
        <Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" />
      </div></AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Playbook comercial</h1>
          <span className="text-xs text-muted-foreground">matriz de objeções · roteiro · regras</span>
        </div>

        {pendentes.length > 0 && (
          <Card className="border-amber-400/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Pendente da liderança — o playbook não inventa estes valores
              </div>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {pendentes.map((p) => (
                  <li key={p.chave}><b className="text-foreground">{CONFIG_LABEL[p.chave] || p.chave}:</b> {p.nota}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* stats — realimenta o passo 4 */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">O que as reuniões estão mostrando</CardTitle></CardHeader>
          <CardContent>
            {stats.every((s) => s.frequencia === 0) ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma objeção registrada ainda. Marque-as no card do lead (aba Reunião) — é isso que
                alimenta este painel e revisa o roteiro.
              </p>
            ) : (
              <div className="space-y-1.5 text-sm">
                {stats.filter((s) => s.frequencia > 0)
                  .sort((a, b) => b.frequencia - a.frequencia)
                  .map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3">
                      <span className="truncate">{s.id} · {s.titulo}</span>
                      <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                        {s.frequencia}× · superada {s.taxa_superacao === null ? "—" : `${Math.round(Number(s.taxa_superacao) * 100)}%`}
                        {s.em_perdidos > 0 && <b className="text-red-600"> · {s.em_perdidos} em perdidos</b>}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* matriz */}
        {ORDEM.map((cat) => {
          const grupo = objecoes.filter((o) => o.categoria === cat);
          if (!grupo.length) return null;
          return (
            <Card key={cat}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{CATEGORIA_LABEL[cat]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {grupo.map((o) => {
                  const st = statPor.get(o.id);
                  const emEdicao = editando === o.id;
                  return (
                    <div key={o.id} className={`rounded-lg border p-3 ${o.desqualifica ? "border-red-400/60" : ""}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="text-sm">{o.id} · {o.titulo}</b>
                        {o.desqualifica && (
                          <Badge variant="destructive" className="text-[10px]"><Ban className="mr-1 h-3 w-3" />desqualifica</Badge>
                        )}
                        {st && st.frequencia > 0 && (
                          <span className="text-xs text-muted-foreground">{st.frequencia}× registrada</span>
                        )}
                        <Button size="sm" variant="ghost" className="ml-auto h-7 px-2"
                          onClick={() => {
                            if (emEdicao) { setEditando(null); return; }
                            setEditando(o.id);
                            setDraft({ resposta: o.resposta, nao_fazer: o.nao_fazer || "" });
                          }}>
                          {emEdicao ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                      {o.gatilhos.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          gatilhos: {o.gatilhos.map((g) => `"${g}"`).join(" · ")}
                        </p>
                      )}
                      {o.leitura && <p className="mt-2 text-xs"><b>Leitura:</b> {o.leitura}</p>}
                      {emEdicao ? (
                        <div className="mt-2 space-y-2">
                          <Textarea rows={3} value={draft.resposta}
                            onChange={(e) => setDraft({ ...draft, resposta: e.target.value })} />
                          <Textarea rows={2} value={draft.nao_fazer} placeholder="não fazer…"
                            onChange={(e) => setDraft({ ...draft, nao_fazer: e.target.value })} />
                          <Button size="sm" onClick={() => salvarEdicao(o)}>
                            <Check className="mr-1 h-3.5 w-3.5" />salvar
                          </Button>
                        </div>
                      ) : (
                        <>
                          <p className="mt-1 text-sm"><b>Como tratar:</b> {o.resposta}</p>
                          {o.nao_fazer && (
                            <p className="mt-1 text-xs text-red-600"><b>Não fazer:</b> {o.nao_fazer}</p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}

        {/* roteiro */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Roteiro da reunião (45 min)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {ROTEIRO_BLOCOS.map((b) => (
                <div key={b.bloco} className="flex gap-3">
                  <span className="w-44 shrink-0 font-medium">{b.bloco}{b.min && <span className="text-xs text-muted-foreground"> · {b.min} min</span>}</span>
                  <span className="text-muted-foreground">{b.oQue}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 rounded-md border border-red-400/40 bg-red-500/5 p-2 text-xs">
              <b>O que nunca entra:</b> {NUNCA_ENTRA}
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
