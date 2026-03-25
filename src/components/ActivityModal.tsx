import { useState } from "react";
import { Lead, TIPO_ATIVIDADE_OPTIONS, RESULTADO_OPTIONS, CADENCE_STEPS, TipoAtividade, ResultadoAtividade } from "@/types/lead";
import { registrarAtividade } from "@/store/leads-store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Phone, MessageSquare } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onDone: (updated: Lead) => void;
  userId?: string;
}

export function ActivityModal({ lead, open, onClose, onDone, userId }: Props) {
  const [tipo, setTipo] = useState<string>("WhatsApp");
  const [resultado, setResultado] = useState<string>("");
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);

  if (!lead) return null;

  const step = CADENCE_STEPS[lead.dia_cadencia] || `Passo ${lead.dia_cadencia + 1}`;

  const handleSubmit = async () => {
    if (!resultado) {
      toast({ title: "Selecione o resultado", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const updated = await registrarAtividade(lead, tipo, resultado, nota, userId);
      setResultado("");
      setNota("");
      onDone(updated);
    } catch (err: any) {
      toast({ title: "Erro ao registrar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const celularDigits = (lead.celular1 || lead.telefone1 || "").replace(/\D/g, "");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Registrar Atividade</DialogTitle>
          <p className="text-sm text-muted-foreground">{lead.fantasia || lead.razao_social}</p>
          <p className="text-xs text-primary font-medium">Dia {lead.dia_cadencia} — {step}</p>
        </DialogHeader>

        {/* Quick Actions */}
        <div className="flex gap-2">
          {celularDigits.length >= 10 && (
            <Button variant="outline" size="sm" className="gap-1.5 flex-1" asChild>
              <a href={`https://wa.me/55${celularDigits}`} target="_blank" rel="noopener noreferrer">
                <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
              </a>
            </Button>
          )}
          {celularDigits && (
            <Button variant="outline" size="sm" className="gap-1.5 flex-1" asChild>
              <a href={`tel:+55${celularDigits}`}>
                <Phone className="h-3.5 w-3.5" /> Ligar
              </a>
            </Button>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de Atividade</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPO_ATIVIDADE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Resultado</Label>
            <Select value={resultado} onValueChange={setResultado}>
              <SelectTrigger><SelectValue placeholder="O que aconteceu?" /></SelectTrigger>
              <SelectContent>
                {RESULTADO_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Nota (opcional)</Label>
            <Textarea
              rows={2}
              placeholder="Detalhes da interação..."
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </div>

          <Button onClick={handleSubmit} className="w-full" disabled={saving || !resultado}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {saving ? "Salvando..." : "Registrar e Avançar Cadência"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
