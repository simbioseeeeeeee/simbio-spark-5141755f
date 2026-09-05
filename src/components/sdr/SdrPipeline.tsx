import { useCallback, useEffect, useMemo, useState } from "react";
import { DndContext, type DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { GripVertical, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeadProfile } from "@/components/LeadProfile";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/api-error";
import { getSdrPipelineLeads, SDR_PIPELINE_STATUSES, transitionSdrStatus } from "@/store/leads-store";
import { type Lead, type LeadStatus, STATUS_COLORS } from "@/types/lead";
import { toast } from "@/hooks/use-toast";

// Avanço livre (decisão CEO 01/09): arraste direto pra qualquer coluna, exceto
// "Reunião Agendada" (essa nasce do botão Agendar, que cria o evento no Calendar).
const DIRECT_DND_TARGETS = new Set<LeadStatus>([
  "A Contatar", "Prospectado", "Em Qualificação", "Qualificado",
  "Nurturing", "Desqualificado", "Opt-out", "Arquivo Morto", "Cliente Ativo",
]);

function SdrColumn({ status, leads, onOpen }: { status: LeadStatus; leads: Lead[]; onOpen: (lead: Lead) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section className="w-[280px] shrink-0" aria-labelledby={`sdr-column-${status}`}>
      <div className={`rounded-t-lg px-3 py-2 ${STATUS_COLORS[status]}`}>
        <div className="flex items-center justify-between">
          <h3 id={`sdr-column-${status}`} className="text-sm font-semibold">{status}</h3>
          <span className="text-xs font-bold" aria-label={`${leads.length} leads`}>{leads.length}</span>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[220px] space-y-2 rounded-b-lg bg-muted/30 p-2 transition-colors ${isOver ? "bg-primary/5 ring-2 ring-primary/40" : ""}`}
      >
        {leads.map((lead) => <SdrCard key={lead.id} lead={lead} onOpen={() => onOpen(lead)} />)}
        {leads.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">Nenhum lead</p>}
      </div>
    </section>
  );
}
function SdrCard({ lead, onOpen }: { lead: Lead; onOpen: () => void }) {
  const draggable = DIRECT_DND_TARGETS.has(lead.status_sdr) || lead.status_sdr === "A Contatar";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    disabled: !draggable,
  });
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.55 : 1, zIndex: 30 }
    : undefined;

  return (
    <article ref={setNodeRef} style={style} className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start gap-2">
        {draggable ? (
          <button
            type="button"
            {...listeners}
            {...attributes}
            className="min-h-6 min-w-6 cursor-grab rounded text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Arrastar ${lead.fantasia || lead.razao_social}`}
          >
            <GripVertical className="mx-auto h-4 w-4" aria-hidden="true" />
          </button>
        ) : <span className="w-6" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{lead.fantasia || lead.razao_social}</p>
          <p className="truncate text-xs text-muted-foreground">{lead.cidade || "Sem cidade"} · {lead.origem_lead || "sem origem"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Fit {lead.fit_score ?? "—"}/100</p>
        </div>
      </div>
      <Button type="button" variant="ghost" size="sm" className="mt-2 w-full" onClick={onOpen}>
        Abrir ficha e alterar
      </Button>
    </article>
  );
}

export function SdrPipeline() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setLeads(await getSdrPipelineLeads());
    } catch (error: unknown) {
      setLoadError(errorMessage(error, "Não foi possível carregar o funil SDR."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("sdr-pipeline-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const visibleLeads = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return leads;
    return leads.filter((lead) => [lead.fantasia, lead.razao_social, lead.cnpj, lead.cidade]
      .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(term)));
  }, [leads, search]);

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const lead = leads.find((item) => item.id === active.id);
    const target = over.id as LeadStatus;
    if (!lead || lead.status_sdr === target) return;

    if (!DIRECT_DND_TARGETS.has(target)) {
      setSelectedLead(lead);
      toast({
        title: "Complete a transição na ficha",
        description: `${target} exige validação ou dados adicionais e não é aplicado diretamente pelo arraste.`,
      });
      return;
    }

    try {
      const updated = await transitionSdrStatus(lead, target);
      setLeads((current) => current.map((item) => item.id === updated.id ? updated : item));
      toast({ title: "Status atualizado", description: `${lead.fantasia || lead.razao_social} → ${target}` });
    } catch (error: unknown) {
      toast({
        title: "O card permaneceu na etapa anterior",
        description: errorMessage(error, "A alteração não foi confirmada pelo banco."),
        variant: "destructive",
      });
      void load();
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={load}>Tentar novamente</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Funil SDR</h2>
          <p className="text-xs text-muted-foreground">Nurturing e estados encerrados ficam ocultos; reunião é apenas o handoff para o closer.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Buscar no funil SDR" aria-label="Buscar lead no funil SDR" />
        </div>
      </div>

      {visibleLeads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">Nenhum lead encontrado.</div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="overflow-x-auto pb-4">
            <div className="flex min-w-max gap-4">
              {SDR_PIPELINE_STATUSES.map((status) => (
                <SdrColumn
                  key={status}
                  status={status}
                  leads={visibleLeads.filter((lead) => lead.status_sdr === status)}
                  onOpen={setSelectedLead}
                />
              ))}
            </div>
          </div>
        </DndContext>
      )}

      <LeadProfile
        lead={selectedLead}
        open={Boolean(selectedLead)}
        onClose={() => setSelectedLead(null)}
        onSaved={(updated) => {
          setSelectedLead(updated);
          void load();
        }}
      />
    </div>
  );
}
