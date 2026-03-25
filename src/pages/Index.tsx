import { useState, useEffect, useCallback } from "react";
import { Lead, LeadStatus, STATUS_OPTIONS } from "@/types/lead";
import { getLeadsPaginated, getStatusCounts, getDistinctUFs, getDistinctCidades, LeadsResult } from "@/store/leads-store";
import { StatusBadge } from "@/components/StatusBadge";
import { LeadProfile } from "@/components/LeadProfile";
import { KanbanBoard } from "@/components/KanbanBoard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Search, Users, List, Columns3, Loader2, ChevronLeft, ChevronRight, Bot } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function Index() {
  const [result, setResult] = useState<LeadsResult>({ leads: [], total: 0, page: 0, pageSize: 50 });
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ufFilter, setUfFilter] = useState<string>("all");
  const [cidadeFilter, setCidadeFilter] = useState<string>("all");
  const [ufs, setUfs] = useState<string[]>([]);
  const [cidades, setCidades] = useState<string[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [view, setView] = useState<"sdr" | "closer">("sdr");
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({ all: 0 });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [statusFilter, ufFilter, cidadeFilter]);

  // Load UFs on mount
  useEffect(() => {
    getDistinctUFs().then(setUfs).catch(() => {});
  }, []);

  // Load cidades when UF changes
  useEffect(() => {
    setCidadeFilter("all");
    if (ufFilter !== "all") {
      getDistinctCidades(ufFilter).then(setCidades).catch(() => {});
    } else {
      setCidades([]);
    }
  }, [ufFilter]);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const [data, statusCounts] = await Promise.all([
        getLeadsPaginated({ page, search: debouncedSearch, statusFilter, cidadeFilter, ufFilter }),
        getStatusCounts(),
      ]);
      setResult(data);
      setCounts(statusCounts);
    } catch (err: any) {
      toast({ title: "Erro ao carregar leads", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, ufFilter, cidadeFilter]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const totalPages = Math.ceil(result.total / result.pageSize);

  const handleSaved = (updated: Lead) => {
    setResult((prev) => ({
      ...prev,
      leads: prev.leads.map((l) => (l.id === updated.id ? updated : l)),
    }));
    setSelectedLead(updated);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">CRM Simbiose</h1>
              <p className="text-xs text-muted-foreground">Prospecção & Qualificação B2B</p>
            </div>
          </div>
          <Tabs value={view} onValueChange={(v) => setView(v as "sdr" | "closer")}>
            <TabsList>
              <TabsTrigger value="sdr" className="gap-1.5"><List className="h-4 w-4" /> SDR</TabsTrigger>
              <TabsTrigger value="closer" className="gap-1.5"><Columns3 className="h-4 w-4" /> Closer</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: counts.all, color: "bg-primary/10 text-primary" },
            { label: "A Contatar", value: counts["A Contatar"] || 0, color: "bg-muted text-muted-foreground" },
            { label: "Em Qualificação", value: counts["Em Qualificação"] || 0, color: "bg-warning/10 text-warning" },
            { label: "Reunião Agendada", value: counts["Reunião Agendada"] || 0, color: "bg-info/10 text-info" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
            </div>
          ))}
        </div>

        {view === "sdr" && (
          <>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, CNPJ, bairro, cidade ou telefone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={ufFilter} onValueChange={setUfFilter}>
                <SelectTrigger className="w-full sm:w-[140px]">
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas UFs</SelectItem>
                  {ufs.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                </SelectContent>
              </Select>
              {ufFilter !== "all" && (
                <Select value={cidadeFilter} onValueChange={setCidadeFilter}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="Cidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as cidades</SelectItem>
                    {cidades.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : result.total === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium">Nenhum lead encontrado</p>
                <p className="text-sm mt-1">Ajuste os filtros ou importe dados pelo painel do banco.</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[180px]">Status</TableHead>
                        <TableHead>Razão Social</TableHead>
                        <TableHead className="w-[180px]">CNPJ</TableHead>
                        <TableHead className="w-[160px]">Celular</TableHead>
                        <TableHead className="w-[150px]">Cidade/UF</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.leads.map((lead) => (
                        <TableRow
                          key={lead.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => setSelectedLead(lead)}
                        >
                          <TableCell><StatusBadge status={lead.status_sdr} /></TableCell>
                          <TableCell className="font-medium">{lead.fantasia || lead.razao_social}</TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">{lead.cnpj}</TableCell>
                          <TableCell className="text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              {lead.celular1 || "—"}
                              {lead.whatsapp_automacao && (
                                <span title="WhatsApp com automação (Bot)"><Bot className="h-3.5 w-3.5 text-warning" /></span>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{lead.cidade}/{lead.uf}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {/* Pagination */}
                <div className="px-4 py-3 border-t border-border flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Mostrando {page * result.pageSize + 1}–{Math.min((page + 1) * result.pageSize, result.total)} de {result.total} leads
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {page + 1} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Próximo <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {view === "closer" && (
          <KanbanBoard onSelectLead={setSelectedLead} onLeadUpdated={handleSaved} />
        )}
      </main>

      <LeadProfile lead={selectedLead} open={!!selectedLead} onClose={() => setSelectedLead(null)} onSaved={handleSaved} />
    </div>
  );
}
