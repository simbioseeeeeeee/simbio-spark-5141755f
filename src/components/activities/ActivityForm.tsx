import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ACTIVITY_DIRECTIONS,
  ACTIVITY_DIRECTION_LABEL,
  ACTIVITY_RESULTS,
  ACTIVITY_RESULT_LABEL,
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABEL,
  type ActivityDirection,
  type ActivityDraft,
  type ActivityResult,
  type ActivityType,
  validateActivityDraft,
} from "@/lib/crm-domain";
import { Loader2 } from "lucide-react";

const MANUAL_RESULTS = ACTIVITY_RESULTS.filter((result) => result !== "agendado");

function nowForInput() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
type Props = {
  advanceCadence: boolean;
  saving: boolean;
  onSubmit: (draft: ActivityDraft) => Promise<void>;
};

export function ActivityForm({ advanceCadence, saving, onSubmit }: Props) {
  const typeId = useId();
  const resultId = useId();
  const directionId = useId();
  const occurredAtId = useId();
  const noteId = useId();
  const errorId = useId();
  const [type, setType] = useState<ActivityType>("whatsapp_out");
  const [result, setResult] = useState<ActivityResult>("sem_resposta");
  const [direction, setDirection] = useState<ActivityDirection>("out");
  const [occurredAt, setOccurredAt] = useState(nowForInput);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (type === "whatsapp_in") setDirection("in");
    if (type !== "whatsapp_in" && type !== "nota") setDirection("out");
  }, [type]);

  const submit = async () => {
    const draft: ActivityDraft = {
      type,
      result,
      direction,
      note: note.trim(),
      occurredAt: new Date(occurredAt).toISOString(),
    };
    const validationError = validateActivityDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    await onSubmit(draft);
    setNote("");
    setOccurredAt(nowForInput());
  };

  return (
    <div className="space-y-3">
      {advanceCadence ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs" role="status">
          Esta ação registra o contato e recalcula explicitamente o próximo passo da cadência humana.
        </div>
      ) : (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground" role="status">
          Esta ação registra somente a atividade. Status e próximo passo não serão alterados.
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={typeId}>Tipo de atividade</Label>
        <Select value={type} onValueChange={(value) => setType(value as ActivityType)}>
          <SelectTrigger id={typeId}><SelectValue /></SelectTrigger>
          <SelectContent>
            {ACTIVITY_TYPES.filter((item) => item !== "mudanca_status").map((item) => (
              <SelectItem key={item} value={item}>{ACTIVITY_TYPE_LABEL[item]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={resultId}>Resultado</Label>
          <Select value={result} onValueChange={(value) => setResult(value as ActivityResult)}>
            <SelectTrigger id={resultId}><SelectValue /></SelectTrigger>
            <SelectContent>
              {MANUAL_RESULTS.map((item) => (
                <SelectItem key={item} value={item}>{ACTIVITY_RESULT_LABEL[item]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={directionId}>Direção</Label>
          <Select
            value={direction}
            onValueChange={(value) => setDirection(value as ActivityDirection)}
            disabled={type !== "nota"}
          >
            <SelectTrigger id={directionId}><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACTIVITY_DIRECTIONS.map((item) => (
                <SelectItem key={item} value={item}>{ACTIVITY_DIRECTION_LABEL[item]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={occurredAtId}>Data e hora</Label>
        <Input
          id={occurredAtId}
          type="datetime-local"
          value={occurredAt}
          max={nowForInput()}
          onChange={(event) => setOccurredAt(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={noteId}>Observação</Label>
        <Textarea
          id={noteId}
          rows={3}
          maxLength={4_000}
          placeholder="Contexto útil da interação, sem dados sensíveis desnecessários."
          value={note}
          onChange={(event) => setNote(event.target.value)}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
        />
        <p className="text-right text-[11px] text-muted-foreground">{note.length}/4000</p>
      </div>

      {error && <p id={errorId} role="alert" className="text-sm text-destructive">{error}</p>}

      <Button type="button" onClick={submit} className="w-full" disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {saving
          ? "Salvando..."
          : advanceCadence
            ? "Registrar e avançar cadência"
            : "Registrar atividade"}
      </Button>
    </div>
  );
}
