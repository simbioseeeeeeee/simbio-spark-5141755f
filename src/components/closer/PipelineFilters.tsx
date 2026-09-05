import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, SlidersHorizontal } from "lucide-react";

export interface PipelineFilterValues {
  search: string;
  scoreFilter: string;
  sortBy: string;
}

interface Props {
  filters: PipelineFilterValues;
  onChange: (filters: PipelineFilterValues) => void;
}

export function PipelineFilters({ filters, onChange }: Props) {
  const set = (key: keyof PipelineFilterValues, value: string) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="flex items-center gap-3 flex-wrap pb-3">
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar lead..."
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
          className="pl-9 h-9"
        />
      </div>
      <Select value={filters.scoreFilter} onValueChange={(v) => set("scoreFilter", v)}>
        <SelectTrigger className="w-[150px] h-9">
          <SelectValue placeholder="Score" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os fits</SelectItem>
          <SelectItem value="qualified">Fit ≥ 70</SelectItem>
          <SelectItem value="below">Fit abaixo de 70</SelectItem>
          <SelectItem value="unscored">Fit não avaliado</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.sortBy} onValueChange={(v) => set("sortBy", v)}>
        <SelectTrigger className="w-[150px] h-9">
          <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
          <SelectValue placeholder="Ordenar" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="recent">Mais recente</SelectItem>
          <SelectItem value="fit">Maior fit</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
