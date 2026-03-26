import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin } from "lucide-react";
import { Lead } from "@/types/lead";

interface Props {
  leads: Lead[];
  value: string;
  onChange: (v: string) => void;
}

export function CidadeFilter({ leads, value, onChange }: Props) {
  const cidades = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => { if (l.cidade) set.add(l.cidade); });
    return Array.from(set).sort();
  }, [leads]);

  if (cidades.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5">
      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[160px] text-xs border-border/60">
          <SelectValue placeholder="Todas as cidades" />
        </SelectTrigger>
        <SelectContent className="max-h-[250px]">
          <SelectItem value="__all__">Todas as cidades</SelectItem>
          {cidades.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function filterByCidade<T extends { cidade: string }>(items: T[], filter: string): T[] {
  if (!filter || filter === "__all__") return items;
  return items.filter((i) => i.cidade === filter);
}
