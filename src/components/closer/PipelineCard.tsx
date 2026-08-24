import { Lead, Atividade } from "@/types/lead";
import { useDraggable } from "@dnd-kit/core";
import { GripVertical, Phone, MessageCircle, Calendar, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { lastContactLabel, lastContactColor, activityEmoji } from "@/lib/contact-helpers";

interface Props {
  lead: Lead;
  onClick: () => void;
  atividades: Atividade[];
  ultimoContatoEm?: string | null;
  ultimoContatoTipo?: string | null;
}

const ACTIVITY_LABEL: Record<string, string> = {
  whatsapp_out: "WhatsApp", whatsapp_in: "WhatsApp recebido", ligacao: "Ligação",
  email_out: "E-mail", email_in: "E-mail recebido", reuniao: "Reunião", nota: "Nota",
  sucesso: "sucesso", agendado: "agendado", sem_resposta: "sem resposta",
  recusa: "recusou", erro: "erro", escalado: "escalado",
};

function daysInStage(lead: Lead): number | null {
  if (!lead.stage_changed_at) return null;
  const diff = Date.now() - new Date(lead.stage_changed_at).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export function PipelineCard({ lead, onClick, atividades, ultimoContatoEm, ultimoContatoTipo }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: isDragging ? 999 : undefined, opacity: isDragging ? 0.5 : 1 }
    : undefined;

  const dias = daysInStage(lead);
  const phone = lead.celular1 || lead.telefone1;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-border bg-card p-3 hover:border-primary/30 transition-colors space-y-2 group"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...listeners}
          {...attributes}
          className="min-h-6 min-w-6 cursor-grab rounded pt-0.5 text-muted-foreground opacity-60 transition-opacity hover:bg-muted hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
          aria-label={`Arrastar ${lead.fantasia || lead.razao_social} para outra etapa`}
        >
          <GripVertical className="mx-auto h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className="flex-1 min-w-0 cursor-pointer text-left" onClick={onClick}>
          <p className="font-medium text-sm truncate">{lead.fantasia || lead.razao_social}</p>
          <p className="text-xs text-muted-foreground truncate">{lead.bairro} · {lead.cidade || "—"}</p>
        </button>
        {dias !== null && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`inline-flex items-center gap-0.5 text-xs shrink-0 ${dias > 7 ? "text-destructive" : dias > 3 ? "text-warning" : "text-muted-foreground"}`}>
                <Clock className="h-3 w-3" />
                {dias}d
              </span>
            </TooltipTrigger>
            <TooltipContent>Há {dias} dias nesta etapa</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {lead.pipeline_review_required && (
          <span className="inline-flex rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning">
            revisar migração
          </span>
        )}
        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-bold ${
          (lead.fit_score ?? 0) >= 70 ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
        }`}>Fit {lead.fit_score ?? "—"}/100</span>
        <span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          Execução {lead.execution_score ?? "—"}/100
        </span>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {phone && (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={`https://wa.me/55${phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded hover:bg-success/10 text-success"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Abrir WhatsApp de ${lead.fantasia || lead.razao_social}`}
              >
                <MessageCircle className="h-3.5 w-3.5" />
              </a>
            </TooltipTrigger>
            <TooltipContent>WhatsApp</TooltipContent>
          </Tooltip>
        )}
        {phone && (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={`tel:${phone}`}
                className="p-1 rounded hover:bg-primary/10 text-primary"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Ligar para ${lead.fantasia || lead.razao_social}`}
              >
                <Phone className="h-3.5 w-3.5" />
              </a>
            </TooltipTrigger>
            <TooltipContent>Ligar</TooltipContent>
          </Tooltip>
        )}
        {lead.data_proximo_passo && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="p-1 text-xs text-muted-foreground flex items-center gap-0.5">
                <Calendar className="h-3 w-3" />
                {new Date(lead.data_proximo_passo).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              </span>
            </TooltipTrigger>
            <TooltipContent>Próximo passo</TooltipContent>
          </Tooltip>
        )}
      </div>

      {atividades.length > 0 && (
        <div className="border-t border-border pt-2 space-y-1">
          {atividades.slice(0, 2).map((a) => (
            <div key={a.id} className="text-xs text-muted-foreground flex gap-1.5">
              <span className="font-medium text-foreground/70">{ACTIVITY_LABEL[a.tipo_atividade] || a.tipo_atividade}</span>
              <span>→ {ACTIVITY_LABEL[a.resultado] || a.resultado}</span>
            </div>
          ))}
        </div>
      )}

      {/* Last contact footer */}
      <div className={`text-[11px] font-medium ${lastContactColor(ultimoContatoEm || null)}`}>
        {activityEmoji(ultimoContatoTipo || null)} {lastContactLabel(ultimoContatoEm || null)}
      </div>
    </div>
  );
}
