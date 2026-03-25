import { useState, useEffect, useMemo } from "react";
import { Lead, LeadStatus, STATUS_OPTIONS } from "@/types/lead";
import { getLeads } from "@/store/leads-store";
import { CSVImport } from "@/components/CSVImport";
import { StatusBadge } from "@/components/StatusBadge";
import { LeadProfile } from "@/components/LeadProfile";
import { KanbanBoard } from "@/components/KanbanBoard";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Search, Users, List, Columns3, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function Index() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [view, setView] = useState<"sdr" | "closer">("sdr");
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const data = await getLeads();
      setLeads(data);
    } catch (err: any) {
      toast({ title: "Erro ao carregar leads", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    let list = leads;
    if (statusFilter !== "all") list = list.filter((l) => l.status_sdr === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((l) =>
        l.razao_social.toLowerCase().includes(q) ||
        l.fantasia.toLowerCase().includes(q) ||
        l.cnpj.includes(q) ||
        l.bairro.toLowerCase().includes(q) ||
        l.telefone1.includes(q) ||
        l.celular1.includes(q)
      );
    }
    return list;
  }, [leads, search, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length };
    STATUS_OPTIONS.forEach((s) => (c[s] = leads.filter((l) => l.status_sdr === s).length));
    return c;
  }, [leads]);

  const handleSaved = (updated: Lead) => {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
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
          <div className="flex items-center gap-3">
            <Tabs value={view} onValueChange={(v) => setView(v as "sdr" | "closer")}>
              <TabsList>
                <TabsTrigger value="sdr" className="gap-1.5"><List className="h-4 w-4" /> SDR</TabsTrigger>
                <TabsTrigger value="closer" className="gap-1.5"><Columns3 className="h-4 w-4" /> Closer</TabsTrigger>
              </TabsList>
            </Tabs>
            <CSVImport onImported={reload} />
          </div>
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
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome, CNPJ, bairro ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : leads.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium">Nenhum lead importado</p>
                <p className="text-sm mt-1">Use o botão "Importar CSV" para começar.</p>
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
                        <TableHead className="w-[150px]">Cidade/UF</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((lead) => (
                        <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedLead(lead)}>
                          <TableCell><StatusBadge status={lead.status_sdr} /></TableCell>
                          <TableCell className="font-medium">{lead.fantasia || lead.razao_social}</TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">{lead.cnpj}</TableCell>
                          <TableCell className="text-muted-foreground">{lead.cidade}/{lead.uf}</TableCell>
                        </TableRow>
                      ))}
                      {filtered.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum lead encontrado com os filtros aplicados.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
                  {filtered.length} de {leads.length} leads
                </div>
              </div>
            )}
          </>
        )}

        {view === "closer" && (
          loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <KanbanBoard leads={leads} onSelectLead={setSelectedLead} onLeadUpdated={handleSaved} />
          )
        )}
      </main>

      <LeadProfile lead={selectedLead} open={!!selectedLead} onClose={() => setSelectedLead(null)} onSaved={handleSaved} />
    </div>
  );
}
