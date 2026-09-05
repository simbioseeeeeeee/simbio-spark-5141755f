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
  const [loadingAlvos, setLoadingAlvos] = useState(false);
  const [mapa, setMapa] = useState<LinhaMapa[]>([]);
  const [cidade, setCidade] = useState<string | null>(null);
  const [buscaCidade, setBuscaCidade] = useState("");
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
    const elegiveis = alvos
      .filter((a) => a.ig_handle && ["alto", "encontrado"].includes(a.ig_status))
      .slice(0, COTA_DIA * 2);
    return {
      simbiose: elegiveis.filter((_, i) => i % 2 === 0),
      guilherme: elegiveis.filter((_, i) => i % 2 === 1),
    };
  }, [alvos]);
  const [feitasHoje, setFeitasHoje] = useState(0);

  // Todas as cidades ficam disponíveis para a Rayana. A view tem mais de 2 mil
  // linhas e o PostgREST limita uma resposta a 1.000, então buscamos em páginas.
  const carregaMapa = useCallback(async () => {
    setLoading(true);
    try {
      const linhas: LinhaMapa[] = [];
      const pageSize = 1_000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("social_selling_mapa" as any)
          .select("*")
          .order("total", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = ((data as any[]) || []) as LinhaMapa[];
        linhas.push(...batch);
        if (batch.length < pageSize) break;
      }
      setMapa(linhas);
    } catch (error: any) {
      toast({ title: "Erro ao carregar cidades", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  const carregaAlvos = useCallback(async (c: string | null) => {
    if (!c) { setAlvos([]); return; }
    setLoadingAlvos(true);
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
    const { data, error } = await q;
    if (error) {
      toast({ title: "Erro ao carregar perfis", description: error.message, variant: "destructive" });
      setAlvos([]);
    } else {
      setAlvos(((data as any[]) || []) as Alvo[]);
    }
    setLoadingAlvos(false);
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
    const { data, error } = await supabase.from("social_selling_alvos" as any)
      .update(patch).eq("cnpj", a.cnpj).select("cnpj");
    if (error || !data?.length) {
      setAlvos((prev) => prev.map((x) => (x.cnpj === a.cnpj ? a : x)));
      toast({ title: "Instagram não foi salvo", description: error?.message || "Perfil não localizado.", variant: "destructive" });
    }
  }

  async function marcarSemInstagram(a: Alvo) {
    const patch = { ig_status: "nao_tem", ig_handle: null, updated_at: new Date().toISOString() };
    setAlvos((prev) => prev.map((x) => (x.cnpj === a.cnpj ? { ...x, ...patch } as Alvo : x)));
    const { data, error } = await supabase.from("social_selling_alvos" as any)
      .update(patch).eq("cnpj", a.cnpj).select("cnpj");
    if (error || !data?.length) {
      setAlvos((prev) => prev.map((x) => (x.cnpj === a.cnpj ? a : x)));
      toast({ title: "Marcação não foi salva", description: error?.message || "Perfil não localizado.", variant: "destructive" });
    }
  }

  async function confirmarHandle(a: Alvo) {
    const patch = { ig_status: "encontrado", updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from("social_selling_alvos" as any)
      .update(patch).eq("cnpj", a.cnpj).select("cnpj");
    if (error || !data?.length) {
      toast({ title: "Perfil não foi confirmado", description: error?.message || "Perfil não localizado.", variant: "destructive" });
      return;
    }
    setAlvos((prev) => prev.map((x) => (x.cnpj === a.cnpj ? { ...x, ...patch } : x)));
  }

  const cidadesFiltradas = useMemo(() => {
    const termo = buscaCidade.trim().toLocaleLowerCase("pt-BR");
    const encontradas = termo
      ? mapa.filter((m) => `${m.cidade}/${m.uf}`.toLocaleLowerCase("pt-BR").includes(termo))
      : mapa;
    const visiveis = encontradas.slice(0, termo ? 100 : 48);
    if (cidade && !visiveis.some((m) => `${m.cidade}/${m.uf}` === cidade)) {
      const selecionada = mapa.find((m) => `${m.cidade}/${m.uf}` === cidade);
      if (selecionada) return [selecionada, ...visiveis];
    }
    return visiveis;
  }, [mapa, buscaCidade, cidade]);

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
            <CardTitle className="flex flex-wrap items-center gap-3 text-sm">
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Todas as cidades ({mapa.length.toLocaleString("pt-BR")})
              </span>
              <div className="relative ml-auto">
                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={buscaCidade}
                  onChange={(e) => setBuscaCidade(e.target.value)}
                  placeholder="buscar cidade ou UF"
                  className="h-9 w-56 pl-7"
                />
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {cidadesFiltradas.map((m) => {
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
            <p className="mt-3 text-xs text-muted-foreground">
              {buscaCidade.trim()
                ? `${cidadesFiltradas.length} resultado(s) exibido(s).`
                : "As 48 maiores aparecem primeiro; use a busca para acessar qualquer outra cidade."}
            </p>
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
                  <Button size="sm" variant={soComIg ? "default" : "outline"}
                    onClick={() => setSoComIg((v) => !v)}>
                    {soComIg ? "com Instagram" : "todos para pesquisar"}
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
              {loadingAlvos ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
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
                                <>
                                  <a href={`https://instagram.com/${a.ig_handle}`} target="_blank"
                                     rel="noopener noreferrer" title="abrir perfil"
                                     className="shrink-0 text-muted-foreground hover:text-foreground">
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                  {a.ig_status === "revisar" && (
                                    <Button size="sm" variant="outline" className="h-8 px-2 text-xs"
                                      onClick={() => confirmarHandle(a)}>
                                      confirmar
                                    </Button>
                                  )}
                                </>
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
              )}
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
