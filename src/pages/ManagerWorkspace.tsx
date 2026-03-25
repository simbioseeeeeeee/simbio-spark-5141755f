import { useState, useEffect, useCallback } from "react";
import { Lead } from "@/types/lead";
import { getManagerAnalytics, getLeaderboard, getActivityTrend, getConversionFunnel, ManagerAnalytics, LeaderboardEntry, ActivityTrendEntry, FunnelEntry, getCadenciaHoje, getDailyMetrics, DailyMetrics } from "@/store/leads-store";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { TerritorySelector } from "@/components/TerritorySelector";
import { CloserPipeline } from "@/components/CloserPipeline";
import { LeadExplorer } from "@/components/LeadExplorer";
import { LeadProfile } from "@/components/LeadProfile";
import { NewLeadModal } from "@/components/NewLeadModal";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users, Activity, CalendarCheck, DollarSign, Trophy, Loader2, Target, BarChart3,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useLocation } from "react-router-dom";
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from "recharts";

function KpiCard({ label, value, icon: Icon, color, prefix }: { label: string; value: string | number; icon: any; color: string; prefix?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
      <p className="text-3xl font-bold">{prefix}{value}</p>
    </div>
  );
}

const ROLE_BADGE: Record<string, string> = {
  sdr: "bg-primary/15 text-primary",
  closer: "bg-success/15 text-success",
  manager: "bg-warning/15 text-warning",
};

function AnalyticsView({ territorio }: { territorio: string }) {
  const [period, setPeriod] = useState<number>(1);
  const [analytics, setAnalytics] = useState<ManagerAnalytics | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [trend, setTrend] = useState<ActivityTrendEntry[]>([]);
  const [funnel, setFunnel] = useState<FunnelEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const cidade = territorio || null;
      const [a, l, t, f] = await Promise.all([
        getManagerAnalytics(cidade, period),
        getLeaderboard(cidade, period),
        getActivityTrend(cidade, period < 7 ? 7 : period),
        getConversionFunnel(cidade),
      ]);
      setAnalytics(a);
      setLeaderboard(l);
      setTrend(t);
      setFunnel(f);
    } catch (err: any) {
      toast({ title: "Erro ao carregar analytics", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [territorio, period]);

  useEffect(() => { loadData(); }, [loadData]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(val);

  if (loading || !analytics) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

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
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Leads Qualificados" value={Number(analytics.total_leads_qualificados)} icon={Users} color="bg-primary/10 text-primary" />
        <KpiCard label="Atividades Executadas" value={Number(analytics.total_atividades)} icon={Activity} color="bg-warning/10 text-warning" />
        <KpiCard label="Reuniões Agendadas" value={Number(analytics.total_reunioes)} icon={CalendarCheck} color="bg-success/10 text-success" />
        <KpiCard label="Fechamentos Ganhos" value={Number(analytics.total_fechamentos)} icon={Target} color="bg-success/10 text-success" />
        <KpiCard label="Pipeline (R$)" value={formatCurrency(Number(analytics.valor_pipeline))} icon={DollarSign} color="bg-primary/10 text-primary" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Activity Trend */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Atividades por Dia
          </h3>
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
                <XAxis dataKey="dia" tickFormatter={(v) => { const d = new Date(v + 'T12:00:00'); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); }} className="text-xs fill-muted-foreground" />
                <YAxis className="text-xs fill-muted-foreground" />
                <RechartsTooltip labelFormatter={(v) => new Date(v + 'T12:00:00').toLocaleDateString('pt-BR')} />
                <Area type="monotone" dataKey="total_atividades" name="Atividades" stroke="hsl(var(--primary))" fill="url(#gradAtiv)" strokeWidth={2} />
                <Area type="monotone" dataKey="total_reunioes" name="Reuniões" stroke="hsl(142 76% 36%)" fill="url(#gradReun)" strokeWidth={2} />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Conversion Funnel */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-success" />
            Funil de Conversão
          </h3>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" className="text-xs fill-muted-foreground" />
                <YAxis dataKey="etapa" type="category" width={120} className="text-xs fill-muted-foreground" />
                <RechartsTooltip />
                <Bar dataKey="total" name="Leads" radius={[0, 4, 4, 0]}>
                  {funnel.map((entry, index) => {
                    const colors = ['hsl(var(--primary))', 'hsl(38 92% 50%)', 'hsl(142 76% 36%)', 'hsl(142 76% 26%)', 'hsl(var(--destructive))'];
                    return <Cell key={entry.etapa} fill={colors[index % colors.length]} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Trophy className="h-4 w-4 text-warning" />
          Ranking da Equipe
        </h3>

        {leaderboard.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-lg text-muted-foreground">
            <Trophy className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhum dado ainda</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
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
          </div>
        )}
      </div>
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
