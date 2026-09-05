import { cn } from "@/lib/utils";
import { ORIGEM_BADGE_CLASS, ORIGEM_LABEL, TIPO_LABEL } from "@/types/lead";

export function OrigemBadge({ origem }: { origem?: string | null }) {
  if (!origem) return <span className="text-muted-foreground text-xs">—</span>;
  const cls = ORIGEM_BADGE_CLASS[origem] || ORIGEM_BADGE_CLASS.outros;
  const label = ORIGEM_LABEL[origem] || origem;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", cls)}>
      {label}
    </span>
  );
}

export function TipoBadge({ tipo }: { tipo?: string | null }) {
  if (!tipo) return null;
  const label = TIPO_LABEL[tipo] || tipo;
  const cls =
    tipo === "programa_acelerador"
      ? "bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30"
      : tipo === "imobiliaria_rf"
      ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20"
      : "bg-muted text-muted-foreground border";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", cls)}>
      {label}
    </span>
  );
}
