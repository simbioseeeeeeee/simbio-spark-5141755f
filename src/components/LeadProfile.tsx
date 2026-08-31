import { useState, useMemo, useEffect } from "react";
import {
  Lead, STATUS_OPTIONS, LeadStatus, ESTAGIO_FUNIL_OPTIONS, EstagioFunil,
  calculateScore, MOTIVO_PERDA_LABEL, OFERTA_OPTIONS,
  PLAYBOOK_VERSION, type MotivoPerda, estagioLabel, ORIGEM_COMERCIAL_LABEL,
  type OrigemComercial, type TipoContaComercial, type TemperaturaLead,
} from "@/types/lead";
import { LeadTimeline } from "./LeadTimeline";
import { ActivityModal } from "./ActivityModal";
import { updateLead, transitionLeadStage, registrarReuniaoAgendada, leadHasReuniaoActivity, getLeadsLastContact } from "@/store/leads-store";
import { archiveLead } from "@/store/leads-overhaul-store";
import { lastContactLabel, lastContactColor, activityEmoji, CANAL_CONFIG } from "@/lib/contact-helpers";
import { useAuth } from "@/contexts/AuthContext";
import { CopyButton } from "./CopyButton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReuniaoTab } from "@/components/ReuniaoTab";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "./StatusBadge";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ALLOWED_PIPELINE_TRANSITIONS, allowedSdrTargets, isPipelineStage, validateSdrTransition } from "@/lib/sales-pipeline";
import { Building2, MapPin, Phone, PhoneCall, MessageCircle, Mail, User, Search, Globe, Instagram, Megaphone, Save, Loader2, DollarSign, Calendar, Bot, Zap, Sparkles, CheckCircle2, XCircle, ClipboardPlus } from "lucide-react";
import { ligarParaLead, enviarWhatsAppLead } from "@/lib/api";

// calculateScore is now imported from types/lead

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70
    ? "bg-success/15 text-success border-success/30"
    : score >= 40
      ? "bg-warning/15 text-warning border-warning/30"
      : "bg-destructive/15 text-destructive border-destructive/30";

  return (
    <div className="flex items-center gap-3">
      <div className={`px-3 py-1 rounded-full text-sm font-bold border ${color}`}>
        Pesquisa digital {score}/100
      </div>
      <Progress value={score} className="flex-1 h-2" />
    </div>
  );
}

function PhoneLink({ phone, isCelular }: { phone: string; isCelular?: boolean }) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
      <span>{phone}</span>
      <CopyButton value={phone} label="Telefone copiado" />
      {isCelular && digits.length >= 10 && (
        <a href={`https://wa.me/55${digits}`} target="_blank" rel="noopener noreferrer" className="text-success hover:text-success/80 ml-0.5" title="Abrir WhatsApp">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.305 0-4.461-.654-6.29-1.785l-.44-.268-2.834.95.95-2.834-.268-.44A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
        </a>
      )}
    </span>
  );
}

function EmailDisplay({ email }: { email: string }) {
  if (!email) return null;
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="truncate max-w-[200px]">{email}</span>
      <CopyButton value={email} label="Email copiado" />
    </span>
  );
}

interface Props {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onSaved: (lead: Lead) => void;
}

export function LeadProfile({ lead, open, onClose, onSaved }: Props) {
  const { user, role } = useAuth();
  const [form, setForm] = useState<Lead | null>(null);
  const [saving, setSaving] = useState(false);
  const [researching, setResearching] = useState(false);
  const [managerOverrideApproved, setManagerOverrideApproved] = useState(false);
  const [acionando, setAcionando] = useState<"ligar" | "wpp" | null>(null);
  const [compondoWpp, setCompondoWpp] = useState(false);
  const [agendando, setAgendando] = useState(false);
  const [registrandoAtividade, setRegistrandoAtividade] = useState(false);
  const [timelineVersion, setTimelineVersion] = useState(0);
  const [textoWpp, setTextoWpp] = useState("");

  async function acionarLigacao() {
    if (!current?.cnpj) return;
    setAcionando("ligar");
    try {
      await ligarParaLead(current.cnpj);
      toast({ title: "Ligação disparada", description: "A Larissa está ligando agora. O resultado cai na timeline." });
    } catch (e: any) {
      toast({ title: "Não consegui ligar", description: e?.message || "erro desconhecido", variant: "destructive" });
    } finally {
      setAcionando(null);
    }
  }

  async function acionarWhatsApp() {
    if (!current?.cnpj || !textoWpp.trim()) return;
    setAcionando("wpp");
    try {
      await enviarWhatsAppLead(current.cnpj, textoWpp.trim());
      toast({ title: "Mensagem enviada", description: "Saiu pelo número oficial da Simbiose." });
      setTextoWpp("");
      setCompondoWpp(false);
    } catch (e: any) {
      toast({ title: "Não enviei", description: e?.message || "erro desconhecido", variant: "destructive" });
    } finally {
      setAcionando(null);
    }
  }

  const current = form?.id === lead?.id ? form : lead;

  const score = useMemo(() => current ? calculateScore(current) : 0, [current]);

  // Check if meeting activity is logged for this lead
  const [meetingLogged, setMeetingLogged] = useState<boolean | null>(null);
  const [lastContact, setLastContact] = useState<{ em: string | null; tipo: string | null }>({ em: null, tipo: null });
  useEffect(() => {
    setManagerOverrideApproved(false);
    if (!lead?.id) {
      setMeetingLogged(null);
      setLastContact({ em: null, tipo: null });
      return;
    }
    if (lead.status_sdr === "Reunião Agendada") {
      leadHasReuniaoActivity(lead.id).then(setMeetingLogged).catch(() => setMeetingLogged(null));
    } else {
      setMeetingLogged(null);
    }
    getLeadsLastContact([lead.id]).then((m) => {
      const lc = m.get(lead.id);
      setLastContact({ em: lc?.ultimo_contato_em || null, tipo: lc?.ultimo_contato_tipo || null });
    }).catch(() => {});
  }, [lead?.id, lead?.status_sdr]);

  const setField = <K extends keyof Lead>(key: K, val: Lead[K]) => {
    if (!current) return;
    setForm({ ...current, [key]: val });
  };

  const handleAutoResearch = async () => {
    if (!current) return;
    setResearching(true);
    try {
      toast({ title: "🔍 Pesquisando...", description: `Analisando ${current.fantasia || current.razao_social} com IA...` });

      const { data, error } = await supabase.functions.invoke('auto-research', {
        body: {
          razao_social: current.razao_social,
          fantasia: current.fantasia,
          cidade: current.cidade,
          uf: current.uf,
          cnae_descricao: current.cnae_descricao,
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Erro na pesquisa');

      const result = data.data;
      const updated: Lead = {
        ...current,
        possui_site: result.possui_site,
        url_site: result.url_site || "",
        instagram_ativo: result.instagram_ativo,
        url_instagram: result.url_instagram || "",
        faz_anuncios: result.faz_anuncios,
        whatsapp_automacao: result.whatsapp_automacao,
        observacoes_sdr: result.observacoes_sdr || current.observacoes_sdr,
      };
      updated.lead_score = calculateScore(updated);
      updated.pesquisa_realizada = true;

      // Auto-save research results to database
      const saved = await updateLead(updated);
      setForm(saved);
      onSaved(saved);

      // Log pesquisa activity for every AI research execution
      await supabase.from("atividades").insert({
        lead_cnpj: current.cnpj || current.id,
        tipo_atividade: "nota",
        resultado: "sucesso",
        nota: `Pesquisa IA individual — Score: ${updated.lead_score}`,
        created_by: user?.id || "crm",
        playbook_version: PLAYBOOK_VERSION,
        origem: current.origem_lead || "crm_manual",
        canal: "pesquisa",
        direcao: "out",
        metadados: {
          event: "research_completed",
          ui_tipo: "Pesquisa",
          ui_resultado: "Pesquisa Concluída",
          lead_score: updated.lead_score,
        },
      } as any);

      toast({ title: "✅ Pesquisa concluída e salva!", description: `Score: ${updated.lead_score} pts.` });
    } catch (err: any) {
      toast({ title: "Erro na pesquisa automática", description: err.message, variant: "destructive" });
    } finally {
      setResearching(false);
    }
  };

  const handleSave = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          toast({ title: "Sessão expirada", description: "Faça login novamente para continuar.", variant: "destructive" });
          setSaving(false);
          return;
        }
      }

      const toSave: Lead = {
        ...current,
        lead_score: calculateScore(current),
        pesquisa_realizada: true,
      };

      if (lead && toSave.status_sdr !== lead.status_sdr) {
        const statusValidation = validateSdrTransition(
          lead.status_sdr,
          toSave.status_sdr,
          toSave.meeting_event_id,
          toSave.data_reuniao_agendada,
          toSave.reuniao_url,
        );
        if ("reason" in statusValidation) throw new Error(statusValidation.reason);
      }

      const shouldLogMeeting = lead?.status_sdr !== "Reunião Agendada" && toSave.status_sdr === "Reunião Agendada";
      let transitionResult: Lead | null = null;
      if (toSave.estagio_funil && toSave.estagio_funil !== lead?.estagio_funil) {
        transitionResult = await transitionLeadStage(lead || toSave, toSave.estagio_funil, {
          eventId: toSave.meeting_event_id,
          meetingAt: toSave.data_reuniao_agendada,
          meetingUrl: toSave.reuniao_url,
          nextStepAt: toSave.data_proximo_passo,
          lossReason: (toSave.motivo_perda || null) as MotivoPerda | null,
          lossReasonDetail: toSave.motivo_perda_detalhe,
          offer: toSave.oferta_comercial,
          managerOverride: role === "manager" && managerOverrideApproved,
          managerOverrideReason: toSave.ganho_override_motivo,
        });
      }
      // A mudança para Reunião Agendada e sua atividade são confirmadas depois
      // pela mesma RPC. Assim uma falha de auditoria nunca deixa o status salvo
      // sem a atividade canônica (nem o inverso).
      let updated = await updateLead({
        ...toSave,
        status_sdr: shouldLogMeeting ? (lead?.status_sdr || "A Contatar") : toSave.status_sdr,
        estagio_funil: transitionResult?.estagio_funil ?? toSave.estagio_funil,
        proposta_enviada_em: transitionResult?.proposta_enviada_em ?? toSave.proposta_enviada_em,
        ganho_override_em: transitionResult?.ganho_override_em ?? toSave.ganho_override_em,
        ganho_override_motivo: transitionResult?.ganho_override_motivo ?? toSave.ganho_override_motivo,
        playbook_version: transitionResult?.playbook_version ?? toSave.playbook_version,
      });
      let meetingLogError: string | null = null;

      if (shouldLogMeeting) {
        try {
          updated = await registrarReuniaoAgendada(
            updated,
            user?.id,
            "Status alterado manualmente para Reunião Agendada.",
          );
        } catch (meetingError: any) {
          meetingLogError = meetingError.message || "Não foi possível confirmar a reunião.";
        }
      }

      setForm(updated);
      onSaved(updated);

      if (meetingLogError) {
        toast({
          title: "Lead salvo, mas a reunião não foi contabilizada",
          description: meetingLogError,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: shouldLogMeeting ? "Reunião agendada!" : "Qualificação salva!",
        description: shouldLogMeeting
          ? `A reunião de "${current.fantasia || current.razao_social}" foi contabilizada com sucesso.`
          : `Lead "${current.fantasia || current.razao_social}" atualizado com sucesso.`,
      });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!current) return null;

  const endereco = [current.logradouro, current.numero, current.complemento, current.bairro, `${current.cidade}/${current.uf}`, current.cep].filter(Boolean).join(", ");
  const searchName = current.fantasia || current.razao_social;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-[900px] w-full overflow-y-auto p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg truncate">{current.fantasia || current.razao_social}</SheetTitle>
              <p className="text-sm text-muted-foreground">{current.cnpj}</p>
            </div>
            <StatusBadge status={current.status_sdr} />
          </div>
          {/* Last contact badge */}
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <span className={cn("text-xs font-medium flex items-center gap-1", lastContactColor(lastContact.em))}>
              {activityEmoji(lastContact.tipo)} Último contato: {lastContactLabel(lastContact.em)}
              {lastContact.tipo && <span className="text-muted-foreground">· {lastContact.tipo}</span>}
            </span>
          </div>
          {/* Meeting activity indicator */}
          {current.status_sdr === "Reunião Agendada" && meetingLogged !== null && (
            <div className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${meetingLogged ? "text-success" : "text-destructive"}`}>
              {meetingLogged
                ? <><CheckCircle2 className="h-3.5 w-3.5" /> Reunião contabilizada nas métricas</>
                : <><XCircle className="h-3.5 w-3.5" /> Reunião NÃO contabilizada nas métricas</>
              }
            </div>
          )}
          {/* Score Display */}
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pesquisa digital</span>
            </div>
            <ScoreBadge score={score} />
          </div>

          {/* Ações diretas: a SDR trabalha o lead sem sair da ficha. */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setRegistrandoAtividade(true)}
            >
              <ClipboardPlus className="h-3.5 w-3.5" aria-hidden="true" />
              Registrar atividade
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={acionando !== null}
                    onClick={acionarLigacao}>
              {acionando === "ligar"
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <PhoneCall className="h-3.5 w-3.5" />}
              Larissa liga
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5"
                    onClick={() => setCompondoWpp((v) => !v)}>
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp oficial
            </Button>
            {/* SDR marca o diagnóstico daqui: o evento nasce no Google Agenda com
                Meet e o lead já vai pra "Reunião Agendada" — antes era tudo na mão */}
            {current.estagio_funil !== "Reunião Agendada" && (
              <Button size="sm" variant="outline" className="gap-1.5"
                      onClick={() => setAgendando(true)}>
                <Calendar className="h-3.5 w-3.5" />
                Agendar reunião
              </Button>
            )}
            <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-destructive"
                    onClick={async () => {
                      if (!window.confirm("Arquivar este lead? Ele sai do pipeline e das filas, mas o histórico fica guardado (Arquivo Morto).")) return;
                      try {
                        await archiveLead(current.cnpj || current.id);
                        toast({ title: "Lead arquivado", description: "Saiu do pipeline; histórico preservado." });
                        onSaved({ ...current, status_sdr: "Arquivo Morto" as any, estagio_funil: null as any });
                        onClose();
                      } catch (e: any) {
                        toast({ title: "Erro ao arquivar", description: String(e?.message || e), variant: "destructive" });
                      }
                    }}>
              Arquivar
            </Button>
          </div>
          {compondoWpp && (
            <div className="mt-2 space-y-2">
              <Textarea
                rows={3}
                placeholder="Mensagem que sai pelo número oficial da Simbiose…"
                value={textoWpp}
                onChange={(e) => setTextoWpp(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={acionando !== null || !textoWpp.trim()}
                        onClick={acionarWhatsApp}>
                  {acionando === "wpp" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Enviar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCompondoWpp(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </SheetHeader>

        <Tabs defaultValue="ficha" className="flex-1">
          <div className="px-6 pt-2 border-b border-border">
            <TabsList className="h-8">
              <TabsTrigger value="ficha" className="text-xs">Ficha</TabsTrigger>
              <TabsTrigger value="timeline" className="text-xs">Timeline</TabsTrigger>
              <TabsTrigger value="reuniao" className="text-xs">Reunião</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="ficha" className="mt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-border min-h-0">
          {/* Left Column - Read Only */}
          <div className="p-6 space-y-5 overflow-y-auto max-h-[calc(100vh-180px)]">
            <Card className="border-0 shadow-none bg-muted/50">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2"><Building2 className="h-4 w-4" /> Dados da Empresa</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-1 text-sm">
                <p><span className="text-muted-foreground">Razão Social:</span> {current.razao_social}</p>
                {current.fantasia && <p><span className="text-muted-foreground">Fantasia:</span> {current.fantasia}</p>}
                <p><span className="text-muted-foreground">CNAE:</span> {current.cnae_descricao}</p>
                <p><span className="text-muted-foreground">Abertura:</span> {current.data_abertura}</p>
                <p><span className="text-muted-foreground">Situação:</span> {current.situacao}</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none bg-muted/50">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2"><MapPin className="h-4 w-4" /> Endereço</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 text-sm">
                <p>{endereco}</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none bg-muted/50">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2"><Phone className="h-4 w-4" /> Contatos</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-2">
                <PhoneLink phone={current.telefone1} />
                <PhoneLink phone={current.telefone2} />
                <PhoneLink phone={current.celular1} isCelular />
                <PhoneLink phone={current.celular2} isCelular />
                <EmailDisplay email={current.email1} />
                <EmailDisplay email={current.email2} />
              </CardContent>
            </Card>

            {(current.socios?.length ?? 0) > 0 && (
              <Card className="border-0 shadow-none bg-muted/50">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium flex items-center gap-2"><User className="h-4 w-4" /> Quadro Societário</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-3">
                  {(current.socios ?? []).map((socio, i) => (
                    <div key={i} className="space-y-1">
                      <p className="font-medium text-sm">{socio.nome}</p>
                      <div className="flex flex-col gap-1">
                        <PhoneLink phone={socio.telefone1 || ""} />
                        <PhoneLink phone={socio.celular1 || ""} isCelular />
                        <EmailDisplay email={socio.email1 || ""} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Qualification */}
          <div className="p-6 space-y-5 overflow-y-auto max-h-[calc(100vh-180px)]">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Search className="h-4 w-4 text-primary" /> Painel de Qualificação (SDR)
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAutoResearch}
                  disabled={researching}
                  className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                >
                  {researching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {researching ? "Pesquisando..." : "Pesquisa IA"}
                </Button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Status do Lead</Label>
                  <Select value={current.status_sdr} onValueChange={(v) => setField("status_sdr", v as LeadStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {/* só o que a matriz aceita a partir do status atual — oferecer
                          o resto só produzia "Transição não permitida" ao salvar */}
                      {allowedSdrTargets(current.status_sdr)
                        .filter((s) => s !== "Reunião Agendada")
                        .map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {current.status_sdr === "Qualificado" && (
                    <p className="text-xs text-muted-foreground">
                      Para marcar reunião, use o botão <strong>Agendar reunião</strong> — ele cria o
                      evento na agenda e o link do Meet.
                    </p>
                  )}
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <Label htmlFor="site" className="flex items-center gap-2"><Globe className="h-4 w-4" /> Possui Site? <span className="text-xs text-muted-foreground">(+30pts)</span></Label>
                  <Switch id="site" checked={current.possui_site} onCheckedChange={(v) => setField("possui_site", v)} />
                </div>
                {current.possui_site && (
                  <Input placeholder="https://www.exemplo.com.br" value={current.url_site} onChange={(e) => setField("url_site", e.target.value)} />
                )}

                <div className="flex items-center justify-between">
                  <Label htmlFor="insta" className="flex items-center gap-2"><Instagram className="h-4 w-4" /> Instagram Ativo? <span className="text-xs text-muted-foreground">(+20pts)</span></Label>
                  <Switch id="insta" checked={current.instagram_ativo} onCheckedChange={(v) => setField("instagram_ativo", v)} />
                </div>
                {current.instagram_ativo && (
                  <Input placeholder="https://instagram.com/perfil" value={current.url_instagram} onChange={(e) => setField("url_instagram", e.target.value)} />
                )}

                <div className="flex items-center justify-between">
                  <Label htmlFor="ads" className="flex items-center gap-2"><Megaphone className="h-4 w-4" /> Faz Anúncios? <span className="text-xs text-muted-foreground">(+40pts)</span></Label>
                  <Switch id="ads" checked={current.faz_anuncios} onCheckedChange={(v) => setField("faz_anuncios", v)} />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Bot className="h-4 w-4" /> WhatsApp</Label>
                  <Select
                    value={current.whatsapp_humano ? "humano" : current.whatsapp_automacao ? "bot" : "nenhum"}
                    onValueChange={(v) => {
                      setForm({
                        ...current!,
                        whatsapp_humano: v === "humano",
                        whatsapp_automacao: v === "bot",
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Não possui WhatsApp</SelectItem>
                      <SelectItem value="humano">WhatsApp sem Bot (+10pts)</SelectItem>
                      <SelectItem value="bot">WhatsApp com Bot (+5pts)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Atalhos de Pesquisa</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" className="justify-start" asChild>
                      <a href={`https://www.google.com/search?q=${encodeURIComponent(`${searchName} ${current.cidade}`)}`} target="_blank" rel="noopener noreferrer">
                        <Search className="h-3.5 w-3.5 mr-1.5" /> Google
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" className="justify-start" asChild>
                      <a href={`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=BR&q=${encodeURIComponent(searchName)}`} target="_blank" rel="noopener noreferrer">
                        <Megaphone className="h-3.5 w-3.5 mr-1.5" /> Meta Ads
                      </a>
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Notas e Observações (SDR)</Label>
                  <Textarea rows={3} placeholder="Anote aqui o que percebeu no site, Instagram, etc." value={current.observacoes_sdr} onChange={(e) => setField("observacoes_sdr", e.target.value)} />
                </div>

                <Separator />

                {/* Closer Section */}
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-success" /> Painel do Closer
                </h3>

                {current.pipeline_review_required && (
                  <div className="flex items-center justify-between rounded-md border border-amber-400/50 bg-amber-500/5 p-3">
                    <Label htmlFor="pipeline-review">Dados migrados revisados</Label>
                    <Switch
                      id="pipeline-review"
                      checked={!current.pipeline_review_required}
                      onCheckedChange={(checked) => setField("pipeline_review_required", !checked)}
                    />
                  </div>
                )}

                <Card className="border-primary/20 bg-primary/[0.02]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Inteligência comercial</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Origem</Label>
                      <Select value={current.origem_comercial || "nao_informado"} onValueChange={(v) => setField("origem_comercial", v === "nao_informado" ? null : v as OrigemComercial)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nao_informado">Não informada</SelectItem>
                          {(Object.entries(ORIGEM_COMERCIAL_LABEL) as [OrigemComercial, string][]).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Quem indicou</Label>
                      <Input value={current.indicado_por || ""} onChange={(e) => setField("indicado_por", e.target.value || null)} placeholder="Pessoa ou empresa" />
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo de conta</Label>
                      <Select value={current.tipo_conta_comercial || "nao_informado"} onValueChange={(v) => setField("tipo_conta_comercial", v === "nao_informado" ? null : v as TipoContaComercial)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nao_informado">Não informado</SelectItem>
                          <SelectItem value="imobiliaria">Imobiliária</SelectItem>
                          <SelectItem value="incorporadora">Incorporadora</SelectItem>
                          <SelectItem value="loteadora">Loteadora</SelectItem>
                          <SelectItem value="outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Nº de corretores</Label>
                      <Input type="number" min={0} value={current.numero_corretores ?? ""} onChange={(e) => setField("numero_corretores", e.target.value === "" ? null : Number(e.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label>ICP</Label>
                      <Select value={current.icp_confirmado == null ? "nao_informado" : current.icp_confirmado ? "sim" : "nao"} onValueChange={(v) => setField("icp_confirmado", v === "nao_informado" ? null : v === "sim")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nao_informado">Não avaliado</SelectItem>
                          <SelectItem value="sim">Sim</SelectItem>
                          <SelectItem value="nao">Não</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Temperatura</Label>
                      <Select value={current.temperatura || "nao_informado"} onValueChange={(v) => setField("temperatura", v === "nao_informado" ? null : v as TemperaturaLead)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nao_informado">Não classificada</SelectItem>
                          <SelectItem value="quente">Quente</SelectItem>
                          <SelectItem value="morno">Morno</SelectItem>
                          <SelectItem value="frio">Frio</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>MRR da proposta</Label>
                      <Input type="number" min={0} step="0.01" value={current.mrr_proposta ?? ""} onChange={(e) => setField("mrr_proposta", e.target.value === "" ? null : Number(e.target.value))} placeholder="0,00" />
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-2">
                  <Label>Estágio do Funil</Label>
                  <Select value={current.estagio_funil || ""} onValueChange={(v) => setField("estagio_funil", (v || null) as EstagioFunil | null)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {/* só transições válidas a partir do estágio atual — oferecer o
                          resto só gerava erro de regra ao salvar (o "travado" de 21/08) */}
                      {(current.estagio_funil && isPipelineStage(current.estagio_funil)
                        ? [current.estagio_funil,
                           ...(ALLOWED_PIPELINE_TRANSITIONS[current.estagio_funil] ?? [])]
                        : ESTAGIO_FUNIL_OPTIONS
                      ).map((s) => <SelectItem key={s} value={s}>{estagioLabel(s)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {(current.estagio_funil === "Reunião Agendada" || current.status_sdr === "Reunião Agendada") && (
                  <div className="space-y-3 rounded-md border p-3">
                    <div className="space-y-2">
                      <Label>Event ID da agenda</Label>
                      <p className="break-all rounded-md bg-muted px-3 py-2 text-sm">
                        {current.meeting_event_id || "Ainda não confirmado pelo Calendar"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Data e horário da reunião</Label>
                      <p className="rounded-md bg-muted px-3 py-2 text-sm">
                        {current.data_reuniao_agendada
                          ? new Date(current.data_reuniao_agendada).toLocaleString("pt-BR")
                          : "Ainda não confirmado pelo Calendar"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Link da reunião</Label>
                      {current.reuniao_url ? (
                        <a className="block break-all rounded-md bg-muted px-3 py-2 text-sm text-primary underline"
                          href={current.reuniao_url} target="_blank" rel="noreferrer">
                          {current.reuniao_url}
                        </a>
                      ) : (
                        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Preenche sozinho em até 30 min</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Preenchido automaticamente: quando a Larissa agenda, quando a reunião entra no seu Google Calendar com o e-mail do lead (sincroniza a cada 30 min) ou, depois da reunião, pela transcrição do tl;dv.</p>
                  </div>
                )}

                {current.estagio_funil && ["Diagnóstico Realizado", "Proposta Enviada", "Em Negociação", "Aguardando Aceite", "Aguardando Pagamento"].includes(current.estagio_funil) && (
                  <div className="space-y-2">
                    <Label>Oferta comercial</Label>
                    <Select
                      value={current.oferta_comercial || ""}
                      onValueChange={(v) => setField("oferta_comercial", v as any)}
                    >
                      <SelectTrigger><SelectValue placeholder="Obrigatória para Proposta Enviada" /></SelectTrigger>
                      <SelectContent>
                        {OFERTA_OPTIONS.map((o) => (
                          <SelectItem key={o.id} value={o.label}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      A cotação na aba Reunião continua sendo o caminho completo (preço e snapshot do catálogo);
                      a reunião transcrita pelo tl;dv também preenche sozinha quando a oferta fica clara na conversa.
                    </p>
                  </div>
                )}

                {current.estagio_funil === "Aguardando Pagamento" && (
                  <div className="space-y-1 rounded-md border p-3">
                    <Label>Aceite</Label>
                    <p className="text-sm font-medium">
                      {current.aceite_em
                        ? `Confirmado pelo termo em ${new Date(current.aceite_em).toLocaleString("pt-BR")}`
                        : "Pendente de confirmação pelo termo"}
                    </p>
                    <p className="text-xs text-muted-foreground">Campo somente leitura; atualizado pelo webhook.</p>
                  </div>
                )}

                {(current.estagio_funil === "Aguardando Pagamento" || current.estagio_funil === "Fechado Ganho") && (
                  <div className="space-y-1 rounded-md border p-3">
                    <Label>Status do pagamento</Label>
                    <p className="text-sm font-medium capitalize">{(current.payment_status || "nao_iniciado").replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">Campo somente leitura; atualizado pela cobrança/webhook.</p>
                  </div>
                )}

                {current.estagio_funil === "Fechado Ganho" && current.payment_status !== "pago" && role === "manager" && (
                  <div className="space-y-3 rounded-md border border-amber-400/60 bg-amber-500/5 p-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={managerOverrideApproved}
                        onChange={(e) => setManagerOverrideApproved(e.target.checked)}
                      />
                      Confirmo o override gerencial sem pagamento
                    </label>
                    <Textarea
                      rows={2}
                      placeholder="Justificativa obrigatória e auditada"
                      value={current.ganho_override_motivo || ""}
                      onChange={(e) => setField("ganho_override_motivo", e.target.value || null)}
                    />
                  </div>
                )}

                {current.estagio_funil === "Fechado Perdido" && (
                  <div className="space-y-3 rounded-md border border-destructive/40 p-3">
                    <div className="space-y-2">
                      <Label>Motivo da perda</Label>
                      <Select
                        value={current.motivo_perda || ""}
                        onValueChange={(v) => setField("motivo_perda", v as MotivoPerda)}
                      >
                        <SelectTrigger><SelectValue placeholder="Obrigatório" /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(MOTIVO_PERDA_LABEL) as MotivoPerda[]).map((motivo) => (
                            <SelectItem key={motivo} value={motivo}>{MOTIVO_PERDA_LABEL[motivo]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {current.motivo_perda === "outro" && (
                      <Textarea
                        rows={2}
                        placeholder="Explique o motivo"
                        value={current.motivo_perda_detalhe || ""}
                        onChange={(e) => setField("motivo_perda_detalhe", e.target.value || null)}
                      />
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Data do Próximo Passo</Label>
                  <Input
                    type="date"
                    value={current.data_proximo_passo ? current.data_proximo_passo.slice(0, 10) : ""}
                    onChange={(e) => setField("data_proximo_passo", e.target.value || null)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Observações do Closer</Label>
                  <Textarea rows={3} placeholder="Notas sobre negociação, proposta, etc." value={current.observacoes_closer} onChange={(e) => setField("observacoes_closer", e.target.value)} />
                </div>

                <Button onClick={handleSave} className="w-full" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  {saving ? "Salvando..." : "Salvar Qualificação"}
                </Button>
              </div>
            </div>
          </div>
        </div>
          </TabsContent>
          <TabsContent value="timeline" className="mt-0 p-6 overflow-y-auto max-h-[calc(100vh-220px)]">
            <LeadTimeline leadId={current.id} refreshKey={timelineVersion} />
          </TabsContent>
          <TabsContent value="reuniao" className="mt-0">
            {current && (
              <ReuniaoTab
                cnpj={current.cnpj || current.id}
                nome={current.fantasia || current.razao_social || ""}
                cidade={current.cidade || null}
                estagioFunil={current.estagio_funil || null}
                email={current.email1 || null}
                whatsapp={current.celular1 || current.telefone1 || null}
                userName={user?.email?.split("@")[0] || "crm"}
                meetingEventId={current.meeting_event_id || null}
                onAssessmentSaved={({ fitScore, executionScore, decisionMakerConfirmed, stage, nextStepAt }) => {
                  setForm((previous) => {
                    const base = previous?.id === current.id ? previous : current;
                    return {
                      ...base,
                      fit_score: fitScore,
                      execution_score: executionScore,
                      decisor_confirmado: decisionMakerConfirmed,
                      estagio_funil: stage,
                      data_proximo_passo: nextStepAt,
                    };
                  });
                }}
              />
            )}
          </TabsContent>
        </Tabs>
        {agendando && current && (
          <AgendarReuniaoModal
            cnpj={current.cnpj || current.id}
            nomeLead={current.fantasia || current.razao_social || current.contato_nome || ""}
            open={agendando}
            onClose={() => setAgendando(false)}
            onAgendado={(d) => {
              const atualizado = {
                ...current,
                status_sdr: "Reunião Agendada" as any,
                estagio_funil: "Reunião Agendada" as any,
                data_reuniao_agendada: d.data_reuniao,
                reuniao_url: d.meet_link,
                meeting_event_id: d.event_id,
              };
              setForm(atualizado);
              onSaved(atualizado);
            }}
          />
        )}
        {registrandoAtividade && current && (
          <ActivityModal
            lead={current}
            mode="manual"
            open={registrandoAtividade}
            onClose={() => setRegistrandoAtividade(false)}
            userId={user?.id}
            onDone={(updated) => {
              setForm(updated);
              onSaved(updated);
              setTimelineVersion((version) => version + 1);
              setRegistrandoAtividade(false);
              toast({
                title: "Atividade registrada",
                description: "A timeline foi atualizada sem avançar a cadência.",
              });
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
