import { differenceInDays, differenceInHours } from "date-fns";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Phone, Mail, MessageCircle } from "lucide-react";

export type CanalPreferido = "whatsapp" | "telefone" | "email" | "linkedin" | "nao_definido";

/** Color class based on recency of last contact */
export function lastContactColor(dateStr: string | null): string {
  if (!dateStr) return "text-muted-foreground";
  const days = differenceInDays(new Date(), new Date(dateStr));
  if (days <= 3) return "text-success";
  if (days <= 7) return "text-warning";
  return "text-destructive";
}

/** Short relative label like "há 3d" */
export function lastContactLabel(dateStr: string | null): string {
  if (!dateStr) return "nunca";
  const hours = differenceInHours(new Date(), new Date(dateStr));
  if (hours < 1) return "agora";
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

/** Emoji for activity type */
export function activityEmoji(tipo: string | null): string {
  if (!tipo) return "";
  switch (tipo) {
    case "WhatsApp": return "💬";
    case "Ligação": return "📞";
    case "Email": return "📧";
    case "Pesquisa": return "🔍";
    case "Visita": return "🏢";
    default: return "📌";
  }
}

/** Canal preferido badge config */
export const CANAL_CONFIG: Record<CanalPreferido, { label: string; icon: React.ElementType; color: string }> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle, color: "bg-success/15 text-success border-success/30" },
  telefone: { label: "Telefone", icon: Phone, color: "bg-primary/15 text-primary border-primary/30" },
  email: { label: "Email", icon: Mail, color: "bg-muted text-muted-foreground border-border" },
  linkedin: { label: "LinkedIn", icon: MessageCircle, color: "bg-primary/15 text-primary border-primary/30" },
  nao_definido: { label: "N/D", icon: MessageCircle, color: "bg-muted/50 text-muted-foreground border-border" },
};
