import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Instagram, MapPin, Check, Search, ExternalLink, Heart, MessageSquareText, UserPlus, Send } from "lucide-react";

// Mapa diário de social selling (Rayana). Uma linha POR IMOBILIÁRIA, com marcação
// permanente — não é o contador do dia do /metas. O status_sdr da tabela leads é
// inútil aqui: 99,87% da base foi marcada 'Desqualificado' num UPDATE em lote.
// Prioridade: cidades onde o ecossistema Netspaces tem licenciado ativo (âncora local).

type Alvo = {
  cnpj: string;
  fantasia: string | null;
  cidade: string | null;
  uf: string | null;
  licenciado: string | null;
  ig_handle: string | null;
  ig_status: string;
  seguiu: boolean;
  curtiu: boolean;
  comentou: boolean;
  dm_enviada: boolean;
  respondeu: boolean;
  concluido_em: string | null;
  obs: string | null;
};

type LinhaMapa = {
  cidade: string; uf: string;
  total: number; concluidas: number; com_instagram: number; responderam: number;
};

const TOQUES: { campo: keyof Alvo; label: string; icon: React.ElementType }[] = [
  { campo: "seguiu", label: "seguiu", icon: UserPlus },
  { campo: "curtiu", label: "curtiu", icon: Heart },
  { campo: "comentou", label: "comentou", icon: MessageSquareText },
  { campo: "dm_enviada", label: "DM", icon: Send },
];

const META_DIA = 30; // imobiliárias trabalhadas por dia

export default function SocialSelling() {
  const [loading, setLoading] = useState(true);
  const [mapa, setMapa] = useState<LinhaMapa[]>([]);
  const [cidade, setCidade] = useState<string | null>(null);
  const [pracaAtiva, setPracaAtiva] = useState<string | null>(null);
  const [alvos, setAlvos] = useState<Alvo[]>([]);
  const [busca, setBusca] = useState("");
  const [soPendentes, setSoPendentes] = useState(true);
  // 40 abordagens/dia por perfil (@asimbiosedigital e @guidomingues99) — meta já definida
  // em comercial_config.metas_micro. Sem handle não há o que abordar, daí o filtro.
  const [soComIg, setSoComIg] = useState(true);
  const COTA_DIA = 40;
  const [salvando, setSalvando] = useState<string | null>(null);
  // Duas filas de 40, uma por perfil. Divide alternado pra que cada perfil pegue alvos de
  // portes e praças parecidos — se cortasse pela metade, um perfil ficaria só com Uberlândia.
  const filaDoDia = useMemo(() => {
    const elegiveis = alvos.filter((a) => a.ig_handle).slice(0, COTA_DIA * 2);
    return {
      simbiose: elegiveis.filter((_, i) => i % 2 === 0),
      guilherme: elegiveis.filter((_, i) => i % 2 === 1),
    };
  }, [alvos]);
  const [feitasHoje, setFeitasHoje] = useState(0);

  // Praça única: quando comercial_config.praca_atual está preenchida, a tela mostra SÓ ela.
  // Foco de uma cidade por vez (decisão 11/08). Trocar de praça = trocar aquele campo, e o
  // mapa inteiro volta sozinho se ela for esvaziada.
  const carregaMapa = useCallback(async () => {
    const { data: cfg } = await supabase
      .from("comercial_config" as any)
      .select("praca_atual")
      .eq("id", 1)
      .maybeSingle();
    // praca_atual virou LISTA (separada por vírgula) — são 4 praças simultâneas.
    // Uma string só continua funcionando: vira lista de um item.
    const bruto = ((cfg as any)?.praca_atual as string | null) ?? null;
    const ativas = bruto ? bruto.split(",").map((s) => s.trim()).filter(Boolean) : [];
    setPracaAtiva(bruto);

    // Com praça ativa, busca ELA no banco em vez de filtrar o top 60 — Águas Lindas tem 23
    // alvos e nem aparece no top 80 por volume, então filtrar a lista deixaria a tela VAZIA.
    if (ativas.length) {
      // busca cada praça por igualdade — filtrar o top 60 por volume deixaria de fora as
      // pequenas (Águas Lindas tem 23 alvos e nem entra no top 80) e a tela ficaria vazia.
      const linhas: LinhaMapa[] = [];
      for (const a of ativas) {
        const [uf, nome] = [a.slice(-2), a.slice(0, -3)];
        const { data: uma } = await supabase
          .from("social_selling_mapa" as any)
          .select("*")
          .eq("cidade", nome)
          .eq("uf", uf);
        if (uma?.length) linhas.push(...((uma as any[]) as LinhaMapa[]));
      }
      linhas.sort((x, y) => y.total - x.total);
      setMapa(linhas);
      setCidade((c) => c ?? ativas[0]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("social_selling_mapa" as any)
      .select("*")
      .order("total", { ascending: false })
      .limit(60);
    setMapa(((data as any[]) || []) as LinhaMapa[]);
    setLoading(false);
  }, []);

  const carregaAlvos = useCallback(async (c: string | null) => {
    if (!c) { setAlvos([]); return; }
    const [uf, nome] = [c.slice(-2), c.slice(0, -3)];
    let q = supabase
      .from("social_selling_alvos" as any)
      .select("*")
      .eq("cidade", nome)
      .eq("uf", uf)
      // ig_status "alto" primeiro: handle conferido pelo enriquecimento entra na fila,
      // o "revisar" fica depois porque DM em perfil errado queima a marca.
      .order("ig_status", { ascending: true, nullsFirst: false })
      .order("concluido_em", { ascending: true, nullsFirst: true })
      .limit(300);
    if (soPendentes) q = q.is("concluido_em", null);
    if (soComIg) q = q.not("ig_handle", "is", null);
    const { data } = await q;
    setAlvos(((data as any[]) || []) as Alvo[]);
  }, [soPendentes, soComIg]);

  const contaHoje = useCallback(async () => {
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const { count } = await supabase
      .from("social_selling_alvos" as any)
      .select("cnpj", { count: "exact", head: true })
      .gte("concluido_em", `${hoje}T00:00:00`);
    setFeitasHoje(count || 0);
  }, []);

  useEffect(() => { carregaMapa(); contaHoje(); }, [carregaMapa, contaHoje]);
  useEffect(() => { carregaAlvos(cidade); }, [cidade, carregaAlvos]);

  async function marcar(a: Alvo, campo: keyof Alvo) {
    setSalvando(a.cnpj);
    const valor = !a[campo];
    const agora = new Date().toISOString();
    const patch: Record<string, unknown> = { [campo]: valor, updated_at: agora };
    // a DM é o que fecha o trabalho na imobiliária — carimba a conclusão
    if (campo === "dm_enviada") patch.concluido_em = valor ? agora : null;
    // Cada ação carrega a própria data. Sem isso a aba Metas do Dia não tinha como
    // dizer "quantas curtidas hoje" e mostrava zero enquanto saíam 100+ DMs por dia.
    const CARIMBO: Partial<Record<keyof Alvo, string>> = {
      seguiu: "seguiu_em", curtiu: "curtiu_em",
      comentou: "comentou_em", respondeu: "respondeu_em",
    };
    const coluna = CARIMBO[campo];
    if (coluna) patch[coluna] = valor ? agora : null;
    setAlvos((prev) => prev.map((x) => (x.cnpj === a.cnpj ? { ...x, ...patch } as Alvo : x)));
    // `.select("cnpj")` para SABER se casou: o PostgREST devolve 204 mesmo quando o
    // UPDATE não atinge linha nenhuma, então sem isso uma falha era indistinguível
    // de sucesso — a tela marcava, o banco não, e no reload voltava pendente
    // (a pessoa clicava de novo, e isso realimentava a fila).
    const { data: casou, error } = await supabase
      .from("social_selling_alvos" as any)
      .update(patch)
      .eq("cnpj", a.cnpj)
      .select("cnpj");
    if (error || !casou?.length) {
      // desfaz a marcação otimista — melhor a pessoa ver que não salvou
      setAlvos((prev) => prev.map((x) => (x.cnpj === a.cnpj ? a : x)));
      setSalvando(null);
      return;
    }
    // Contador do dia é ajustado LOCALMENTE. Antes cada DM disparava um HEAD de
    // contagem + uma recarga do mapa (1 query por praça ativa, hoje 4) sem await —
    // 1 clique virava 6 requisições concorrentes. Com uma pessoa varrendo 300
    // alvos, é isso que satura o pool. O mapa recarrega quando a pessoa troca de
    // cidade ou recarrega a página.
    if (campo === "dm_enviada") setFeitasHoje((n) => n + (valor ? 1 : -1));
    setSalvando(null);
  }

  async function salvarHandle(a: Alvo, handle: string) {
    const limpo = handle.trim().replace(/^@/, "");
    const patch = {
      ig_handle: limpo || null,
      ig_status: limpo ? "encontrado" : "a_procurar",
      updated_at: new Date().toISOString(),
    };
    setAlvos((prev) => prev.map((x) => (x.cnpj === a.cnpj ? { ...x, ...patch } as Alvo : x)));
    await supabase.from("social_selling_alvos" as any).update(patch).eq("cnpj", a.cnpj);
  }

  async function marcarSemInstagram(a: Alvo) {
    const patch = { ig_status: "nao_tem", ig_handle: null, updated_at: new Date().toISOString() };
    setAlvos((prev) => prev.map((x) => (x.cnpj === a.cnpj ? { ...x, ...patch } as Alvo : x)));
    await supabase.from("social_selling_alvos" as any).update(patch).eq("cnpj", a.cnpj);
  }

  const comLicenciado = useMemo(
    () => mapa.filter((m) => alvos.length === 0 || true),
    [mapa, alvos],
  );

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return alvos;
    return alvos.filter((a) => (a.fantasia || "").toLowerCase().includes(t) || a.cnpj.includes(t));
  }, [alvos, busca]);

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-4 p-6"><Skeleton className="h-24 w-full" /><Skeleton className="h-72 w-full" /></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        {/* placar do dia */}
        <Card className={feitasHoje >= META_DIA ? "border-green-500" : ""}>
          <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
            <div className="flex items-center gap-2">
              <Instagram className="h-5 w-5 text-primary" />
              <span className="font-semibold">Social selling</span>
            </div>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold tabular-nums leading-none">{feitasHoje}</span>
              <span className="pb-0.5 text-muted-foreground">/ {META_DIA} imobiliárias hoje</span>
            </div>
            <span className="text-sm text-muted-foreground">
              A DM enviada é o que marca a imobiliária como trabalhada.
            </span>
          </CardContent>
        </Card>

        {/* mapa por cidade */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4" />
              {pracaAtiva
                ? `${pracaAtiva.split(",").length} praças ativas — as demais estão ocultas de propósito`
                : "Praças — comece pelas que têm licenciado Netspaces"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {comLicenciado.slice(0, 24).map((m) => {
                const key = `${m.cidade}/${m.uf}`;
                const pct = m.total ? Math.round((m.concluidas / m.total) * 100) : 0;
                return (
                  <button key={key} onClick={() => setCidade(cidade === key ? null : key)}
                    className={`border px-3 py-1.5 text-xs transition-colors ${
                      cidade === key ? "border-primary bg-primary/10" : "hover:bg-muted/50"}`}>
                    <span className="font-medium">{m.cidade}</span>
                    <span className="text-muted-foreground">/{m.uf}</span>
                    <span className="ml-2 tabular-nums text-muted-foreground">
                      {m.concluidas}/{m.total}
                      {pct > 0 ? ` · ${pct}%` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {filaDoDia.simbiose.length > 0 && (
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            {([["@asimbiosedigital", filaDoDia.simbiose],
               ["@guidomingues99", filaDoDia.guilherme]] as const).map(([perfil, lista]) => (
              <div key={perfil} className="rounded-md border p-3 text-sm">
                <div className="font-medium">{perfil}</div>
                <div className="text-muted-foreground">
                  {lista.length} de {COTA_DIA} abordagens do dia
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {lista.slice(0, 3).map((a) => a.fantasia).join(" · ")}
                  {lista.length > 3 ? " …" : ""}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* lista de imobiliárias da praça */}
        {cidade && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-3 text-sm">
                <span>{cidade}</span>
                <Badge variant="outline">{filtrados.length} na lista</Badge>
                <div className="ml-auto flex items-center gap-2">
                  <Button size="sm" variant={soPendentes ? "default" : "outline"}
                    onClick={() => setSoPendentes((v) => !v)}>
                    {soPendentes ? "só pendentes" : "todas"}
                  </Button>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                      placeholder="buscar imobiliária" className="h-9 w-48 pl-7" />
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>imobiliária</TableHead>
                      <TableHead className="w-64">instagram</TableHead>
                      <TableHead className="w-72">o que já foi feito</TableHead>
                      <TableHead className="w-24">respondeu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtrados.map((a) => (
                      <TableRow key={a.cnpj} className={a.concluido_em ? "opacity-60" : ""}>
                        <TableCell>
                          <div className="font-medium">{a.fantasia || "—"}</div>
                          <div className="text-xs text-muted-foreground tabular-nums">{a.cnpj}</div>
                        </TableCell>
                        <TableCell>
                          {a.ig_status === "nao_tem" ? (
                            <button className="text-xs text-muted-foreground underline"
                              onClick={() => salvarHandle(a, "")}>sem Instagram — reabrir</button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Input defaultValue={a.ig_handle || ""} placeholder="@perfil"
                                className="h-8 text-sm"
                                onBlur={(e) => e.target.value.trim().replace(/^@/, "") !== (a.ig_handle || "")
                                  && salvarHandle(a, e.target.value)} />
                              {a.ig_handle ? (
                                <a href={`https://instagram.com/${a.ig_handle}`} target="_blank"
                                   rel="noopener noreferrer" title="abrir perfil"
                                   className="shrink-0 text-muted-foreground hover:text-foreground">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              ) : (
                                <button onClick={() => marcarSemInstagram(a)} title="marcar como sem Instagram"
                                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
                                  n/a
                                </button>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1.5">
                            {TOQUES.map(({ campo, label, icon: Icon }) => {
                              const on = Boolean(a[campo]);
                              return (
                                <button key={String(campo)} disabled={salvando === a.cnpj}
                                  onClick={() => marcar(a, campo)}
                                  className={`flex items-center gap-1 border px-2 py-1 text-xs transition-colors ${
                                    on ? "border-green-500 bg-green-500/10 text-green-600"
                                       : "text-muted-foreground hover:bg-muted/50"}`}>
                                  {on ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <button onClick={() => marcar(a, "respondeu")}
                            className={`border px-2 py-1 text-xs ${
                              a.respondeu ? "border-green-500 bg-green-500/10 text-green-600"
                                          : "text-muted-foreground hover:bg-muted/50"}`}>
                            {a.respondeu ? "sim" : "—"}
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {!cidade && (
          <p className="text-sm text-muted-foreground">
            Escolha uma praça acima para ver as imobiliárias. A lista traz primeiro quem ainda não foi
            trabalhado; o Instagram você preenche na hora que achar (ou marca <b>n/a</b> se não existir).
          </p>
        )}
      </div>
    </AppLayout>
  );
}
