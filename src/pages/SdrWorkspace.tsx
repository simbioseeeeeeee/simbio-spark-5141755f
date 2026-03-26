import { useState, useEffect, useCallback, useMemo } from "react";
import { Lead, CADENCE_STEPS } from "@/types/lead";
import { getCadenciaHoje, getCadenciaConcluidasHoje, getCadenciaAmanha, getDailyMetrics, DailyMetrics } from "@/store/leads-store";
import { useAuth } from "@/contexts/AuthContext";
import { ActivityModal } from "@/components/ActivityModal";
import { LeadProfile } from "@/components/LeadProfile";
import { BatchResearch } from "@/components/BatchResearch";
import { LeadExplorer } from "@/components/LeadExplorer";
import { NewLeadModal } from "@/components/NewLeadModal";
import { AppLayout } from "@/components/AppLayout";
import { TerritorySelector } from "@/components/TerritorySelector";
import { Button } from "@/components/ui/button";
import { Crosshair, Search, Phone, MessageSquare, CalendarCheck, Loader2, Bot, CheckCircle2, CalendarClock } from "lucide-react";
import { CidadeFilter, filterByCidade } from "@/components/CidadeFilter";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { useLocation } from "react-router-dom";

function MetricCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted-foreground text-xs">—</span>;
  const color = score >= 70 ? "bg-success/15 text-success border-success/30"
    : score >= 40 ? "bg-warning/15 text-warning border-warning/30"
    : "bg-destructive/15 text-destructive border-destructive/30";
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold border ${color}`}>{score}</span>;
}

function SdrFocoView() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<DailyMetrics>({ pesquisas_hoje: 0, tentativas_hoje: 0, conexoes_hoje: 0, reunioes_hoje: 0 });
  const [cadencia, setCadencia] = useState<Lead[]>([]);
  const [concluidas, setConcluidas] = useState<Lead[]>([]);
  const [amanha, setAmanha] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [activityLead, setActivityLead] = useState<Lead | null>(null);
  const [showConcluidas, setShowConcluidas] = useState(false);
  const [showAmanha, setShowAmanha] = useState(false);
  const [cidadeFilter, setCidadeFilter] = useState("__all__");

  const filteredCadencia = useMemo(() => filterByCidade(cadencia, cidadeFilter), [cadencia, cidadeFilter]);
  const filteredConcluidas = useMemo(() => filterByCidade(concluidas, cidadeFilter), [concluidas, cidadeFilter]);
  const filteredAmanha = useMemo(() => filterByCidade(amanha, cidadeFilter), [amanha, cidadeFilter]);

  const loadFocoData = useCallback(async () => {
    setLoading(true);
    try {
      const [m, c, done, tomorrow] = await Promise.all([
        getDailyMetrics(),
        getCadenciaHoje(),
        getCadenciaConcluidasHoje(),
        getCadenciaAmanha(),
      ]);
      setMetrics(m);
      setCadencia(c);
      setConcluidas(done);
      setAmanha(tomorrow);
    } catch (err: any) {
      toast({ title: "Erro ao carregar dados", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFocoData(); }, [loadFocoData]);

  const handleActivityDone = (updated: Lead) => {
    setCadencia((prev) => prev.filter((l) => l.id !== updated.id));
    setActivityLead(null);
    loadFocoData();
    toast({ title: "✅ Atividade registrada!", description: `Próximo passo agendado para ${updated.fantasia || updated.razao_social}.` });
  };

  const handleLeadSaved = (updated: Lead) => {
    setCadencia((prev) => prev.map((l) => l.id === updated.id ? updated : l));
    setSelectedLead(updated);
  };


  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Pesquisas Hoje" value={metrics.pesquisas_hoje} icon={Search} color="bg-primary/10 text-primary" />
        <MetricCard label="Tentativas Hoje" value={metrics.tentativas_hoje} icon={Phone} color="bg-warning/10 text-warning" />
        <MetricCard label="Conexões Hoje" value={metrics.conexoes_hoje} icon={MessageSquare} color="bg-success/10 text-success" />
        <MetricCard label="Reuniões Agendadas" value={metrics.reunioes_hoje} icon={CalendarCheck} color="bg-primary/10 text-primary" />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-primary" />
            Foco de Hoje
            <span className="text-muted-foreground font-normal">({filteredCadencia.length} leads)</span>
          </h2>
          <CidadeFilter leads={cadencia} value={cidadeFilter} onChange={setCidadeFilter} />
        </div>
        <div className="flex items-center gap-2">
          <BatchResearch onComplete={loadFocoData} />
          <Button variant="ghost" size="sm" onClick={loadFocoData} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filteredCadencia.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-lg">
          <CalendarCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Nenhuma tarefa pendente!</p>
          <p className="text-sm mt-1">Explore mais leads na aba "Explorador" para alimentar a cadência.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCadencia.map((lead) => {
            const step = CADENCE_STEPS[lead.dia_cadencia] || `Passo ${lead.dia_cadencia + 1}`;
            const isOverdue = lead.data_proximo_passo && new Date(lead.data_proximo_passo) < new Date();
            return (
              <div key={lead.id} className="rounded-lg border border-border bg-card p-3 flex items-center gap-3 hover:border-primary/30 transition-colors">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedLead(lead)}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{lead.fantasia || lead.razao_social}</span>
                    <ScoreBadge score={lead.lead_score} />
                    {lead.whatsapp_automacao && <Bot className="h-3.5 w-3.5 text-warning" />}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs font-medium ${isOverdue ? 'text-destructive' : 'text-primary'}`}>
                      Dia {lead.dia_cadencia}: {step}
                    </span>
                    {isOverdue && <span className="text-xs text-destructive">(Atrasado)</span>}
                    <span className="text-xs text-muted-foreground">· {lead.cidade}</span>
                    <span className="text-xs text-muted-foreground">· {lead.celular1 || lead.telefone1 || "Sem telefone"}</span>
                  </div>
                </div>
                <Button size="sm" onClick={() => setActivityLead(lead)} className="shrink-0">Executar</Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Completed Today */}
      {!loading && filteredConcluidas.length > 0 && (
        <Collapsible open={showConcluidas} onOpenChange={setShowConcluidas}>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-sm font-semibold text-foreground">Concluídas Hoje</span>
            <span className="text-xs text-muted-foreground">({filteredConcluidas.length})</span>
            <span className="text-xs text-muted-foreground ml-auto">{showConcluidas ? "▾" : "▸"}</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2">
            {filteredConcluidas.map((lead) => {
              const step = CADENCE_STEPS[lead.dia_cadencia] || `Passo ${lead.dia_cadencia + 1}`;
              return (
                <div key={lead.id} className="rounded-lg border border-border bg-card/50 p-3 flex items-center gap-3 opacity-70">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedLead(lead)}>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                      <span className="font-medium text-sm truncate">{lead.fantasia || lead.razao_social}</span>
                      <ScoreBadge score={lead.lead_score} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">Dia {lead.dia_cadencia}: {step}</span>
                      <span className="text-xs text-muted-foreground">· {lead.cidade}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Tomorrow's Tasks */}
      {!loading && filteredAmanha.length > 0 && (
        <Collapsible open={showAmanha} onOpenChange={setShowAmanha}>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Amanhã</span>
            <span className="text-xs text-muted-foreground">({filteredAmanha.length})</span>
            <span className="text-xs text-muted-foreground ml-auto">{showAmanha ? "▾" : "▸"}</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2">
            {filteredAmanha.map((lead) => {
              const step = CADENCE_STEPS[lead.dia_cadencia] || `Passo ${lead.dia_cadencia + 1}`;
              return (
                <div key={lead.id} className="rounded-lg border border-dashed border-border bg-card/30 p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedLead(lead)}>
                    <div className="flex items-center gap-2">
                      <CalendarClock className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="font-medium text-sm truncate">{lead.fantasia || lead.razao_social}</span>
                      <ScoreBadge score={lead.lead_score} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-primary">Dia {lead.dia_cadencia}: {step}</span>
                      <span className="text-xs text-muted-foreground">· {lead.cidade}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      )}

      <LeadProfile lead={selectedLead} open={!!selectedLead} onClose={() => setSelectedLead(null)} onSaved={handleLeadSaved} />
      <ActivityModal lead={activityLead} open={!!activityLead} onClose={() => setActivityLead(null)} onDone={handleActivityDone} userId={user?.id} />
    </>
  );
}

function SdrExplorerView({ territorio }: { territorio: string }) {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  if (!territorio) {
    return <div className="text-center py-16 text-muted-foreground">Selecione um território acima para começar.</div>;
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

export default function SdrWorkspace() {
  const location = useLocation();
  const isExplorer = location.pathname.includes("/explorador");
  const [territorio, setTerritorio] = useState("");

  useEffect(() => {
    // Set default territory
    import("@/store/leads-store").then(({ getDistinctCidades }) => {
      getDistinctCidades().then((cities) => {
        const def = cities.includes("CAMPINAS") ? "CAMPINAS" : cities[0] || "";
        setTerritorio(def);
      });
    });
  }, []);

  return (
    <AppLayout headerExtra={isExplorer ? <TerritorySelector value={territorio} onChange={setTerritorio} /> : undefined}>
      {isExplorer ? (
        <SdrExplorerView territorio={territorio} />
      ) : (
        <SdrFocoView />
      )}
    </AppLayout>
  );
}
