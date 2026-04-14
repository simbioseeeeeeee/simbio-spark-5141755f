import { useState, useEffect, useCallback, useMemo } from "react";
import { Lead, ESTAGIO_FUNIL_OPTIONS, EstagioFunil, ESTAGIO_COLORS, Atividade } from "@/types/lead";
import { getKanbanLeads, updateLead, getLeadAtividades, getLeadsLastContact, LastContactInfo } from "@/store/leads-store";
import { supabase } from "@/integrations/supabase/client";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PipelineCard } from "./closer/PipelineCard";
import { PipelineColumn } from "./closer/PipelineColumn";
import { PipelineFilters, PipelineFilterValues } from "./closer/PipelineFilters";

interface Props {
  territorio?: string;
  onSelectLead: (lead: Lead) => void;
}

const COLUMNS: EstagioFunil[] = ESTAGIO_FUNIL_OPTIONS;

export function CloserPipeline({ territorio, onSelectLead }: Props) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [atividades, setAtividades] = useState<Record<string, Atividade[]>>({});
  const [lastContacts, setLastContacts] = useState<Map<string, LastContactInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<PipelineFilterValues>({
    search: "",
    scoreFilter: "all",
    sortBy: "recent",
  });

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
      // Fetch last contacts
      if (data.length > 0) {
        const contacts = await getLeadsLastContact(data.map((l) => l.id));
        setLastContacts(contacts);
      }
    } catch (err: any) {
      toast({ title: "Erro ao carregar pipeline", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [territorio]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime: listen for leads moving to "Reunião Agendada"
  useEffect(() => {
    const channel = supabase
      .channel('closer-pipeline-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads', filter: 'status_sdr=eq.Reunião Agendada' },
        (payload) => {
          const newLead = payload.new as any;
          const oldLead = payload.old as any;
          if (oldLead?.status_sdr !== 'Reunião Agendada' && newLead?.status_sdr === 'Reunião Agendada') {
            const nome = newLead.fantasia || newLead.razao_social || 'Lead';
            toast({
              title: "🔔 Nova Reunião Agendada!",
              description: `${nome} (${newLead.cidade || '—'}) foi movido para o pipeline.`,
            });
            try {
              const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbsGczJjmEw9jUhkMtPXmv0NmcUjhHcKXM2qpfO0pvn8XYsmY+TGueyNS1d0NMdJ7B0bVxREhribrSuXlJUHWXvM+5eElQdJa7z7lwSlF2mL3PuXNLUnabvs+5c0pQdJe80LpyS1J2mLzPuXBKUHSXvM+5');
              audio.volume = 0.3;
              audio.play().catch(() => {});
            } catch {}
            loadData();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  // Apply filters & sorting
  const filteredLeads = useMemo(() => {
    let result = [...leads];

    if (filters.search.trim()) {
      const s = filters.search.toLowerCase();
      result = result.filter((l) =>
        (l.fantasia || "").toLowerCase().includes(s) ||
        (l.razao_social || "").toLowerCase().includes(s) ||
        (l.bairro || "").toLowerCase().includes(s) ||
        (l.cnpj || "").includes(s)
      );
    }

    if (filters.scoreFilter === "high") result = result.filter((l) => (l.lead_score ?? 0) >= 70);
    else if (filters.scoreFilter === "medium") result = result.filter((l) => (l.lead_score ?? 0) >= 40 && (l.lead_score ?? 0) < 70);
    else if (filters.scoreFilter === "low") result = result.filter((l) => (l.lead_score ?? 0) < 40);

    if (filters.sortBy === "score") result.sort((a, b) => (b.lead_score ?? 0) - (a.lead_score ?? 0));
    else if (filters.sortBy === "value") result.sort((a, b) => (b.valor_negocio_estimado ?? 0) - (a.valor_negocio_estimado ?? 0));

    return result;
  }, [leads, filters]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !active) return;

    const leadId = active.id as string;
    const newStage = over.id as EstagioFunil;

    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.estagio_funil === newStage) return;

    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, estagio_funil: newStage } : l)));

    try {
      await updateLead({ ...lead, estagio_funil: newStage });
      toast({ title: "Lead movido", description: `${lead.fantasia || lead.razao_social} → ${newStage}` });
    } catch (err: any) {
      setLeads((prev) => prev.map((l) => (l.id === leadId ? lead : l)));
      toast({ title: "Erro ao mover", description: err.message, variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-2">
      <PipelineFilters filters={filters} onChange={setFilters} />
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {COLUMNS.map((col) => {
              const colLeads = filteredLeads.filter((l) => l.estagio_funil === col);
              const colorClass = ESTAGIO_COLORS[col] || "";
              const totalValue = colLeads.reduce((sum, l) => sum + (l.valor_negocio_estimado ?? 0), 0);
              return (
                <PipelineColumn key={col} id={col} colorClass={colorClass} count={colLeads.length} totalValue={totalValue}>
                  {colLeads.map((lead) => {
                    const lc = lastContacts.get(lead.id);
                    return (
                    <PipelineCard
                      key={lead.id}
                      lead={lead}
                      onClick={() => onSelectLead(lead)}
                      atividades={atividades[lead.id] || []}
                      ultimoContatoEm={lc?.ultimo_contato_em}
                      ultimoContatoTipo={lc?.ultimo_contato_tipo}
                    />
                    );
                  })}
                  
                  {colLeads.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">Vazio</p>
                  )}
                </PipelineColumn>
              );
            })}
          </div>
        </div>
      </DndContext>
    </div>
  );
}
