import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Shield,
  RefreshCw,
  Clock,
  Zap,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  getSistemaSummary,
  SistemaSummary,
} from "@/store/sistema-store";

function pct(num: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((num / total) * 100)}%`;
}

function HealthBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
        ok
          ? "bg-success/15 text-success"
          : "bg-destructive/15 text-destructive"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <AlertTriangle className="h-3 w-3" />
      )}
      {label}
    </span>
  );
}

export default function ManagerSistema() {
  const [data, setData] = useState<SistemaSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const s = await getSistemaSummary();
        if (!cancelled) setData(s);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // Auto-refresh a cada 60s
  useEffect(() => {
    const id = setInterval(refresh, 60000);
    return () => clearInterval(id);
  }, [refresh]);

  const lastEventDate = data?.lastEventAt ? new Date(data.lastEventAt) : null;
  const minutesSinceLastEvent = lastEventDate
    ? (Date.now() - lastEventDate.getTime()) / 60000
    : null;
  const webhookOk =
    minutesSinceLastEvent !== null && minutesSinceLastEvent < 60;

  const cadenceSuccessRate =
    data && data.cadenceTotal24h > 0
      ? Math.round((data.cadenceSuccess24h / data.cadenceTotal24h) * 100)
      : null;

  const eventsChartData =
    data?.eventsLast24h
      .filter((e) => e.event_type !== "<null>")
      .slice(0, 12)
      .map((e) => ({ name: e.event_type, total: e.total })) ?? [];

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Saúde do Sistema SDR
            </h1>
            <p className="text-sm text-muted-foreground">
              Métricas operacionais do webhook_vendas, cadência e ignored events
              · últimas 24h
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>
        </div>

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">
                <AlertTriangle className="inline h-4 w-4 mr-1" />
                Falha ao buscar dados: {error}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Verifique se a tabela <code>sdr_agent_logs</code> tem RLS
                liberada para a role atual.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Cards principais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Webhook
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading || !data ? (
                <Skeleton className="h-16" />
              ) : lastEventDate ? (
                <div className="space-y-1">
                  <HealthBadge
                    ok={webhookOk}
                    label={webhookOk ? "ativo" : "stale"}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    último evento{" "}
                    {formatDistanceToNow(lastEventDate, {
                      locale: ptBR,
                      addSuffix: true,
                    })}
                  </p>
                </div>
              ) : (
                <HealthBadge ok={false} label="sem eventos 24h" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Eventos 24h
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading || !data ? (
                <Skeleton className="h-16" />
              ) : (
                <div>
                  <div className="text-2xl font-bold">
                    {data.eventsLast24h
                      .reduce((acc, e) => acc + e.total, 0)
                      .toLocaleString("pt-BR")}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data.eventsLast24h.length} tipos distintos
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Cadência (sucesso)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading || !data ? (
                <Skeleton className="h-16" />
              ) : data.cadenceTotal24h === 0 ? (
                <div>
                  <p className="text-sm text-muted-foreground">
                    sem disparos 24h
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-2xl font-bold">
                    {cadenceSuccessRate}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {data.cadenceSuccess24h}/{data.cadenceTotal24h} disparos ok
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Ignored 24h
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading || !data ? (
                <Skeleton className="h-16" />
              ) : (
                <div className="space-y-0.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">desconhecido</span>
                    <span className="font-medium">
                      {data.ignoredCounts.unknown}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PENDENTE-*</span>
                    <span className="font-medium">
                      {data.ignoredCounts.pendente}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">blocklist</span>
                    <span className="font-medium">
                      {data.ignoredCounts.blocked_owner}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Gráfico eventos por tipo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eventos por tipo · 24h</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !data ? (
              <Skeleton className="h-64" />
            ) : eventsChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum evento registrado nas últimas 24 horas.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={eventsChartData}
                  layout="vertical"
                  margin={{ top: 8, right: 24, bottom: 8, left: 24 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={170}
                    tick={{ fontSize: 11 }}
                  />
                  <RechartsTooltip />
                  <Bar dataKey="total" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Falhas de cadência */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Falhas de cadência por canal · 24h
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !data ? (
              <Skeleton className="h-32" />
            ) : data.cadenceFailures24h.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma falha registrada — bom dia.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Canal</TableHead>
                    <TableHead>Tipo do step</TableHead>
                    <TableHead className="text-right">Falhas</TableHead>
                    <TableHead className="text-right">% do total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.cadenceFailures24h.map((f) => (
                    <TableRow key={`${f.channel}-${f.step_tipo}`}>
                      <TableCell className="font-medium">{f.channel}</TableCell>
                      <TableCell>{f.step_tipo}</TableCell>
                      <TableCell className="text-right">{f.total}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {pct(
                          f.total,
                          data.cadenceTotal24h - data.cadenceSuccess24h
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Próximos disparos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Próximos disparos (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !data ? (
              <Skeleton className="h-32" />
            ) : data.nextDispatches.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum disparo agendado nas próximas 24 horas.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead className="text-right">Tentativa #</TableHead>
                    <TableHead className="text-right">Quando</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.nextDispatches.map((d) => (
                    <TableRow key={d.cnpj}>
                      <TableCell className="font-medium">
                        {d.fantasia || d.contato_nome || d.cnpj.slice(0, 14)}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {d.status_sdr || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {d.origem_lead || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {d.tentativas_followup ?? 0}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {format(
                          new Date(d.data_proximo_passo),
                          "dd/MM HH:mm",
                          { locale: ptBR }
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
