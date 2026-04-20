import { useEffect, useMemo, useState, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Lead, ORIGEM_OPTIONS, TIPO_OPTIONS } from "@/types/lead";
import {
  getLeadsOverhaul,
  getTabCounts,
  getDistinctResponsaveis,
  StatusTab,
  OverhaulQuery,
  OverhaulResult,
} from "@/store/leads-overhaul-store";
import { OrigemBadge, TipoBadge } from "@/components/OrigemBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { LeadDetailSheet } from "@/components/LeadDetailSheet";
import {
  Search,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Target,
  SlidersHorizontal,
  X,
  Users,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const TABS: { value: StatusTab; label: string }[] = [
  { value: "A Contatar", label: "A Contatar" },
  { value: "Prospectado", label: "Prospectados" },
  { value: "Qualificado", label: "Qualificados" },
  { value: "Reunião Agendada", label: "Reunião Agendada" },
  { value: "Negociação", label: "Negociação" },
  { value: "Cliente Ativo", label: "Clientes Ativos" },
  { value: "Desqualificado", label: "Perdidos" },
  { value: "all", label: "Todos" },
];

export default function LeadsOverhaul() {
  const [tab, setTab] = useState<StatusTab>("A Contatar");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<OverhaulResult>({
    leads: [],
    total: 0,
    page: 0,
    pageSize: 50,
  });
  const [loading, setLoading] = useState(true);
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});

  // filters
  const [origens, setOrigens] = useState<Set<string>>(new Set());
  const [tipos, setTipos] = useState<Set<string>>(new Set());
  const [hideAcelerador, setHideAcelerador] = useState(true);
  const [responsavelId, setResponsavelId] = useState<string>("__all__");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("__all__");
  const [lastDays, setLastDays] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [closerReadyOnly, setCloserReadyOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(true);

  const [responsaveis, setResponsaveis] = useState<
    { user_id: string; nome: string; role: string }[]
  >([]);

  // detail sheet
  const [openSheet, setOpenSheet] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  useEffect(() => {
    getDistinctResponsaveis()
      .then(setResponsaveis)
      .catch((e) => console.warn("Falha ao carregar responsáveis", e));
  }, []);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // reset page on filter changes
  useEffect(() => {
    setPage(0);
  }, [tab, origens, tipos, hideAcelerador, responsavelId, cidade, uf, lastDays, closerReadyOnly]);

  const baseFilters = useMemo(
    () => ({
      origens: origens.size > 0 ? Array.from(origens) : undefined,
      tipos: tipos.size > 0 ? Array.from(tipos) : undefined,
      hideAcelerador: tipos.size > 0 ? false : hideAcelerador,
      responsavelId: responsavelId === "__all__" ? null : responsavelId,
      cidade: cidade.trim() || null,
      uf: uf === "__all__" ? null : uf,
      lastDays: lastDays === "all" ? null : Number(lastDays),
      search: debouncedSearch,
    }),
    [origens, tipos, hideAcelerador, responsavelId, cidade, uf, lastDays, debouncedSearch]
  );

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const q: OverhaulQuery = {
        page,
        tab,
        closerReadyOnly: tab === "Reunião Agendada" && closerReadyOnly,
        ...baseFilters,
      };
      const data = await getLeadsOverhaul(q);
      setResult(data);
    } catch (err) {
      console.error("Erro carregando leads:", err);
    } finally {
      setLoading(false);
    }
  }, [page, tab, baseFilters, closerReadyOnly]);

  const loadCounts = useCallback(async () => {
    try {
      const counts = await getTabCounts(baseFilters);
      setTabCounts(counts);
    } catch (err) {
      console.error("Erro carregando contagens:", err);
    }
  }, [baseFilters]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);
  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const toggleSet = (setter: (s: Set<string>) => void, current: Set<string>, val: string) => {
    const next = new Set(current);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setter(next);
  };

  const clearAllFilters = () => {
    setOrigens(new Set());
    setTipos(new Set());
    setHideAcelerador(true);
    setResponsavelId("__all__");
    setCidade("");
    setUf("__all__");
    setLastDays("all");
    setSearch("");
    setCloserReadyOnly(false);
  };

  const hasActiveFilters =
    origens.size > 0 ||
    tipos.size > 0 ||
    responsavelId !== "__all__" ||
    cidade.trim() ||
    uf !== "__all__" ||
    lastDays !== "all" ||
    debouncedSearch.trim() ||
    closerReadyOnly;

  const totalPages = Math.ceil(result.total / result.pageSize);
  const closerReadyCount = tabCounts["Reunião Agendada"] || 0;

  const waUrl = (num?: string) => {
    if (!num) return "#";
    return `https://wa.me/55${num.replace(/\D/g, "")}`;
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
            <p className="text-sm text-muted-foreground">
              {result.total.toLocaleString("pt-BR")} leads nesta aba
              {hideAcelerador && tipos.size === 0 && " (acelerador oculto)"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 border border-border rounded-md px-3 py-1.5 bg-card">
              <Switch
                id="hide-acelerador"
                checked={hideAcelerador}
                onCheckedChange={setHideAcelerador}
                disabled={tipos.size > 0}
              />
              <Label htmlFor="hide-acelerador" className="text-sm cursor-pointer">
                Ocultar programa acelerador
              </Label>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters((v) => !v)}
              className="gap-2"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
              {hasActiveFilters && <Badge variant="secondary" className="ml-1">!</Badge>}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as StatusTab)}>
          <TabsList className="w-full justify-start flex-wrap h-auto p-1 gap-1">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="gap-2 data-[state=active]:shadow-sm">
                <span>{t.label}</span>
                <Badge variant="secondary" className="text-xs">
                  {(tabCounts[t.value] || 0).toLocaleString("pt-BR")}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex gap-4">
          {/* Sidebar filtros */}
          {showFilters && (
            <aside className="w-64 shrink-0 space-y-5 border border-border rounded-md p-4 bg-card h-fit sticky top-16">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Filtros</h3>
                {hasActiveFilters && (
                  <button
                    onClick={clearAllFilters}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <X className="h-3 w-3" /> Limpar
                  </button>
                )}
              </div>

              {/* Busca */}
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Busca livre</Label>
                <div className="relative mt-1">
                  <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="CNPJ, nome, telefone..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-7 h-8 text-sm"
                  />
                </div>
              </div>

              <Separator />

              {/* Origem */}
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-2 block">Origem</Label>
                <div className="space-y-1.5">
                  {ORIGEM_OPTIONS.map((o) => (
                    <div key={o.value} className="flex items-center gap-2">
                      <Checkbox
                        id={`origem-${o.value}`}
                        checked={origens.has(o.value)}
                        onCheckedChange={() => toggleSet(setOrigens, origens, o.value)}
                      />
                      <label htmlFor={`origem-${o.value}`} className="text-sm cursor-pointer">
                        {o.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Tipo */}
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-2 block">Tipo</Label>
                <div className="space-y-1.5">
                  {TIPO_OPTIONS.map((t) => (
                    <div key={t.value} className="flex items-center gap-2">
                      <Checkbox
                        id={`tipo-${t.value}`}
                        checked={tipos.has(t.value)}
                        onCheckedChange={() => toggleSet(setTipos, tipos, t.value)}
                      />
                      <label htmlFor={`tipo-${t.value}`} className="text-sm cursor-pointer">
                        {t.label}
                        {t.value === "programa_acelerador" && (
                          <span className="text-xs text-muted-foreground"> (oculto default)</span>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Responsável */}
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Responsável SDR</Label>
                <Select value={responsavelId} onValueChange={setResponsavelId}>
                  <SelectTrigger className="h-8 mt-1 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    {responsaveis.map((r) => (
                      <SelectItem key={r.user_id} value={r.user_id}>
                        {r.nome} <span className="text-xs text-muted-foreground">({r.role})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cidade */}
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Cidade</Label>
                <Input
                  placeholder="Ex: São Paulo"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  className="h-8 mt-1 text-sm"
                />
              </div>

              {/* UF */}
              <div>
                <Label className="text-xs font-medium text-muted-foreground">UF</Label>
                <Select value={uf} onValueChange={setUf}>
                  <SelectTrigger className="h-8 mt-1 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas</SelectItem>
                    {["SP", "RJ", "MG", "RS", "PR", "SC", "BA", "GO", "DF", "PE", "CE"].map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Últimos dias */}
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Últimos dias</Label>
                <Select value={lastDays} onValueChange={setLastDays}>
                  <SelectTrigger className="h-8 mt-1 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tudo</SelectItem>
                    <SelectItem value="7">7 dias</SelectItem>
                    <SelectItem value="30">30 dias</SelectItem>
                    <SelectItem value="90">90 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </aside>
          )}

          {/* Conteúdo */}
          <div className="flex-1 space-y-3 min-w-0">
            {/* Card destaque Reunião Agendada → Closer */}
            {tab === "Reunião Agendada" && closerReadyCount > 0 && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <Target className="h-5 w-5 text-primary" />
                    <div>
                      <div className="font-semibold">
                        🎯 {closerReadyCount.toLocaleString("pt-BR")} leads prontos pro Closer
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Reunião agendada + estágio funil preenchido
                      </div>
                    </div>
                  </div>
                  <Button
                    variant={closerReadyOnly ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCloserReadyOnly((v) => !v)}
                  >
                    {closerReadyOnly ? "Mostrar todos" : "Filtrar"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Tabela */}
            <div className="border border-border rounded-md bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Estágio</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Atualizado</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && result.leads.length === 0 ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={8}>
                          <Skeleton className="h-10 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : result.leads.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-16">
                        <div className="text-muted-foreground mb-2">
                          <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                          Nenhum lead encontrado nesta visualização.
                        </div>
                        {hasActiveFilters && (
                          <Button variant="outline" size="sm" onClick={clearAllFilters}>
                            Limpar filtros
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    result.leads.map((lead) => (
                      <TableRow
                        key={lead.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          setSelectedLeadId(lead.id);
                          setOpenSheet(true);
                        }}
                      >
                        <TableCell>
                          <div className="font-medium">{lead.fantasia || lead.razao_social || "—"}</div>
                          {lead.fantasia && lead.razao_social && lead.fantasia !== lead.razao_social && (
                            <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                              {lead.razao_social}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground font-mono">{lead.cnpj}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <OrigemBadge origem={lead.origem_lead} />
                            {lead.tipo_lead === "programa_acelerador" && (
                              <TipoBadge tipo={lead.tipo_lead} />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {lead.cidade ? (
                            <>
                              <div>{lead.cidade}</div>
                              <div className="text-xs text-muted-foreground">{lead.uf}</div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={lead.status_sdr} />
                        </TableCell>
                        <TableCell>
                          {lead.estagio_funil ? (
                            <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">
                              {lead.estagio_funil}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {lead.responsavel_sdr || lead.sdr_id ? (
                            <span>{lead.responsavel_sdr || lead.sdr_id}</span>
                          ) : (
                            <span className="text-muted-foreground">sem resp.</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {lead.updated_at
                            ? formatDistanceToNow(new Date(lead.updated_at), {
                                addSuffix: true,
                                locale: ptBR,
                              })
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          {lead.celular1 && (
                            <a
                              href={waUrl(lead.celular1)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
                              title="WhatsApp"
                            >
                              <MessageCircle className="h-4 w-4 text-green-600" />
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Paginação */}
            {result.total > result.pageSize && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Página {page + 1} de {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= totalPages - 1 || loading}
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <LeadDetailSheet
        open={openSheet}
        onOpenChange={(o) => {
          setOpenSheet(o);
          if (!o) setSelectedLeadId(null);
        }}
        leadId={selectedLeadId}
      />
    </AppLayout>
  );
}
