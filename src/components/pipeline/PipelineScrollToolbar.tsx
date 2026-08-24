import { useCallback, useEffect, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  containerRef: RefObject<HTMLDivElement>;
  stages: readonly string[];
};

const COLUMN_STEP = 296;

export function PipelineScrollToolbar({ containerRef, stages }: Props) {
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    setCanScrollLeft(container.scrollLeft > 2);
    setCanScrollRight(container.scrollLeft < maxScroll - 2);
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    updateScrollState();
    container.addEventListener("scroll", updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(container);
    if (container.firstElementChild) observer.observe(container.firstElementChild);

    return () => {
      container.removeEventListener("scroll", updateScrollState);
      observer.disconnect();
    };
  }, [containerRef, updateScrollState]);

  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

  const scrollByColumn = (direction: -1 | 1) => {
    containerRef.current?.scrollBy({ left: direction * COLUMN_STEP, behavior });
  };

  const goToStage = (stage: string) => {
    const index = stages.indexOf(stage);
    if (index < 0) return;
    containerRef.current?.scrollTo({ left: index * COLUMN_STEP, behavior });
  };

  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-2 rounded-lg border border-border bg-background/95 p-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="flex items-center gap-1" aria-label="Navegação horizontal da pipeline">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => scrollByColumn(-1)}
          disabled={!canScrollLeft}
          aria-label="Mostrar coluna anterior"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => scrollByColumn(1)}
          disabled={!canScrollRight}
          aria-label="Mostrar próxima coluna"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <span className="ml-1 hidden text-xs text-muted-foreground sm:inline" aria-live="polite">
          {canScrollLeft || canScrollRight ? "Há etapas fora da área visível" : "Todas as etapas estão visíveis"}
        </span>
      </div>

      <Select onValueChange={goToStage}>
        <SelectTrigger className="h-9 w-[180px]" aria-label="Ir para uma etapa da pipeline">
          <SelectValue placeholder="Ir para etapa" />
        </SelectTrigger>
        <SelectContent>
          {stages.map((stage) => <SelectItem key={stage} value={stage}>{stage}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
