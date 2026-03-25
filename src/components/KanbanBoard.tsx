import { useState } from "react";
import { Lead, ESTAGIO_FUNIL_OPTIONS, EstagioFunil, ESTAGIO_COLORS } from "@/types/lead";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Calendar, DollarSign, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { updateLead } from "@/store/leads-store";
import { toast } from "@/hooks/use-toast";

interface Props {
  leads: Lead[];
  onSelectLead: (lead: Lead) => void;
  onLeadUpdated: (lead: Lead) => void;
}

export function KanbanBoard({ leads, onSelectLead, onLeadUpdated }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const kanbanLeads = leads.filter(
    (l) => l.status_sdr === "Reunião Agendada" || l.estagio_funil
  );

  const activeLead = kanbanLeads.find((l) => l.id === activeId) || null;

  const getLeadsForStage = (stage: EstagioFunil) =>
    kanbanLeads.filter((l) => l.estagio_funil === stage);

  const unassigned = kanbanLeads.filter((l) => !l.estagio_funil);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const leadId = active.id as string;
    const newStage = over.id as string;
    const lead = kanbanLeads.find((l) => l.id === leadId);
    if (!lead) return;

    const currentStage = lead.estagio_funil || "__unassigned";
    if (currentStage === newStage) return;

    const updatedLead: Lead = {
      ...lead,
      estagio_funil: newStage === "__unassigned" ? null : (newStage as EstagioFunil),
    };

    try {
      const saved = await updateLead(updatedLead);
      onLeadUpdated(saved);
      toast({ title: "Lead movido", description: `${lead.fantasia || lead.razao_social} → ${newStage === "__unassigned" ? "Sem Estágio" : newStage}` });
    } catch (err: any) {
      toast({ title: "Erro ao mover lead", description: err.message, variant: "destructive" });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {unassigned.length > 0 && (
          <KanbanColumn
            id="__unassigned"
            title="Sem Estágio"
            color="bg-muted text-muted-foreground"
            leads={unassigned}
            onSelectLead={onSelectLead}
          />
        )}
        {ESTAGIO_FUNIL_OPTIONS.map((stage) => (
          <KanbanColumn
            key={stage}
            id={stage}
            title={stage}
            color={ESTAGIO_COLORS[stage]}
            leads={getLeadsForStage(stage)}
            onSelectLead={onSelectLead}
          />
        ))}
      </div>
      <DragOverlay>
        {activeLead && <LeadCard lead={activeLead} isDragging />}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  id,
  title,
  color,
  leads,
  onSelectLead,
}: {
  id: string;
  title: string;
  color: string;
  leads: Lead[];
  onSelectLead: (lead: Lead) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-w-[260px] w-[260px] flex-shrink-0 rounded-lg p-2 transition-colors",
        isOver && "bg-accent/50"
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <Badge variant="secondary" className={cn("text-xs", color)}>
          {title}
        </Badge>
        <span className="text-xs text-muted-foreground">({leads.length})</span>
      </div>
      <div className="space-y-2">
        {leads.map((lead) => (
          <DraggableCard key={lead.id} lead={lead} onSelectLead={onSelectLead} />
        ))}
        {leads.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhum lead</p>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ lead, onSelectLead }: { lead: Lead; onSelectLead: (lead: Lead) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <LeadCard lead={lead} dragListeners={listeners} onClick={() => onSelectLead(lead)} />
    </div>
  );
}

function LeadCard({
  lead,
  isDragging,
  dragListeners,
  onClick,
}: {
  lead: Lead;
  isDragging?: boolean;
  dragListeners?: Record<string, any>;
  onClick?: () => void;
}) {
  return (
    <Card
      className={cn(
        "cursor-pointer hover:shadow-md transition-shadow border-border",
        isDragging && "shadow-lg ring-2 ring-primary/30"
      )}
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-1">
          <button
            className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground flex-shrink-0 touch-none"
            {...dragListeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <Building2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-sm font-medium leading-tight truncate">
            {lead.fantasia || lead.razao_social}
          </p>
        </div>
        <p className="text-xs text-muted-foreground truncate">{lead.cidade}/{lead.uf}</p>
        {lead.valor_negocio_estimado && (
          <div className="flex items-center gap-1 text-xs text-success">
            <DollarSign className="h-3 w-3" />
            R$ {lead.valor_negocio_estimado.toLocaleString("pt-BR")}
          </div>
        )}
        {lead.data_proximo_passo && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {new Date(lead.data_proximo_passo).toLocaleDateString("pt-BR")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
