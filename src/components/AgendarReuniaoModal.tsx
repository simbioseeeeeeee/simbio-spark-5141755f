import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { agendarReuniao } from "@/lib/api";
import { CalendarPlus, Loader2, Video } from "lucide-react";

interface Props {
  cnpj: string;
  nomeLead: string;
  open: boolean;
  onClose: () => void;
  onAgendado: (dados: { meet_link: string | null; data_legivel: string; data_reuniao: string; event_id: string | null }) => void;
}

/** Sugestões rápidas: próximos dias úteis às 10h e 15h — cobre o caso comum
 *  ("semana que vem de manhã") sem obrigar a SDR a digitar data. */
function sugestoes(): { rotulo: string; iso: string }[] {
  const out: { rotulo: string; iso: string }[] = [];
  const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const agora = new Date();
  for (let d = 1; d <= 7 && out.length < 6; d++) {
    const dia = new Date(agora);
    dia.setDate(agora.getDate() + d);
    if (dia.getDay() === 0 || dia.getDay() === 6) continue;
    for (const hora of [10, 15]) {
      const slot = new Date(dia);
      slot.setHours(hora, 0, 0, 0);
      if (slot.getTime() - agora.getTime() < 2 * 3600 * 1000) continue;
      out.push({
        rotulo: `${DIAS[slot.getDay()]} ${slot.getDate()}/${slot.getMonth() + 1} às ${hora}h`,
        iso: slot.toISOString(),
      });
    }
  }
  return out.slice(0, 6);
}

/** Valor para <input type="datetime-local"> no fuso do navegador. */
function paraInputLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function AgendarReuniaoModal({ cnpj, nomeLead, open, onClose, onAgendado }: Props) {
  const rapidas = useMemo(sugestoes, [open]);
  const minimo = useMemo(() => paraInputLocal(new Date(Date.now() + 2 * 3600 * 1000)), [open]);
  const [quando, setQuando] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function confirmar(iso: string) {
    setSalvando(true);
    try {
      const r = await agendarReuniao(cnpj, iso);
      toast({
        title: "Reunião agendada",
        description: `${r.data_legivel} — convite enviado e evento criado no Google Agenda.`,
      });
      onAgendado(r);
      onClose();
    } catch (e: any) {
      toast({
        title: "Não consegui agendar",
        description: e?.message || "erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            Agendar diagnóstico
          </DialogTitle>
          <DialogDescription>
            {nomeLead} · 60 minutos no Google Meet. O convite vai por e-mail e o link fica na ficha.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Horários sugeridos
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {rapidas.map((s) => (
                <Button
                  key={s.iso}
                  variant="outline"
                  size="sm"
                  disabled={salvando}
                  onClick={() => confirmar(s.iso)}
                  className="justify-start capitalize"
                >
                  {s.rotulo}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="quando-custom">Ou escolha data e hora</Label>
            <Input
              id="quando-custom"
              type="datetime-local"
              min={minimo}
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Segunda a sexta, das 9h às 18h, com no mínimo 2 horas de antecedência.
              Horários que já têm compromisso na sua agenda são recusados.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
            <Button
              onClick={() => quando && confirmar(new Date(quando).toISOString())}
              disabled={!quando || salvando}
            >
              {salvando ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Agendando…</>
              ) : (
                <><Video className="mr-2 h-4 w-4" /> Agendar e criar Meet</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
