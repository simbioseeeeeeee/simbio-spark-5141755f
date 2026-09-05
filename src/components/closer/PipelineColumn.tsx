import { useDroppable } from "@dnd-kit/core";

interface Props {
  id: string;
  children: React.ReactNode;
  colorClass: string;
  count: number;
  label?: string;
  mrrTotal?: number;
}

export function PipelineColumn({ id, children, colorClass, count, label, mrrTotal = 0 }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className="w-[280px] shrink-0">
      <div className={`rounded-t-lg px-3 py-2 ${colorClass}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{label || id}</span>
          <span className="text-xs font-bold">{count}</span>
        </div>
        <p className="mt-1 text-xs font-medium opacity-80">
          {mrrTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês
        </p>
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
