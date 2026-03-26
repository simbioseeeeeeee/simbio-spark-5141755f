import { useState, useEffect, useCallback } from "react";
import { Lead } from "@/types/lead";
import {
  getManagerAnalytics, getLeaderboard, getActivityTrend, getConversionFunnel,
  getPipelineByStage, getActivityBreakdown, getSdrPerformance,
  ManagerAnalytics, LeaderboardEntry, ActivityTrendEntry, FunnelEntry,
  PipelineStageEntry, ActivityBreakdownEntry, SdrPerformanceEntry,
  getCadenciaHoje, getDailyMetrics, DailyMetrics,
} from "@/store/leads-store";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { TerritorySelector } from "@/components/TerritorySelector";
import { CloserPipeline } from "@/components/CloserPipeline";
import { LeadExplorer } from "@/components/LeadExplorer";
import { LeadProfile } from "@/components/LeadProfile";
import { NewLeadModal } from "@/components/NewLeadModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Users, Activity, CalendarCheck, DollarSign, Trophy, Loader2, Target, BarChart3, TrendingUp, PieChart,
  AlertTriangle, Pencil,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useLocation } from "react-router-dom";
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart as RechartsPie,
  Pie, RadialBarChart, RadialBar,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { Bell } from "lucide-react";

// ─── Editable daily targets (persisted in database) ─────────
interface DailyTargets {
  leads: number;
  atividades: number;
  reunioes: number;
  fechamentos: number;
  pipeline: number;
}

const DEFAULT_TARGETS: DailyTargets = { leads: 5, atividades: 30, reunioes: 3, fechamentos: 1, pipeline: 10000 };

async function loadTargetsFromDB(userId: string): Promise<DailyTargets> {
  const { data, error } = await supabase
    .from("manager_targets" as any)
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return { ...DEFAULT_TARGETS };
  const row = data as any;
  return {
    leads: Number(row.leads) || DEFAULT_TARGETS.leads,
    atividades: Number(row.atividades) || DEFAULT_TARGETS.atividades,
    reunioes: Number(row.reunioes) || DEFAULT_TARGETS.reunioes,
    fechamentos: Number(row.fechamentos) || DEFAULT_TARGETS.fechamentos,
    pipeline: Number(row.pipeline) || DEFAULT_TARGETS.pipeline,
  };
}

async function saveTargetsToDB(userId: string, t: DailyTargets): Promise<void> {
  const { error } = await supabase
    .from("manager_targets" as any)
    .upsert({
      user_id: userId,
      leads: t.leads,
      atividades: t.atividades,
      reunioes: t.reunioes,
      fechamentos: t.fechamentos,
      pipeline: t.pipeline,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "user_id" });
  if (error) throw error;
}

// ─── KPI Alert interface ────────────────────────────────────
interface KpiAlert {
  kpi_name: string;
  consecutive_days: number;
}

const KPI_LABELS: Record<string, string> = {
  leads: "Leads Qualificados",
  atividades: "Atividades",
  reunioes: "Reuniões",
  pipeline: "Pipeline",
};

// ─── KPI Card with target, alerts & progress ────────────────
function KpiCard({ label, value, icon: Icon, color, prefix, target }: { label: string; value: string | number; icon: any; color: string; prefix?: string; target?: number }) {
  const numericValue = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.-]/g, "")) || 0;
  const pct = target && target > 0 ? Math.min((numericValue / target) * 100, 150) : null;
  const isAboveTarget = target ? numericValue >= target : false;
  const isCritical = pct !== null && pct < 50;
  const isWarning = pct !== null && pct >= 50 && pct < 80;

  return (
    <Card className={`border-border transition-all ${isCritical ? "border-destructive/60 shadow-[0_0_12px_-2px_hsl(var(--destructive)/0.25)]" : ""}`}>
      <CardContent className="p-5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            {isCritical && <AlertTriangle className="h-3.5 w-3.5 text-destructive animate-pulse" />}
          </div>
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="h-4.5 w-4.5" />
          </div>
        </div>
        <p className="text-3xl font-bold">{prefix}{value}</p>
        {target !== undefined && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Meta: {prefix}{target.toLocaleString("pt-BR")}</span>
              <span className={`font-semibold ${isAboveTarget ? "text-success" : isCritical ? "text-destructive" : "text-warning"}`}>
                {pct !== null ? `${Math.min(pct, 100).toFixed(0)}%` : "—"}
              </span>
            </div>
            <div className="relative">
              <Progress
                value={pct !== null ? Math.min(pct, 100) : 0}
                className={`h-1.5 ${isCritical ? "[&>div]:bg-destructive" : isWarning ? "[&>div]:bg-warning" : "[&>div]:bg-success"}`}
              />
            </div>
            {isCritical && (
              <p className="text-[10px] text-destructive font-medium flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Abaixo de 50% da meta
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const ROLE_BADGE: Record<string, string> = {
  sdr: "bg-primary/15 text-primary",
  closer: "bg-success/15 text-success",
  manager: "bg-warning/15 text-warning",
};

const STAGE_COLORS = [
  "hsl(var(--primary))",
  "hsl(38 92% 50%)",
  "hsl(262 83% 58%)",
  "hsl(142 76% 36%)",
];

const ACTIVITY_COLORS = [
  "hsl(var(--primary))",
  "hsl(142 76% 36%)",
  "hsl(38 92% 50%)",
  "hsl(262 83% 58%)",
  "hsl(var(--destructive))",
  "hsl(198 93% 60%)",
];

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(val);

const formatCurrencyShort = (val: number) => {
  if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `R$ ${(val / 1_000).toFixed(0)}K`;
  return `R$ ${val}`;
};
// ─── Targets Editor Popover ─────────────────────────────────
const TARGET_LABELS: { key: keyof DailyTargets; label: string; prefix?: string }[] = [
  { key: "leads", label: "Leads Qualificados/dia" },
  { key: "atividades", label: "Atividades/dia" },
  { key: "reunioes", label: "Reuniões/dia" },
  { key: "fechamentos", label: "Fechamentos/dia" },
  { key: "pipeline", label: "Pipeline (R$)/dia", prefix: "R$ " },
];

function TargetsEditor({ targets, onSave }: { targets: DailyTargets; onSave: (t: DailyTargets) => void }) {
  const [draft, setDraft] = useState<DailyTargets>(targets);
  const [open, setOpen] = useState(false);

  const handleOpen = (o: boolean) => {
    if (o) setDraft(targets);
    setOpen(o);
  };

  const handleSave = () => {
    // Validate: all values must be positive numbers
    const validated = { ...draft };
    for (const k of Object.keys(validated) as (keyof DailyTargets)[]) {
      const v = Number(validated[k]);
      if (!v || v <= 0) validated[k] = DEFAULT_TARGETS[k];
      else validated[k] = v;
    }
    onSave(validated);
    setOpen(false);
    toast({ title: "Metas atualizadas", description: "As metas diárias foram salvas com sucesso." });
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground hover:text-foreground">
          <Pencil className="h-3.5 w-3.5" />
          Editar Metas Diárias
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4 space-y-3" align="end">
        <p className="text-sm font-semibold">Metas Diárias</p>
        <p className="text-[11px] text-muted-foreground">Valores por dia — escalados automaticamente pelo período selecionado.</p>
        {TARGET_LABELS.map(({ key, label, prefix }) => (
          <div key={key} className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{label}</label>
            <Input
              type="number"
              min={1}
              value={draft[key]}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: Number(e.target.value) || 0 }))}
              className="h-8 text-sm"
            />
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleSave}>Salvar</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AnalyticsView({ territorio }: { territorio: string }) {
  const { user } = useAuth();
  const [period, setPeriod] = useState<number>(7);
  const [analytics, setAnalytics] = useState<ManagerAnalytics | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [trend, setTrend] = useState<ActivityTrendEntry[]>([]);
  const [funnel, setFunnel] = useState<FunnelEntry[]>([]);
  const [pipeline, setPipeline] = useState<PipelineStageEntry[]>([]);
  const [actBreakdown, setActBreakdown] = useState<ActivityBreakdownEntry[]>([]);
  const [sdrPerf, setSdrPerf] = useState<SdrPerformanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dailyTargets, setDailyTargets] = useState<DailyTargets>(DEFAULT_TARGETS);
  const [kpiAlerts, setKpiAlerts] = useState<KpiAlert[]>([]);
  const [alertsDismissed, setAlertsDismissed] = useState(false);

  // Load targets from DB on mount
  useEffect(() => {
    if (user?.id) {
      loadTargetsFromDB(user.id).then(setDailyTargets);
    }
  }, [user?.id]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const cidade = territorio || null;
      const [a, l, t, f, p, ab, sp] = await Promise.all([
        getManagerAnalytics(cidade, period),
        getLeaderboard(cidade, period),
        getActivityTrend(cidade, period < 7 ? 7 : period),
        getConversionFunnel(cidade),
        getPipelineByStage(cidade),
        getActivityBreakdown(cidade, period),
        getSdrPerformance(cidade, period),
      ]);
      setAnalytics(a);
      setLeaderboard(l);
      setTrend(t);
      setFunnel(f);
      setPipeline(p);
      setActBreakdown(ab);
      setSdrPerf(sp);

      // Snapshot today's KPIs and check alerts
      try {
        await supabase.rpc("snapshot_daily_kpis" as any, { p_cidade: cidade });
        const { data: alertData } = await supabase.rpc("get_kpi_alerts" as any, {
          p_cidade: cidade,
          p_target_leads: dailyTargets.leads,
          p_target_atividades: dailyTargets.atividades,
          p_target_reunioes: dailyTargets.reunioes,
          p_target_fechamentos: dailyTargets.fechamentos,
          p_target_pipeline: dailyTargets.pipeline,
        });
        if (alertData && (alertData as any[]).length > 0) {
          setKpiAlerts((alertData as any[]).map((r: any) => ({
            kpi_name: r.kpi_name,
            consecutive_days: Number(r.consecutive_days),
          })));
          setAlertsDismissed(false);
        } else {
          setKpiAlerts([]);
        }
      } catch { /* non-critical */ }
    } catch (err: any) {
      toast({ title: "Erro ao carregar analytics", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [territorio, period, dailyTargets]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading || !analytics) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const totalFunnel = funnel.reduce((s, f) => s + f.total, 0);
  const conversionRate = totalFunnel > 0
    ? ((funnel.find(f => f.etapa === "Fechado Ganho")?.total || 0) / totalFunnel * 100).toFixed(1)
    : "0";

  const totalPipelineLeads = pipeline.reduce((s, p) => s + p.total_leads, 0);
  const totalPipelineValue = pipeline.reduce((s, p) => s + p.valor_total, 0);

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Control Tower
          {territorio && <span className="text-sm font-normal text-muted-foreground">— {territorio}</span>}
        </h2>
        <Tabs value={String(period)} onValueChange={(v) => setPeriod(Number(v))}>
          <TabsList>
            <TabsTrigger value="1">Hoje</TabsTrigger>
            <TabsTrigger value="7">7 Dias</TabsTrigger>
            <TabsTrigger value="30">30 Dias</TabsTrigger>
            <TabsTrigger value="90">90 Dias</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* KPI Alert Banner */}
      {kpiAlerts.length > 0 && !alertsDismissed && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-destructive animate-pulse" />
              <span className="text-sm font-semibold text-destructive">Alertas de Performance</span>
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setAlertsDismissed(true)}>
              Dispensar
            </Button>
          </div>
          {kpiAlerts.map((alert) => (
            <div key={alert.kpi_name} className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
              <span>
                <strong>{KPI_LABELS[alert.kpi_name] || alert.kpi_name}</strong> está abaixo de 50% da meta por{" "}
                <strong>{alert.consecutive_days} dias consecutivos</strong>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* KPI Row */}
      {(() => {
        const mult = period === 1 ? 1 : period;
        const t = {
          leads: dailyTargets.leads * mult,
          atividades: dailyTargets.atividades * mult,
          reunioes: dailyTargets.reunioes * mult,
          fechamentos: dailyTargets.fechamentos * mult,
          pipeline: dailyTargets.pipeline * mult,
        };
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-end">
              <TargetsEditor targets={dailyTargets} onSave={async (newT) => { setDailyTargets(newT); if (user?.id) await saveTargetsToDB(user.id, newT); }} />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <KpiCard label="Leads Qualificados" value={Number(analytics.total_leads_qualificados)} icon={Users} color="bg-primary/10 text-primary" target={t.leads} />
              <KpiCard label="Atividades" value={Number(analytics.total_atividades)} icon={Activity} color="bg-warning/10 text-warning" target={t.atividades} />
              <KpiCard label="Reuniões" value={Number(analytics.total_reunioes)} icon={CalendarCheck} color="bg-success/10 text-success" target={t.reunioes} />
              <KpiCard label="Fechamentos" value={Number(analytics.total_fechamentos)} icon={Target} color="bg-success/10 text-success" target={t.fechamentos} />
              <KpiCard label="Pipeline (R$)" value={formatCurrency(Number(analytics.valor_pipeline))} icon={DollarSign} color="bg-primary/10 text-primary" prefix="" target={t.pipeline} />
            </div>
          </div>
        );
      })()}

      {/* Conversion Rate + Pipeline Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-success" />
              Taxa de Conversão
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-4xl font-bold text-success">{conversionRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">Lead → Fechamento Ganho</p>
            <Progress value={Number(conversionRate)} className="mt-3 h-2" />
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Pipeline Ativo
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-bold">{formatCurrencyShort(totalPipelineValue)}</div>
            <p className="text-xs text-muted-foreground mt-1">{totalPipelineLeads} leads em negociação</p>
            <div className="mt-3 space-y-1.5">
              {pipeline.map((s, i) => (
                <div key={s.estagio} className="flex items-center gap-2 text-xs">
                  <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: STAGE_COLORS[i % STAGE_COLORS.length] }} />
                  <span className="flex-1 truncate text-muted-foreground">{s.estagio}</span>
                  <span className="font-medium">{s.total_leads}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <PieChart className="h-4 w-4 text-warning" />
              Mix de Atividades
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {actBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Sem dados no período</p>
            ) : (
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie
                      data={actBreakdown}
                      dataKey="total"
                      nameKey="tipo"
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={60}
                      paddingAngle={2}
                    >
                      {actBreakdown.map((_, i) => (
                        <Cell key={i} fill={ACTIVITY_COLORS[i % ACTIVITY_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                  </RechartsPie>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Activity Trend */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Atividades por Dia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="gradAtiv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradReun" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142 76% 36%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(142 76% 36%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="dia" tickFormatter={(v) => new Date(v + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} className="text-xs fill-muted-foreground" />
                  <YAxis className="text-xs fill-muted-foreground" />
                  <RechartsTooltip labelFormatter={(v) => new Date(v + 'T12:00:00').toLocaleDateString('pt-BR')} />
                  <Area type="monotone" dataKey="total_atividades" name="Atividades" stroke="hsl(var(--primary))" fill="url(#gradAtiv)" strokeWidth={2} />
                  <Area type="monotone" dataKey="total_reunioes" name="Reuniões" stroke="hsl(142 76% 36%)" fill="url(#gradReun)" strokeWidth={2} />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Value by Stage */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Valor por Etapa do Funil
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipeline}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="estagio" className="text-xs fill-muted-foreground" tick={{ fontSize: 10 }} />
                  <YAxis className="text-xs fill-muted-foreground" tickFormatter={(v) => formatCurrencyShort(v)} />
                  <RechartsTooltip formatter={(val: number) => formatCurrency(val)} />
                  <Bar dataKey="valor_total" name="Valor (R$)" radius={[4, 4, 0, 0]}>
                    {pipeline.map((_, i) => (
                      <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Conversion Funnel + SDR Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Conversion Funnel */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-success" />
              Funil de Conversão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnel} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" className="text-xs fill-muted-foreground" />
                  <YAxis dataKey="etapa" type="category" width={120} className="text-xs fill-muted-foreground" />
                  <RechartsTooltip />
                  <Bar dataKey="total" name="Leads" radius={[0, 4, 4, 0]}>
                    {funnel.map((_, index) => {
                      const colors = ['hsl(var(--primary))', 'hsl(38 92% 50%)', 'hsl(142 76% 36%)', 'hsl(142 76% 26%)', 'hsl(var(--destructive))'];
                      return <Cell key={index} fill={colors[index % colors.length]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* SDR Performance */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Performance por SDR
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sdrPerf.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem dados no período</p>
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sdrPerf} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" className="text-xs fill-muted-foreground" />
                    <YAxis dataKey="nome" type="category" width={80} className="text-xs fill-muted-foreground" tick={{ fontSize: 10 }} />
                    <RechartsTooltip />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="whatsapps" name="WhatsApp" stackId="a" fill="hsl(142 76% 36%)" />
                    <Bar dataKey="ligacoes" name="Ligações" stackId="a" fill="hsl(var(--primary))" />
                    <Bar dataKey="emails" name="Emails" stackId="a" fill="hsl(38 92% 50%)" />
                    <Bar dataKey="pesquisas" name="Pesquisas" stackId="a" fill="hsl(262 83% 58%)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="h-4 w-4 text-warning" />
            Ranking da Equipe
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leaderboard.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border rounded-lg text-muted-foreground">
              <Trophy className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nenhum dado ainda</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[40px]">#</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-[100px]">Cargo</TableHead>
                  <TableHead className="w-[120px] text-center">Atividades</TableHead>
                  <TableHead className="w-[120px] text-center">Reuniões</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.map((entry, idx) => (
                  <TableRow key={entry.user_id}>
                    <TableCell className="font-bold text-muted-foreground">
                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                    </TableCell>
                    <TableCell className="font-medium">{entry.nome}</TableCell>
                    <TableCell>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_BADGE[entry.role] || ""}`}>
                        {entry.role.toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell className="text-center font-bold">{Number(entry.total_atividades)}</TableCell>
                    <TableCell className="text-center font-bold">{Number(entry.total_reunioes)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function ManagerPipelineView() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  return (
    <>
      <CloserPipeline onSelectLead={setSelectedLead} />
      <LeadProfile lead={selectedLead} open={!!selectedLead} onClose={() => setSelectedLead(null)} onSaved={(u) => setSelectedLead(u)} />
    </>
  );
}

function ManagerExplorerView({ territorio }: { territorio: string }) {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  if (!territorio) {
    return <div className="text-center py-16 text-muted-foreground">Selecione um território acima.</div>;
  }

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-foreground">Explorador de Leads — {territorio}</h2>
        <NewLeadModal onCreated={() => setRefreshKey((k) => k + 1)} />
      </div>
      <LeadExplorer key={refreshKey} territorio={territorio} onSelectLead={setSelectedLead} />
      <LeadProfile lead={selectedLead} open={!!selectedLead} onClose={() => setSelectedLead(null)} onSaved={(u) => setSelectedLead(u)} />
    </>
  );
}

export default function ManagerWorkspace() {
  const location = useLocation();
  const [territorio, setTerritorio] = useState("");

  const isCadencia = location.pathname.includes("/cadencia");
  const isPipeline = location.pathname.includes("/pipeline");
  const isExplorer = location.pathname.includes("/explorador");
  const isAnalytics = !isCadencia && !isPipeline && !isExplorer;

  // Import SdrFocoView dynamically to avoid circular deps - inline a simpler version
  const needsTerritory = isAnalytics || isCadencia || isExplorer;

  return (
    <AppLayout headerExtra={needsTerritory ? <TerritorySelector value={territorio} onChange={setTerritorio} showAll={isAnalytics} /> : undefined}>
      {isAnalytics && <AnalyticsView territorio={territorio === "__all__" ? "" : territorio} />}
      {isCadencia && (
        territorio ? (
          <SdrCadenciaForManager territorio={territorio} />
        ) : (
          <div className="text-center py-16 text-muted-foreground">Selecione um território acima.</div>
        )
      )}
      {isPipeline && <ManagerPipelineView />}
      {isExplorer && <ManagerExplorerView territorio={territorio} />}
    </AppLayout>
  );
}

// Simplified cadencia view for Manager
import { CADENCE_STEPS } from "@/types/lead";
import { ActivityModal } from "@/components/ActivityModal";
import { BatchResearch } from "@/components/BatchResearch";
import { Crosshair, Search, Phone, MessageSquare, Bot } from "lucide-react";

function SdrCadenciaForManager({ territorio }: { territorio: string }) {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<DailyMetrics>({ pesquisas_hoje: 0, tentativas_hoje: 0, conexoes_hoje: 0, reunioes_hoje: 0 });
  const [cadencia, setCadencia] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [activityLead, setActivityLead] = useState<Lead | null>(null);

  const loadData = useCallback(async () => {
    if (!territorio) return;
    setLoading(true);
    try {
      const [m, c] = await Promise.all([getDailyMetrics(territorio), getCadenciaHoje(territorio)]);
      setMetrics(m);
      setCadencia(c);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [territorio]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleActivityDone = (updated: Lead) => {
    setCadencia((prev) => prev.filter((l) => l.id !== updated.id));
    setActivityLead(null);
    loadData();
  };

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-primary/10 text-primary"><Search className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{metrics.pesquisas_hoje}</p><p className="text-xs text-muted-foreground">Pesquisas</p></div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-warning/10 text-warning"><Phone className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{metrics.tentativas_hoje}</p><p className="text-xs text-muted-foreground">Tentativas</p></div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-success/10 text-success"><MessageSquare className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{metrics.conexoes_hoje}</p><p className="text-xs text-muted-foreground">Conexões</p></div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-primary/10 text-primary"><CalendarCheck className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{metrics.reunioes_hoje}</p><p className="text-xs text-muted-foreground">Reuniões</p></div>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-primary" />
          Cadência SDR — {territorio}
          <span className="text-muted-foreground font-normal">({cadencia.length} leads)</span>
        </h2>
        <div className="flex items-center gap-2">
          <BatchResearch cidade={territorio} onComplete={loadData} />
          <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : cadencia.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-lg">
          <CalendarCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Nenhuma tarefa pendente!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cadencia.map((lead) => {
            const step = CADENCE_STEPS[lead.dia_cadencia] || `Passo ${lead.dia_cadencia + 1}`;
            const isOverdue = lead.data_proximo_passo && new Date(lead.data_proximo_passo) < new Date();
            return (
              <div key={lead.id} className="rounded-lg border border-border bg-card p-3 flex items-center gap-3 hover:border-primary/30 transition-colors">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedLead(lead)}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{lead.fantasia || lead.razao_social}</span>
                    {lead.whatsapp_automacao && <Bot className="h-3.5 w-3.5 text-warning" />}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs font-medium ${isOverdue ? 'text-destructive' : 'text-primary'}`}>
                      Dia {lead.dia_cadencia}: {step}
                    </span>
                    {isOverdue && <span className="text-xs text-destructive">(Atrasado)</span>}
                  </div>
                </div>
                <Button size="sm" onClick={() => setActivityLead(lead)} className="shrink-0">Executar</Button>
              </div>
            );
          })}
        </div>
      )}

      <LeadProfile lead={selectedLead} open={!!selectedLead} onClose={() => setSelectedLead(null)} onSaved={(u) => setSelectedLead(u)} />
      <ActivityModal lead={activityLead} open={!!activityLead} onClose={() => setActivityLead(null)} onDone={handleActivityDone} userId={user?.id} />
    </>
  );
}

