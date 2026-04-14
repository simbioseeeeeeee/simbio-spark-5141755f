import { useState, useEffect, useCallback } from "react";
import { Lead, STATUS_OPTIONS, CanalPreferido } from "@/types/lead";
import { getLeadsPaginated, LeadsResult, getLeadsLastContact, LastContactInfo } from "@/store/leads-store";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Slider } from "@/components/ui/slider";
import { Search, Loader2, ChevronLeft, ChevronRight, CheckCircle2, Bot, ArrowUpDown, Users, SlidersHorizontal, CalendarIcon, X, Phone, Mail, MessageCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { lastContactColor, lastContactLabel, activityEmoji, CANAL_CONFIG } from "@/lib/contact-helpers";

function ScoreCell({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted-foreground text-xs">—</span>;
  const color = score >= 70 ? "bg-success/15 text-success border-success/30"
    : score >= 40 ? "bg-warning/15 text-warning border-warning/30"
    : "bg-destructive/15 text-destructive border-destructive/30";
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold border ${color}`}>{score}</span>;
}

type QuickFilter = "todos" | "pesquisados" | "nao_pesquisados" | "qualificados" | "desqualificados";

interface Props {
  territorio: string;
  onSelectLead: (lead: Lead) => void;
}

export function LeadExplorer({ territorio, onSelectLead }: Props) {
  const [result, setResult] = useState<LeadsResult>({ leads: [], total: 0, page: 0, pageSize: 50 });
  const [lastContacts, setLastContacts] = useState<Map<string, LastContactInfo>>(new Map());
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pesquisaFilter, setPesquisaFilter] = useState<QuickFilter>("todos");
  const [sortByScore, setSortByScore] = useState(false);
  const [loading, setLoading] = useState(true);

  // Advanced filters
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);
  const [cnaeFilter, setCnaeFilter] = useState("");

  const hasAdvancedFilters = !!dateFrom || !!dateTo || scoreRange[0] > 0 || scoreRange[1] < 100 || !!cnaeFilter.trim();

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(0); }, [statusFilter, pesquisaFilter, sortByScore, territorio, dateFrom, dateTo, scoreRange, cnaeFilter]);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLeadsPaginated({
        page, cidade: territorio, search: debouncedSearch, statusFilter,
        pesquisaFilter: pesquisaFilter === "pesquisados" ? "pesquisados" : pesquisaFilter === "nao_pesquisados" ? "nao_pesquisados" : undefined,
        scoreFilter: pesquisaFilter === "qualificados" ? "qualificados" : undefined,
        desqualificadosFilter: pesquisaFilter === "desqualificados",
        sortByScore,
        dateFrom: dateFrom?.toISOString(),
        dateTo: dateTo ? new Date(dateTo.getTime() + 86400000 - 1).toISOString() : undefined,
        scoreMin: scoreRange[0] > 0 ? scoreRange[0] : undefined,
        scoreMax: scoreRange[1] < 100 ? scoreRange[1] : undefined,
        cnaeFilter: cnaeFilter.trim() || undefined,
      });
      setResult(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, pesquisaFilter, sortByScore, territorio, dateFrom, dateTo, scoreRange, cnaeFilter]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const totalPages = Math.ceil(result.total / result.pageSize);

  const clearAdvancedFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setScoreRange([0, 100]);
    setCnaeFilter("");
  };

  const quickFilters: { key: QuickFilter; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "nao_pesquisados", label: "Não Pesquisados" },
    { key: "pesquisados", label: "Já Pesquisados" },
    { key: "qualificados", label: "Score ≥ 60" },
    { key: "desqualificados", label: "Desqualificados" },
  ];

  return (
    <div className="space-y-4">
      {/* Quick Filters */}
      <div className="flex flex-wrap gap-2">
        {quickFilters.map((f) => (
          <Button key={f.key} variant={pesquisaFilter === f.key ? "default" : "outline"} size="sm" onClick={() => setPesquisaFilter(f.key)}>
            {f.label}
          </Button>
        ))}
        <Button
          variant={showAdvanced ? "default" : hasAdvancedFilters ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="gap-1.5"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtros
          {hasAdvancedFilters && <span className="ml-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">!</span>}
        </Button>
        <Button variant={sortByScore ? "default" : "outline"} size="sm" onClick={() => setSortByScore(!sortByScore)} className="ml-auto gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5" /> Score
        </Button>
      </div>

      {/* Advanced Filters Panel */}
      {showAdvanced && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Filtros Avançados</h3>
            {hasAdvancedFilters && (
              <Button variant="ghost" size="sm" onClick={clearAdvancedFilters} className="gap-1 text-xs text-muted-foreground h-7">
                <X className="h-3 w-3" /> Limpar
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Date Range */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Data de Criação (De)</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Data de Criação (Até)</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {dateTo ? format(dateTo, "dd/MM/yyyy") : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            {/* CNAE Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">CNAE / Segmento</label>
              <Input placeholder="Ex: restaurante, comércio..." value={cnaeFilter} onChange={(e) => setCnaeFilter(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          {/* Score Range */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Faixa de Score</label>
              <span className="text-xs font-mono text-foreground">{scoreRange[0]} – {scoreRange[1]}</span>
            </div>
            <Slider
              min={0}
              max={100}
              step={5}
              value={scoreRange}
              onValueChange={(v) => setScoreRange(v as [number, number])}
              className="w-full"
            />
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, CNPJ, bairro, telefone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : result.total === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Nenhum lead encontrado</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[32px]"></TableHead>
                  <TableHead className="w-[140px]">Status</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="w-[160px]">CNPJ</TableHead>
                  <TableHead className="w-[140px]">Celular</TableHead>
                  <TableHead className="w-[100px]">Bairro</TableHead>
                  <TableHead className="w-[70px] text-center">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.leads.map((lead) => (
                  <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => onSelectLead(lead)}>
                    <TableCell className="px-2">
                      {lead.pesquisa_realizada && <span title="Pesquisa realizada"><CheckCircle2 className="h-4 w-4 text-success" /></span>}
                    </TableCell>
                    <TableCell><StatusBadge status={lead.status_sdr} /></TableCell>
                    <TableCell className="font-medium">{lead.fantasia || lead.razao_social}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{lead.cnpj}</TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        {lead.celular1 || "—"}
                        {lead.whatsapp_automacao && <Bot className="h-3.5 w-3.5 text-warning" />}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{lead.bairro}</TableCell>
                    <TableCell className="text-center"><ScoreCell score={lead.lead_score} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="px-4 py-3 border-t border-border flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {page * result.pageSize + 1}–{Math.min((page + 1) * result.pageSize, result.total)} de {result.total}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>
              <span className="text-sm text-muted-foreground">{page + 1}/{totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                Próximo <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
