import { useState, useEffect, useCallback } from "react";
import { Lead, CADENCE_STEPS } from "@/types/lead";
import { getCadenciaHoje, getDailyMetrics, DailyMetrics, getDistinctCidades } from "@/store/leads-store";
import { ActivityModal } from "@/components/ActivityModal";
import { LeadProfile } from "@/components/LeadProfile";
import { BatchResearch } from "@/components/BatchResearch";
import { LeadExplorer } from "@/components/LeadExplorer";
import { CloserPipeline } from "@/components/CloserPipeline";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Crosshair, List, Columns3, Search, Phone, MessageSquare, CalendarCheck, Loader2, Bot, Sparkles, MapPin } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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

export default function Index() {
  const [territorio, setTerritorio] = useState<string>("");
  const [cidades, setCidades] = useState<string[]>([]);
  const [view, setView] = useState<"foco" | "explorador" | "closer">("foco");
  const [metrics, setMetrics] = useState<DailyMetrics>({ pesquisas_hoje: 0, tentativas_hoje: 0, conexoes_hoje: 0, reunioes_hoje: 0 });
  const [cadencia, setCadencia] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [activityLead, setActivityLead] = useState<Lead | null>(null);

  // Load cities on mount
  useEffect(() => {
    getDistinctCidades().then((cities) => {
      setCidades(cities);
      // Default to Campinas if available
      const defaultCity = cities.includes("CAMPINAS") ? "CAMPINAS" : cities[0] || "";
      setTerritorio(defaultCity);
    }).catch(() => {});
  }, []);

  const loadFocoData = useCallback(async () => {
    if (!territorio) return;
    setLoading(true);
    try {
      const [m, c] = await Promise.all([
        getDailyMetrics(territorio),
        getCadenciaHoje(territorio),
      ]);
      setMetrics(m);
      setCadencia(c);
    } catch (err: any) {
      toast({ title: "Erro ao carregar dados", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [territorio]);

  useEffect(() => { if (territorio) loadFocoData(); }, [loadFocoData, territorio]);

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Building2 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground hidden sm:inline">Simbiose Sales OS</span>
          </div>

          {/* Territory Selector */}
          <div className="flex items-center gap-2 ml-auto sm:ml-4">
            <MapPin className="h-4 w-4 text-primary" />
            <Select value={territorio} onValueChange={setTerritorio}>
              <SelectTrigger className="w-[200px] border-primary/30">
                <SelectValue placeholder="Selecione o território..." />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {cidades.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Tabs value={view} onValueChange={(v) => setView(v as any)} className="ml-auto">
            <TabsList>
              <TabsTrigger value="foco" className="gap-1.5"><Crosshair className="h-3.5 w-3.5" /> Foco</TabsTrigger>
              <TabsTrigger value="explorador" className="gap-1.5"><List className="h-3.5 w-3.5" /> Leads</TabsTrigger>
              <TabsTrigger value="closer" className="gap-1.5"><Columns3 className="h-3.5 w-3.5" /> Pipeline</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 space-y-5">
        {!territorio ? (
          <div className="text-center py-20 text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="text-lg font-medium">Selecione um território para começar</p>
          </div>
        ) : (
          <>
            {view === "foco" && (
              <>
                {/* Metrics */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <MetricCard label="Pesquisas Hoje" value={metrics.pesquisas_hoje} icon={Search} color="bg-primary/10 text-primary" />
                  <MetricCard label="Tentativas Hoje" value={metrics.tentativas_hoje} icon={Phone} color="bg-warning/10 text-warning" />
                  <MetricCard label="Conexões Hoje" value={metrics.conexoes_hoje} icon={MessageSquare} color="bg-success/10 text-success" />
                  <MetricCard label="Reuniões Agendadas" value={metrics.reunioes_hoje} icon={CalendarCheck} color="bg-info/10 text-info" />
                </div>

                {/* Task List Header */}
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Crosshair className="h-4 w-4 text-primary" />
                    Foco de Hoje — {territorio}
                    <span className="text-muted-foreground font-normal">({cadencia.length} leads)</span>
                  </h2>
                  <Button variant="ghost" size="sm" onClick={loadFocoData} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
                  </Button>
                </div>

                {/* Cadence Task List */}
                {loading ? (
                  <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                ) : cadencia.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-lg">
                    <CalendarCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">Nenhuma tarefa pendente!</p>
                    <p className="text-sm mt-1">Explore mais leads na aba "Leads" para alimentar a cadência.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cadencia.map((lead) => {
                      const step = CADENCE_STEPS[lead.dia_cadencia] || `Passo ${lead.dia_cadencia + 1}`;
                      const isOverdue = lead.data_proximo_passo && new Date(lead.data_proximo_passo) < new Date();
                      return (
                        <div
                          key={lead.id}
                          className="rounded-lg border border-border bg-card p-3 flex items-center gap-3 hover:border-primary/30 transition-colors"
                        >
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
                              <span className="text-xs text-muted-foreground">· {lead.celular1 || lead.telefone1 || "Sem telefone"}</span>
                            </div>
                          </div>
                          <Button size="sm" onClick={() => setActivityLead(lead)} className="shrink-0">
                            Executar
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {view === "explorador" && (
              <LeadExplorer
                territorio={territorio}
                onSelectLead={setSelectedLead}
              />
            )}

            {view === "closer" && (
              <CloserPipeline
                territorio={territorio}
                onSelectLead={setSelectedLead}
              />
            )}
          </>
        )}
      </main>

      {/* Lead Profile Sheet */}
      <LeadProfile
        lead={selectedLead}
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        onSaved={handleLeadSaved}
      />

      {/* Activity Registration Modal */}
      <ActivityModal
        lead={activityLead}
        open={!!activityLead}
        onClose={() => setActivityLead(null)}
        onDone={handleActivityDone}
      />
    </div>
  );
}
