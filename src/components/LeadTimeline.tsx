import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Phone, Mail, MessageCircle, Calendar, FileText, StickyNote, Instagram } from "lucide-react";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface TimelineEntry {
  id: string;
  tipo_atividade: string;
  resultado: string;
  nota: string;
  created_at: string;
}

const ICON_MAP: Record<string, { icon: React.ElementType; color: string }> = {
  WhatsApp: { icon: MessageCircle, color: "text-success bg-success/10" },
  Ligação: { icon: Phone, color: "text-primary bg-primary/10" },
  Email: { icon: Mail, color: "text-muted-foreground bg-muted" },
  Pesquisa: { icon: StickyNote, color: "text-warning bg-warning/10" },
  Visita: { icon: Calendar, color: "text-primary bg-primary/10" },
};

const RESULTADO_COLORS: Record<string, string> = {
  "Conectado": "bg-success/15 text-success border-success/30",
  "Atendeu": "bg-success/15 text-success border-success/30",
  "Respondeu": "bg-success/15 text-success border-success/30",
  "Agendou Reunião": "bg-primary/15 text-primary border-primary/30",
  "Não Atendeu": "bg-muted text-muted-foreground border-border",
  "Caixa Postal": "bg-muted text-muted-foreground border-border",
  "Sem Resposta": "bg-muted text-muted-foreground border-border",
  "Recusou": "bg-destructive/15 text-destructive border-destructive/30",
  "Pesquisa Concluída": "bg-warning/15 text-warning border-warning/30",
};

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return "Hoje";
  if (isYesterday(d)) return "Ontem";
  return format(d, "d 'de' MMMM", { locale: ptBR });
}

function groupByDay(entries: TimelineEntry[]): Map<string, TimelineEntry[]> {
  const map = new Map<string, TimelineEntry[]>();
  for (const e of entries) {
    const key = format(new Date(e.created_at), "yyyy-MM-dd");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return map;
}

interface Props {
  leadId: string;
}

export function LeadTimeline({ leadId }: Props) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .rpc("get_lead_atividades" as any, { p_lead_id: leadId, p_limit: 100 });
        if (error) console.error(error);
        setEntries((data || []) as TimelineEntry[]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [leadId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <StickyNote className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Nenhuma atividade registrada</p>
      </div>
    );
  }

  const grouped = groupByDay(entries);

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([dayKey, dayEntries]) => (
        <div key={dayKey}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {formatDayLabel(dayEntries[0].created_at)}
          </p>
          <div className="relative pl-6 border-l-2 border-border space-y-4">
            {dayEntries.map((entry) => {
              const cfg = ICON_MAP[entry.tipo_atividade] || { icon: StickyNote, color: "text-muted-foreground bg-muted" };
              const Icon = cfg.icon;
              const resultColor = RESULTADO_COLORS[entry.resultado] || "bg-muted text-muted-foreground border-border";
              return (
                <TimelineItem
                  key={entry.id}
                  entry={entry}
                  Icon={Icon}
                  iconColor={cfg.color}
                  resultColor={resultColor}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineItem({
  entry, Icon, iconColor, resultColor,
}: {
  entry: TimelineEntry;
  Icon: React.ElementType;
  iconColor: string;
  resultColor: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const nota = entry.nota || "";
  const truncated = nota.length > 200;

  return (
    <div className="relative">
      {/* Dot on the line */}
      <div className={cn("absolute -left-[23px] top-0.5 h-5 w-5 rounded-full flex items-center justify-center", iconColor)}>
        <Icon className="h-3 w-3" />
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{entry.tipo_atividade}</span>
          <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border", resultColor)}>
            {entry.resultado}
          </span>
          <span className="text-[11px] text-muted-foreground ml-auto">
            {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true, locale: ptBR })}
          </span>
        </div>
        {nota && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {expanded || !truncated ? nota : nota.slice(0, 200) + "..."}
            {truncated && (
              <button
                className="ml-1 text-primary text-[11px] hover:underline"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "ver menos" : "ver mais"}
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
