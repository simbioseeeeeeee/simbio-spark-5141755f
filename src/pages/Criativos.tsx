import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Clapperboard, Check, X, Pencil, Play, Plus } from "lucide-react";

// Gate humano dos criativos. Antes era lista de link no chat; agora o Guilherme
// assiste aqui, aprova ou pede ajuste, e fica registrado quem aprovou e quando.
// Preview leve (~8 MB) hospedado no CDN — o arquivo final fica no Mac.

type Status = "aguardando" | "aprovado" | "ajustar" | "reprovado";

type Criativo = {
  id: number;
  peca: string;
  trilha: string;
  angulo: string;
  destino: string | null;
  preview_url: string | null;
  endcard: string | null;
  fala: string | null;
  duracao_seg: number | null;
  status: Status;
  nota: string | null;
  aprovado_em: string | null;
  no_ar: boolean;
};

const TRILHA_LABEL: Record<string, string> = {
  conversao: "conversão", objecao: "objeção", live: "live",
};

// 14/08: saiu o formulário "produzir peça nova". Ele gravava em criativos_pedidos,
// tabela com ZERO linhas e sem nenhum worker no servidor consumindo — a tela dizia
// "fica pronto em poucos minutos" e o pedido não chegava a lugar nenhum.
export default function Criativos() {
  const [loading, setLoading] = useState(true);
  const [itens, setItens] = useState<Criativo[]>([]);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<number | null>(null);
  const [editandoNota, setEditandoNota] = useState<number | null>(null);
  const [salvando, setSalvando] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("criativos" as any)
      .select("*")
      .order("peca", { ascending: true });
    setItens(((data as any[]) || []) as Criativo[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("criativos-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "criativos" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  async function decidir(c: Criativo, status: Status) {
    setSalvando(c.id);
    const anterior = c.status;
    setItens((prev) => prev.map((x) => (x.id === c.id ? { ...x, status } : x)));
    const { data: sess } = await supabase.auth.getUser();
    const { error } = await supabase.from("criativos" as any)
      // quem aprovou vem da sessão (era "guilherme" fixo, mentindo a autoria)
      .update({ status, aprovado_por: sess?.user?.email || "crm" })
      .eq("id", c.id);
    if (error) {
      setItens((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: anterior } : x)));
      toast({ title: "Não consegui salvar a decisão", description: error.message, variant: "destructive" });
    }
    setSalvando(null);
  }

  async function salvarNota(c: Criativo, nota: string) {
    const anterior = c.nota;
    setItens((prev) => prev.map((x) => (x.id === c.id ? { ...x, nota } : x)));
    setEditandoNota(null);
    const { error } = await supabase.from("criativos" as any)
      .update({ nota: nota || null }).eq("id", c.id);
    if (error) {
      setItens((prev) => prev.map((x) => (x.id === c.id ? { ...x, nota: anterior } : x)));
      toast({ title: "Não consegui salvar a nota", description: error.message, variant: "destructive" });
    }
  }


  const cont = useMemo(() => {
    const c: Record<string, number> = { aguardando: 0, aprovado: 0, ajustar: 0, reprovado: 0 };
    for (const i of itens) c[i.status] = (c[i.status] || 0) + 1;
    return c;
  }, [itens]);

  const visiveis = useMemo(
    () => (filtro ? itens.filter((i) => i.trilha === filtro || i.status === filtro) : itens),
    [itens, filtro],
  );

  if (loading) {
    return <AppLayout><div className="space-y-4 p-6"><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
            <div className="flex items-center gap-2">
              <Clapperboard className="h-5 w-5 text-primary" />
              <span className="font-semibold">Criativos</span>
              <span className="text-xs text-muted-foreground">lote agosto · gerados com IA</span>
            </div>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold tabular-nums leading-none text-green-500">{cont.aprovado}</span>
              <span className="pb-0.5 text-muted-foreground">/ {itens.length} aprovados</span>
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="text-muted-foreground">{cont.aguardando} aguardando</span>
              {cont.ajustar > 0 && <span className="text-amber-500">{cont.ajustar} pra ajustar</span>}
              {cont.reprovado > 0 && <span className="text-destructive">{cont.reprovado} reprovados</span>}
            </div>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {["conversao", "objecao", "live", "aguardando", "aprovado"].map((f) => (
                <button key={f} onClick={() => setFiltro(filtro === f ? null : f)}
                  className={`border px-2 py-1 text-xs transition-colors ${
                    filtro === f ? "border-primary bg-primary/10" : "text-muted-foreground hover:bg-muted/50"}`}>
                  {TRILHA_LABEL[f] || f}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visiveis.map((c) => (
            <Card key={c.id} className={
              c.status === "aprovado" ? "border-green-500/60"
                : c.status === "ajustar" ? "border-amber-500/60"
                : c.status === "reprovado" ? "border-destructive/60" : ""}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{c.peca}</span>
                  <span className="font-medium">{c.angulo}</span>
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    {TRILHA_LABEL[c.trilha] || c.trilha}
                  </Badge>
                </div>

                {/* player: só carrega o vídeo quando clica, pra não puxar 24 arquivos de uma vez */}
                {c.preview_url ? (
                  aberto === c.id ? (
                    <video src={c.preview_url} controls autoPlay playsInline
                      className="aspect-[9/16] w-full bg-black" />
                  ) : (
                    <button onClick={() => setAberto(c.id)}
                      className="flex aspect-[9/16] w-full items-center justify-center bg-muted/40 transition-colors hover:bg-muted/60">
                      <Play className="h-10 w-10 text-muted-foreground" />
                    </button>
                  )
                ) : (
                  <div className="flex aspect-[9/16] w-full items-center justify-center bg-muted/30 text-xs text-muted-foreground">
                    sem preview
                  </div>
                )}

                <div className="space-y-1 text-xs text-muted-foreground">
                  {c.endcard && <div><b className="text-foreground">endcard:</b> {c.endcard}</div>}
                  <div>
                    {c.duracao_seg ? `${c.duracao_seg}s` : ""}
                    {c.destino ? ` · ${c.destino}` : ""}
                  </div>
                </div>

                {editandoNota === c.id ? (
                  <Input autoFocus defaultValue={c.nota || ""} className="h-8 text-xs"
                    placeholder="o que ajustar?"
                    onBlur={(e) => salvarNota(c, e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && salvarNota(c, (e.target as HTMLInputElement).value)} />
                ) : (
                  <button onClick={() => setEditandoNota(c.id)}
                    className="text-left text-xs text-muted-foreground hover:text-foreground">
                    {c.nota ? `“${c.nota}”` : "+ anotar ajuste"}
                  </button>
                )}

                <div className="flex gap-1.5">
                  <Button size="sm" disabled={salvando === c.id}
                    variant={c.status === "aprovado" ? "default" : "outline"}
                    className={`flex-1 ${c.status === "aprovado" ? "bg-green-600 hover:bg-green-700" : ""}`}
                    onClick={() => decidir(c, "aprovado")}>
                    <Check className="mr-1 h-3.5 w-3.5" /> aprovar
                  </Button>
                  <Button size="sm" variant={c.status === "ajustar" ? "default" : "outline"}
                    disabled={salvando === c.id}
                    className={c.status === "ajustar" ? "bg-amber-600 hover:bg-amber-700" : ""}
                    onClick={() => decidir(c, "ajustar")}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant={c.status === "reprovado" ? "destructive" : "outline"}
                    disabled={salvando === c.id}
                    onClick={() => decidir(c, "reprovado")}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {visiveis.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum criativo com esse filtro. As peças aparecem aqui conforme saem da montagem.
          </p>
        )}
      </div>
    </AppLayout>
  );
}
