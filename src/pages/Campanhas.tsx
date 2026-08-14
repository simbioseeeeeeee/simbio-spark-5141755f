import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3, Phone, MessageSquare, Mail, Send, TrendingUp, TrendingDown,
  Minus, CalendarClock, AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  carregarPainel, montaPeriodo, periodoAnterior, resumir, porAnuncio, porCampanha,
  serieDiaria, PERIODOS, PERIODO_LABEL,
  type Painel, type PeriodoNome, type Resumo,
} from "@/store/campanhas-store";

// Desempenho da operação comercial da PRÓPRIA Simbiose (conta act_1213231827032543).
// Não é o painel dos clientes — esse vive em portal.simbiosedigital.com.

const brl = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: v < 100 ? 2 : 0 });
const int = (v: number) => v.toLocaleString("pt-BR");
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const diaCurto = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);

/** Variação contra o período anterior. `menorMelhor` inverte a cor (CPL, custo/reunião). */
function Delta({ atual, anterior, menorMelhor }: { atual: number | null; anterior: number | null; menorMelhor?: boolean }) {
  if (atual === null || anterior === null || anterior === 0) return null;
  const v = Math.round(((atual - anterior) / anterior) * 100);
  if (v === 0) return <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" />0%</span>;
  const bom = menorMelhor ? v < 0 : v > 0;
  const Icon = v > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${bom ? "text-emerald-600" : "text-red-600"}`}>
      <Icon className="h-3 w-3" />{v > 0 ? "+" : ""}{v}%
    </span>
  );
}

function Metrica({ titulo, valor, delta, sub }: { titulo: string; valor: string; delta?: React.ReactNode; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{titulo}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{valor}</span>
          {delta}
        </div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function Campanhas() {
  const [nome, setNome] = useState<PeriodoNome>("7d");
  const [dados, setDados] = useState<Painel | null>(null);
  const [antes, setAntes] = useState<Resumo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const periodo = useMemo(() => montaPeriodo(nome), [nome]);

  const load = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const [atual, anterior] = await Promise.all([
        carregarPainel(periodo),
        carregarPainel(periodoAnterior(periodo)),
      ]);
      setDados(atual); setAntes(resumir(anterior));
    } catch (e: any) {
      setErro(e?.message || "falha ao carregar");
    } finally {
      setCarregando(false);
    }
  }, [periodo]);

  useEffect(() => { load(); }, [load]);

  const r = dados ? resumir(dados) : null;
  const serie = dados ? serieDiaria(dados) : [];
  const campanhas = dados ? porCampanha(dados.midia) : [];
  const anuncios = dados ? porAnuncio(dados.midia) : [];
  const at = dados?.atividade ?? [];
  const soma = (f: (a: typeof at[number]) => number) => at.reduce((s, x) => s + (f(x) || 0), 0);

  const origens = useMemo(() => {
    const m = new Map<string, { origem: string; leads: number; reuniao: number; fechado: number }>();
    for (const f of dados?.funil ?? []) {
      const x = m.get(f.origem) || { origem: f.origem, leads: 0, reuniao: 0, fechado: 0 };
      x.leads += f.leads_novos; x.reuniao += f.reuniao_agendada; x.fechado += f.fechado_ganho;
      m.set(f.origem, x);
    }
    return [...m.values()].sort((a, b) => b.leads - a.leads);
  }, [dados]);

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Desempenho</h1>
            <Badge variant="secondary" className="text-xs">conta da Simbiose</Badge>
          </div>
          <div className="flex gap-1">
            {PERIODOS.map((p) => (
              <Button key={p} size="sm" variant={nome === p ? "default" : "outline"} onClick={() => setNome(p)}>
                {PERIODO_LABEL[p]}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          {periodo.de.split("-").reverse().join("/")} a {periodo.ate.split("-").reverse().join("/")}
          {" · variação comparada ao período anterior de mesmo tamanho"}
        </p>

        {erro && (
          <Card className="border-red-300">
            <CardContent className="p-4 flex items-start gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div><b>Não consegui carregar.</b> {erro}</div>
            </CardContent>
          </Card>
        )}

        {carregando || !r ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metrica titulo="Investido" valor={brl(r.gasto)} delta={<Delta atual={r.gasto} anterior={antes?.gasto ?? null} />} />
              <Metrica titulo="Leads de anúncio" valor={int(r.leads)} delta={<Delta atual={r.leads} anterior={antes?.leads ?? null} />} />
              <Metrica titulo="CPL" valor={brl(r.cpl)} delta={<Delta atual={r.cpl} anterior={antes?.cpl ?? null} menorMelhor />} />
              <Metrica titulo="Reuniões marcadas" valor={int(r.reunioes)} delta={<Delta atual={r.reunioes} anterior={antes?.reunioes ?? null} />} />
              <Metrica titulo="Custo por reunião" valor={brl(r.custoPorReuniao)} delta={<Delta atual={r.custoPorReuniao} anterior={antes?.custoPorReuniao ?? null} menorMelhor />} />
            </div>

            {serie.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <div className="mb-2 text-sm font-medium">Dia a dia</div>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={serie}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                        <XAxis dataKey="dia" tickFormatter={diaCurto} fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis yAxisId="l" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis yAxisId="r" orientation="right" fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip
                          labelFormatter={diaCurto}
                          formatter={(v: any, n: any) => [n === "gasto" ? brl(Number(v)) : int(Number(v)), n]}
                          contentStyle={{ fontSize: 12 }}
                        />
                        <Bar yAxisId="l" dataKey="gasto" name="gasto" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                        <Line yAxisId="r" dataKey="leads" name="leads" stroke="#10b981" strokeWidth={2} dot={false} />
                        <Line yAxisId="r" dataKey="ligacoes" name="ligações" stroke="#f59e0b" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── prospecção ativa ── */}
            <Card>
              <CardContent className="p-4">
                <div className="mb-3 text-sm font-medium">Prospecção ativa</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5" />Ligações</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">{int(soma((a) => a.ligacoes))}</div>
                    <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                      <div className="flex justify-between"><span>conversa (&gt;25s)</span><b className="text-foreground">{int(soma((a) => a.lig_conversa))}</b></div>
                      <div className="flex justify-between"><span>não atenderam</span><span>{int(soma((a) => a.lig_nao_atendeu))}</span></div>
                      <div className="flex justify-between"><span>caixa postal</span><span>{int(soma((a) => a.lig_caixa_postal))}</span></div>
                      <div className="flex justify-between"><span>falha de conexão</span><span className={soma((a) => a.lig_falha_conexao) > 0 ? "text-red-600 font-medium" : ""}>{int(soma((a) => a.lig_falha_conexao))}</span></div>
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Send className="h-3.5 w-3.5" />SMS</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">{int(soma((a) => a.sms))}</div>
                    <div className="mt-2 text-xs text-muted-foreground">{int(soma((a) => a.sms_ok))} entregues ({pct(soma((a) => a.sms_ok), soma((a) => a.sms))}%)</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MessageSquare className="h-3.5 w-3.5" />WhatsApp</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">{int(soma((a) => a.whatsapp))}</div>
                    <div className="mt-2 text-xs text-muted-foreground">mensagens enviadas</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="h-3.5 w-3.5" />E-mail</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">{int(soma((a) => a.emails))}</div>
                    <div className="mt-2 text-xs text-muted-foreground">disparos da cadência</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── mídia ── */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardContent className="p-4">
                  <div className="mb-3 text-sm font-medium">Campanhas</div>
                  {campanhas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nada entregou nesse período.</p>
                  ) : (
                    <div className="space-y-2">
                      {campanhas.slice(0, 10).map((c) => (
                        <div key={c.nome} className="flex items-center justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            <div className="truncate">{c.nome}</div>
                            <div className="text-xs text-muted-foreground">{c.anuncios > 0 ? `${c.anuncios} anúncio(s)` : "nível campanha"}</div>
                          </div>
                          <div className="shrink-0 text-right tabular-nums">
                            <div>{brl(c.gasto)}</div>
                            <div className="text-xs text-muted-foreground">{c.leads > 0 ? `${c.leads} leads · ${brl(c.gasto / c.leads)}` : "sem lead"}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="mb-3 text-sm font-medium">Anúncios por custo de lead</div>
                  {anuncios.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem anúncio no período.</p>
                  ) : (
                    <div className="space-y-2">
                      {anuncios.slice(0, 10).map((a) => (
                        <div key={a.chave} className="flex items-center justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            <div className="truncate">{a.ad_name}</div>
                            <div className="truncate text-xs text-muted-foreground">{a.campanha}</div>
                          </div>
                          <div className="shrink-0 text-right tabular-nums">
                            <div>{brl(a.gasto)}</div>
                            <div className="text-xs text-muted-foreground">{a.leads > 0 ? `${a.leads} lead(s) · ${brl(a.gasto / a.leads)}` : "sem lead"}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── funil ── */}
            <Card>
              <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-1.5 text-sm font-medium">
                  <CalendarClock className="h-4 w-4" />Leads por origem
                </div>
                {origens.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum lead novo no período.</p>
                ) : (
                  <div className="space-y-1.5">
                    {origens.map((o) => (
                      <div key={o.origem} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{o.origem}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          <b className="text-foreground">{int(o.leads)}</b> leads
                          {o.reuniao > 0 && <> · {o.reuniao} reunião</>}
                          {o.fechado > 0 && <> · <b className="text-emerald-600">{o.fechado} fechado</b></>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
