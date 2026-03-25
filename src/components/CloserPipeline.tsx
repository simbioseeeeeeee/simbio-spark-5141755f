import { useState, useEffect, useCallback } from "react";
import { Lead, ESTAGIO_FUNIL_OPTIONS, EstagioFunil, ESTAGIO_COLORS, Atividade } from "@/types/lead";
import { getKanbanLeads, updateLead, getLeadAtividades } from "@/store/leads-store";
import { DndContext, DragEndEvent, useDroppable, useDraggable, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { Loader2, GripVertical } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  territorio?: string;
  onSelectLead: (lead: Lead) => void;
}

const COLUMNS: EstagioFunil[] = ESTAGIO_FUNIL_OPTIONS;

function DroppableColumn({ id, children, colorClass, count }: { id: string; children: React.ReactNode; colorClass: string; count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className="w-[280px] shrink-0">
      <div className={`rounded-t-lg px-3 py-2 flex items-center justify-between ${colorClass}`}>
        <span className="text-sm font-semibold">{id}</span>
        <span className="text-xs font-bold">{count}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`bg-muted/30 rounded-b-lg p-2 space-y-2 min-h-[200px] transition-colors ${isOver ? "ring-2 ring-primary/40 bg-primary/5" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}

function DraggableCard({ lead, onClick, atividades }: { lead: Lead; onClick: () => void; atividades: Atividade[] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: isDragging ? 999 : undefined, opacity: isDragging ? 0.5 : 1 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-border bg-card p-3 hover:border-primary/30 transition-colors space-y-2 group"
    >
      <div className="flex items-start gap-2">
        <div
          {...listeners}
          {...attributes}
          className="cursor-grab active:cursor-grabbing pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onClick}>
          <p className="font-medium text-sm truncate">{lead.fantasia || lead.razao_social}</p>
          <p className="text-xs text-muted-foreground">{lead.bairro} · {lead.celular1 || lead.telefone1 || "—"}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {lead.lead_score !== null && (
          <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-bold ${
            lead.lead_score >= 70 ? "bg-success/15 text-success" : lead.lead_score >= 40 ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"
          }`}>{lead.lead_score} pts</span>
        )}
        {lead.valor_negocio_estimado != null && lead.valor_negocio_estimado > 0 && (
          <span className="text-xs text-muted-foreground">
            R$ {lead.valor_negocio_estimado.toLocaleString("pt-BR")}
          </span>
        )}
      </div>
      {atividades.length > 0 && (
        <div className="border-t border-border pt-2 space-y-1">
          {atividades.slice(0, 3).map((a) => (
            <div key={a.id} className="text-xs text-muted-foreground flex gap-1.5">
              <span className="font-medium text-foreground/70">{a.tipo_atividade}</span>
              <span>→ {a.resultado}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CloserPipeline({ territorio, onSelectLead }: Props) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [atividades, setAtividades] = useState<Record<string, Atividade[]>>({});
  const [loading, setLoading] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getKanbanLeads(territorio);
      setLeads(data);
      const atvsMap: Record<string, Atividade[]> = {};
      await Promise.all(
        data.slice(0, 50).map(async (lead) => {
          try {
            atvsMap[lead.id] = await getLeadAtividades(lead.id, 3);
          } catch { atvsMap[lead.id] = []; }
        })
      );
      setAtividades(atvsMap);
    } catch (err: any) {
      toast({ title: "Erro ao carregar pipeline", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [territorio]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !active) return;

    const leadId = active.id as string;
    const newStage = over.id as EstagioFunil;

    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.estagio_funil === newStage) return;

    // Optimistic update
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, estagio_funil: newStage } : l)));

    try {
      await updateLead({ ...lead, estagio_funil: newStage });
      toast({ title: "Lead movido", description: `${lead.fantasia || lead.razao_social} → ${newStage}` });
    } catch (err: any) {
      // Rollback
      setLeads((prev) => prev.map((l) => (l.id === leadId ? lead : l)));
      toast({ title: "Erro ao mover", description: err.message, variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {COLUMNS.map((col) => {
            const colLeads = leads.filter((l) => l.estagio_funil === col);
            const colorClass = ESTAGIO_COLORS[col] || "";
            return (
              <DroppableColumn key={col} id={col} colorClass={colorClass} count={colLeads.length}>
                {colLeads.map((lead) => (
                  <DraggableCard
                    key={lead.id}
                    lead={lead}
                    onClick={() => onSelectLead(lead)}
                    atividades={atividades[lead.id] || []}
                  />
                ))}
                {colLeads.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">Vazio</p>
                )}
              </DroppableColumn>
            );
          })}
        </div>
      </div>
    </DndContext>
  );
}
