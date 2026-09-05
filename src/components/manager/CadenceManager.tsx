import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/api-error";
import { toast } from "@/hooks/use-toast";
import { AlertCircle, Clock3, Eye, FileClock, Loader2, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";

type CadenceDefinition = {
  id: string;
  cadence_key: string;
  name: string;
  purpose: string;
  enabled: boolean;
  activation_mode: "off" | "shadow" | "live";
  audience_rule: Record<string, unknown>;
  active_version_id: string | null;
};

type CadenceVersion = {
  id: string;
  definition_id: string;
  version_number: number;
  status: "draft" | "published" | "retired";
  timezone: string;
  allowed_window: Record<string, unknown>;
  stop_rules: unknown[];
  response_behavior: string;
  meeting_behavior: string;
  change_summary: string | null;
  published_at: string | null;
};

type CadenceStep = {
  id: string;
  version_id: string;
  position: number;
  delay_seconds: number;
  channel: "whatsapp" | "voice" | "sms" | "email" | "human_task";
  action_kind: "send_template" | "place_call" | "create_task" | "notify_owner";
  executor_kind: "automatic" | "human";
  template_ref: string | null;
  retry_policy: Record<string, unknown>;
  conditions: Record<string, unknown>;
};

type AuditEntry = {
  id: number;
  action: string;
  entity_type: string;
  summary: Record<string, unknown>;
  created_at: string;
};

const CHANNELS: CadenceStep["channel"][] = ["whatsapp", "voice", "sms", "email", "human_task"];
const STEP_DEFAULTS: Record<CadenceStep["channel"], Pick<CadenceStep, "action_kind" | "executor_kind">> = {
  whatsapp: { action_kind: "send_template", executor_kind: "automatic" },
  voice: { action_kind: "place_call", executor_kind: "automatic" },
  sms: { action_kind: "send_template", executor_kind: "automatic" },
  email: { action_kind: "send_template", executor_kind: "automatic" },
  human_task: { action_kind: "create_task", executor_kind: "human" },
};

function relativeDelay(seconds: number) {
  if (seconds === 0) return "T0";
  if (seconds < 86_400) return `T+${Math.round(seconds / 60)}min`;
  return `D${Math.round(seconds / 86_400)}`;
}

export function CadenceManager() {
  const [definitions, setDefinitions] = useState<CadenceDefinition[]>([]);
  const [versions, setVersions] = useState<CadenceVersion[]>([]);
  const [steps, setSteps] = useState<CadenceStep[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [selectedDefinitionId, setSelectedDefinitionId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingStepId, setSavingStepId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newPurpose, setNewPurpose] = useState("");

  const selectedDefinition = definitions.find((item) => item.id === selectedDefinitionId) || null;
  const selectedVersion = versions.find((item) => item.id === selectedVersionId) || null;
  const versionSteps = useMemo(
    () => steps.filter((step) => step.version_id === selectedVersionId).sort((a, b) => a.position - b.position),
    [steps, selectedVersionId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [definitionResult, versionResult, stepResult, auditResult] = await Promise.all([
        supabase.from("cadence_definitions" as never).select("*").order("name"),
        supabase.from("cadence_versions" as never).select("*").order("version_number", { ascending: false }),
        supabase.from("cadence_steps" as never).select("*").order("position"),
        supabase.from("cadence_audit_log" as never).select("id,action,entity_type,summary,created_at").order("created_at", { ascending: false }).limit(20),
      ]);
      const firstError = definitionResult.error || versionResult.error || stepResult.error || auditResult.error;
      if (firstError) throw firstError;

      const nextDefinitions = (definitionResult.data || []) as CadenceDefinition[];
      const nextVersions = (versionResult.data || []) as CadenceVersion[];
      setDefinitions(nextDefinitions);
      setVersions(nextVersions);
      setSteps((stepResult.data || []) as CadenceStep[]);
      setAudit((auditResult.data || []) as AuditEntry[]);
      setSelectedDefinitionId((current) => current || nextDefinitions[0]?.id || "");
    } catch (error: unknown) {
      const message = errorMessage(error, "Verifique migration e permissão de manager.");
      setLoadError(message);
      toast({ title: "Configuração de cadência indisponível", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const candidates = versions.filter((item) => item.definition_id === selectedDefinitionId);
    const preferred = candidates.find((item) => item.status === "draft")
      || candidates.find((item) => item.id === selectedDefinition?.active_version_id)
      || candidates[0];
    setSelectedVersionId(preferred?.id || "");
  }, [selectedDefinition?.active_version_id, selectedDefinitionId, versions]);

  const updateStep = (stepId: string, patch: Partial<CadenceStep>) => {
    setSteps((current) => current.map((step) => step.id === stepId ? { ...step, ...patch } : step));
  };

  const changeStepChannel = (stepId: string, channel: CadenceStep["channel"]) => {
    const patch: Partial<CadenceStep> = { channel, ...STEP_DEFAULTS[channel] };
    if (channel === "human_task") patch.template_ref = null;
    updateStep(stepId, patch);
  };

  const createDefinition = async () => {
    const cadenceKey = newKey.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!/^[a-z0-9_]{3,80}$/.test(cadenceKey)) {
      toast({ title: "Chave inválida", description: "Use de 3 a 80 caracteres: letras minúsculas, números e underscore.", variant: "destructive" });
      return;
    }
    if (newName.trim().length < 3 || newPurpose.trim().length < 3) {
      toast({ title: "Dados incompletos", description: "Informe nome e finalidade com pelo menos 3 caracteres.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_cadence_definition" as never, {
        p_cadence_key: cadenceKey,
        p_name: newName.trim(),
        p_purpose: newPurpose.trim(),
      } as never);
      if (error) throw error;
      await load();
      setSelectedDefinitionId(String(data));
      setNewKey("");
      setNewName("");
      setNewPurpose("");
      setShowCreate(false);
      toast({ title: "Cadência criada", description: "O primeiro rascunho está desabilitado e em shadow." });
    } catch (error: unknown) {
      toast({ title: "Não foi possível criar a cadência", description: errorMessage(error, "Revise a chave e tente novamente."), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const saveStep = async (step: CadenceStep) => {
    setSavingStepId(step.id);
    try {
      const { error } = await supabase.from("cadence_steps" as never).update({
        delay_seconds: step.delay_seconds,
        channel: step.channel,
        action_kind: step.action_kind,
        executor_kind: step.executor_kind,
        template_ref: step.template_ref,
        retry_policy: step.retry_policy,
        conditions: step.conditions,
      } as never).eq("id", step.id);
      if (error) throw error;
      toast({ title: "Passo salvo", description: `${relativeDelay(step.delay_seconds)} · ${step.channel}` });
    } catch (error: unknown) {
      toast({ title: "Não foi possível salvar o passo", description: errorMessage(error, "Atualize e tente novamente."), variant: "destructive" });
      void load();
    } finally {
      setSavingStepId(null);
    }
  };

  const createDraft = async () => {
    if (!selectedDefinition) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("create_cadence_draft" as never, { p_definition_id: selectedDefinition.id } as never);
      if (error) throw error;
      toast({ title: "Rascunho criado", description: "Leads ativos continuam fixados na versão anterior." });
      await load();
    } catch (error: unknown) {
      toast({ title: "Não foi possível criar o rascunho", description: errorMessage(error, "Já pode existir um rascunho aberto."), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const publishShadow = async () => {
    if (!selectedVersion || selectedVersion.status !== "draft") return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("publish_cadence_version" as never, { p_version_id: selectedVersion.id } as never);
      if (error) throw error;
      toast({ title: "Versão publicada em shadow", description: "Nenhum lead foi atribuído e nenhum envio foi liberado." });
      await load();
    } catch (error: unknown) {
      toast({ title: "Publicação bloqueada", description: errorMessage(error, "Revise os passos e tente novamente."), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (enabled: boolean) => {
    if (!selectedDefinition) return;
    const previous = selectedDefinition.enabled;
    setDefinitions((current) => current.map((item) => item.id === selectedDefinition.id ? { ...item, enabled } : item));
    const { error } = await supabase.from("cadence_definitions" as never).update({ enabled } as never).eq("id", selectedDefinition.id);
    if (error) {
      setDefinitions((current) => current.map((item) => item.id === selectedDefinition.id ? { ...item, enabled: previous } : item));
      toast({ title: "Alteração não salva", description: errorMessage(error, "Atualize e tente novamente."), variant: "destructive" });
    }
  };

  const addStep = async () => {
    if (!selectedVersion || selectedVersion.status !== "draft") return;
    const position = versionSteps.length + 1;
    const delay = versionSteps.at(-1)?.delay_seconds ?? 0;
    const { error } = await supabase.from("cadence_steps" as never).insert({
      version_id: selectedVersion.id,
      position,
      delay_seconds: delay + 86_400,
      channel: "human_task",
      action_kind: "create_task",
      executor_kind: "human",
      template_ref: null,
      retry_policy: { max_attempts: 1 },
      conditions: {},
    } as never);
    if (error) toast({ title: "Passo não criado", description: errorMessage(error, "Atualize e tente novamente."), variant: "destructive" });
    else await load();
  };

  const removeStep = async (step: CadenceStep) => {
    if (!selectedVersion || selectedVersion.status !== "draft") return;
    if (!window.confirm(`Remover o passo ${step.position}?`)) return;
    const { error } = await supabase.from("cadence_steps" as never).delete().eq("id", step.id);
    if (error) toast({ title: "Passo não removido", description: errorMessage(error, "Atualize e tente novamente."), variant: "destructive" });
    else await load();
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (loadError) return <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-6"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 text-destructive" /><div><p className="font-medium text-destructive">Configuração de cadência indisponível</p><p className="mt-1 text-sm text-muted-foreground">{loadError}</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Tentar novamente</Button></div></div></div>;
  if (!selectedDefinition) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma definição de cadência disponível.</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold"><FileClock className="h-4 w-4" /> Cadências versionadas</h2>
          <p className="text-sm text-muted-foreground">Editor gerencial. Publicações permanecem em shadow até ativação operacional separada.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" aria-expanded={showCreate} aria-controls="new-cadence-form" onClick={() => setShowCreate((current) => !current)}><Plus className="mr-1 h-4 w-4" /> Nova cadência</Button>
          <div className="flex items-center gap-2 rounded-lg border border-border p-2">
            <Label htmlFor="cadence-enabled" className="text-xs">Habilitada em shadow</Label>
            <Switch id="cadence-enabled" checked={selectedDefinition.enabled} onCheckedChange={toggleEnabled} />
            <Badge variant="outline">{selectedDefinition.activation_mode}</Badge>
          </div>
        </div>
      </div>

      {showCreate && <Card id="new-cadence-form"><CardHeader><CardTitle className="text-sm">Cadastrar cadência</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-[180px_240px_1fr_auto] md:items-end"><div className="space-y-1"><Label htmlFor="cadence-key">Chave</Label><Input id="cadence-key" value={newKey} onChange={(event) => setNewKey(event.target.value)} maxLength={80} placeholder="ex: reativacao_30d" /></div><div className="space-y-1"><Label htmlFor="cadence-name">Nome</Label><Input id="cadence-name" value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={120} /></div><div className="space-y-1"><Label htmlFor="cadence-purpose">Finalidade</Label><Textarea id="cadence-purpose" value={newPurpose} onChange={(event) => setNewPurpose(event.target.value)} maxLength={500} rows={2} /></div><Button type="button" onClick={createDefinition} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Criar rascunho</Button></CardContent></Card>}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-sm">Definição e versões</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedDefinitionId} onValueChange={setSelectedDefinitionId}>
              <SelectTrigger aria-label="Selecionar cadência"><SelectValue /></SelectTrigger>
              <SelectContent>{definitions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
            <div>
              <p className="text-sm font-medium">{selectedDefinition.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{selectedDefinition.purpose}</p>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">{selectedDefinition.cadence_key}</p>
            </div>
            <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>
              <SelectTrigger aria-label="Selecionar versão"><SelectValue placeholder="Versão" /></SelectTrigger>
              <SelectContent>
                {versions.filter((item) => item.definition_id === selectedDefinition.id).map((item) => (
                  <SelectItem key={item.id} value={item.id}>v{item.version_number} · {item.status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid gap-2">
              <Button type="button" variant="outline" onClick={createDraft} disabled={busy || versions.some((item) => item.definition_id === selectedDefinition.id && item.status === "draft")}>
                <Plus className="mr-2 h-4 w-4" /> Criar nova versão
              </Button>
              <Button type="button" onClick={publishShadow} disabled={busy || selectedVersion?.status !== "draft"}>
                <ShieldCheck className="mr-2 h-4 w-4" /> Publicar em shadow
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm">Preview completo da régua</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Timezone {selectedVersion?.timezone || "—"}; resposta e reunião interrompem a régua.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addStep} disabled={selectedVersion?.status !== "draft"}>
                <Plus className="mr-1 h-4 w-4" /> Passo
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {versionSteps.map((step) => (
                <div key={step.id} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[72px_110px_120px_1fr_auto] md:items-end">
                  <div className="space-y-1"><Label>Intervalo (h)</Label><Input type="number" min={0} step={0.25} value={step.delay_seconds / 3600} disabled={selectedVersion?.status !== "draft"} onChange={(event) => updateStep(step.id, { delay_seconds: Math.round(Number(event.target.value) * 3600) })} /><p className="text-[10px] text-muted-foreground">{relativeDelay(step.delay_seconds)}</p></div>
                  <div className="space-y-1"><Label>Canal</Label><Select value={step.channel} disabled={selectedVersion?.status !== "draft"} onValueChange={(value) => changeStepChannel(step.id, value as CadenceStep["channel"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CHANNELS.map((channel) => <SelectItem key={channel} value={channel}>{channel}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1"><Label>Responsável</Label><Select value={step.executor_kind} disabled={selectedVersion?.status !== "draft"} onValueChange={(value) => updateStep(step.id, { executor_kind: value as CadenceStep["executor_kind"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="automatic">Automático</SelectItem><SelectItem value="human">Humano</SelectItem></SelectContent></Select></div>
                  <div className="space-y-1"><Label>Referência do template</Label><Input value={step.template_ref || ""} maxLength={200} disabled={selectedVersion?.status !== "draft"} onChange={(event) => updateStep(step.id, { template_ref: event.target.value || null })} placeholder="Chave, nunca token ou secret" /></div>
                  <div className="flex gap-1"><Button type="button" size="icon" variant="outline" disabled={selectedVersion?.status !== "draft" || savingStepId === step.id} onClick={() => saveStep(step)} aria-label={`Salvar passo ${step.position}`}>{savingStepId === step.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}</Button><Button type="button" size="icon" variant="ghost" disabled={selectedVersion?.status !== "draft"} onClick={() => removeStep(step)} aria-label={`Remover passo ${step.position}`}><Trash2 className="h-4 w-4" /></Button></div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Eye className="h-4 w-4" /> Regras e compatibilidade</CardTitle></CardHeader><CardContent className="space-y-2 text-xs text-muted-foreground"><p>Janela: {JSON.stringify(selectedVersion?.allowed_window || {})}</p><p>Stops: {JSON.stringify(selectedVersion?.stop_rules || [])}</p><p>Nenhum próximo passo existente é recalculado. Atribuições ficam pinadas à versão original.</p><p>Receipts idempotentes impedem execução duplicada.</p></CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Clock3 className="h-4 w-4" /> Auditoria recente</CardTitle></CardHeader><CardContent className="space-y-2">{audit.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma alteração registrada.</p> : audit.slice(0, 8).map((entry) => <div key={entry.id} className="border-b border-border pb-2 text-xs"><p className="font-medium">{entry.action}</p><p className="text-muted-foreground">{new Date(entry.created_at).toLocaleString("pt-BR")} · {entry.entity_type}</p></div>)}</CardContent></Card>
          </div>
        </div>
      </div>
    </div>
  );
}
