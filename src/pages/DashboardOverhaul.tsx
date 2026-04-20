import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getDashboardMetrics,
  getOrigemDistribution,
  getStatusDistribution,
  getRecentLeads,
  DashboardMetrics,
} from "@/store/leads-overhaul-store";
import { Lead, ORIGEM_LABEL } from "@/types/lead";
import { OrigemBadge } from "@/components/OrigemBadge";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Users, TrendingUp, Calendar, Target } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const ORIGEM_COLORS: Record<string, string> = {
  receita_federal: "#3b82f6", // blue
  bitrix_migrado: "#f97316", // orange
  whatsapp_entrante: "#22c55e", // green
  facebook_ads: "#ec4899", // pink
  teste: "#9ca3af", // gray
};

export default function DashboardOverhaul() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [origemDist, setOrigemDist] = useState<{ origem: string; total: number }[]>([]);
  const [statusDist, setStatusDist] = useState<{ status: string; total: number }[]>([]);
  const [recent, setRecent] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [m, od, sd, rl] = await Promise.all([
          getDashboardMetrics(),
          getOrigemDistribution(),
          getStatusDistribution(true),
          getRecentLeads(10),
        ]);
        setMetrics(m);
        setOrigemDist(od);
        setStatusDist(sd);
        setRecent(rl);
      } catch (err) {
        console.error("Erro dashboard:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const origemChartData = origemDist
    .filter((d) => d.total > 0)
    .map((d) => ({
      name: ORIGEM_LABEL[d.origem] || d.origem,
      value: d.total,
      origem: d.origem,
    }));

  return (
    <AppLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral do pipeline — programa acelerador oculto.
          </p>
        </div>

        {/* Métricas principais */}
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={<Users className="h-4 w-4" />}
            label="Leads ativos"
            value={loading ? null : metrics?.leads_ativos ?? 0}
            hint="Não-desqualificados, sem acelerador"
          />
          <MetricCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Atualizados (7d)"
            value={loading ? null : metrics?.novos_7d ?? 0}
            hint="updated_at nos últimos 7 dias"
          />
          <MetricCard
            icon={<Target className="h-4 w-4" />}
            label="Taxa → Reunião"
            value={loading ? null : `${metrics?.taxa_reuniao ?? 0}%`}
            hint="A Contatar → Reunião Agendada"
          />
          <MetricCard
            icon={<Calendar className="h-4 w-4" />}
            label="Prontos pro Closer"
            value={loading ? null : metrics?.prontos_closer ?? 0}
            hint="estagio_funil preenchido"
            highlight
          />
        </div>

        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {/* Pizza origem */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribuição por origem</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : origemChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">Sem dados.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={origemChartData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={90}
                      label={(entry: any) => `${entry.name}: ${entry.value.toLocaleString("pt-BR")}`}
                      labelLine={false}
                    >
                      {origemChartData.map((e, i) => (
                        <Cell key={i} fill={ORIGEM_COLORS[e.origem] || "#9ca3af"} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any) =>
                        typeof value === "number" ? value.toLocaleString("pt-BR") : value
                      }
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Barras status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por status SDR</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={statusDist} margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: any) =>
                        typeof value === "number" ? value.toLocaleString("pt-BR") : value
                      }
                    />
                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Últimas atividades */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimos leads atualizados</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum lead recente.</p>
            ) : (
              <div className="divide-y divide-border">
                {recent.map((l) => (
                  <Link
                    key={l.id}
                    to={`/leads`}
                    className="flex items-center justify-between py-2 hover:bg-muted/40 rounded px-2 -mx-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {l.fantasia || l.razao_social || "—"}
                      </div>
                      <div className="flex gap-2 items-center text-xs text-muted-foreground">
                        <OrigemBadge origem={l.origem_lead} />
                        {l.cidade && <span>{l.cidade}/{l.uf}</span>}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                      {l.updated_at
                        ? formatDistanceToNow(new Date(l.updated_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })
                        : "—"}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Link
            to="/leads"
            className="text-sm text-primary hover:underline"
          >
            Ver todos os leads →
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number | null;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary/40 bg-primary/5" : ""}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold">
          {value === null ? (
            <Skeleton className="h-8 w-24" />
          ) : typeof value === "number" ? (
            value.toLocaleString("pt-BR")
          ) : (
            value
          )}
        </div>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}
