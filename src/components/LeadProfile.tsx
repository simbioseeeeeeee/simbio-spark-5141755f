import { useState, useMemo, useEffect } from "react";
import { Lead, STATUS_OPTIONS, LeadStatus, ESTAGIO_FUNIL_OPTIONS, EstagioFunil, calculateScore, CanalPreferido } from "@/types/lead";
import { LeadTimeline } from "./LeadTimeline";
import { updateLead, registrarReuniaoAgendada, leadHasReuniaoActivity, getLeadsLastContact } from "@/store/leads-store";
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
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "./StatusBadge";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Building2, MapPin, Phone, Mail, User, Search, Globe, Instagram, Megaphone, Save, Loader2, DollarSign, Calendar, Bot, Zap, Sparkles, CheckCircle2, XCircle } from "lucide-react";

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
        {score} pts
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
  const { user } = useAuth();
  const [form, setForm] = useState<Lead | null>(null);
  const [saving, setSaving] = useState(false);
  const [researching, setResearching] = useState(false);

  const current = form?.id === lead?.id ? form : lead;

  const score = useMemo(() => current ? calculateScore(current) : 0, [current]);

  // Check if meeting activity is logged for this lead
  const [meetingLogged, setMeetingLogged] = useState<boolean | null>(null);
  const [lastContact, setLastContact] = useState<{ em: string | null; tipo: string | null }>({ em: null, tipo: null });
  useEffect(() => {
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
        lead_id: current.id,
        tipo_atividade: "Pesquisa",
        resultado: "Pesquisa Concluída",
        nota: `Pesquisa IA individual — Score: ${updated.lead_score}`,
      });

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

      const shouldLogMeeting = lead?.status_sdr !== "Reunião Agendada" && toSave.status_sdr === "Reunião Agendada";
      const updated = await updateLead(toSave);
      let meetingLogError: string | null = null;

      if (shouldLogMeeting) {
        try {
          await registrarReuniaoAgendada(updated, user?.id, "Status alterado manualmente para Reunião Agendada.");
        } catch (meetingError: any) {
          meetingLogError = meetingError.message || "Não foi possível contabilizar a reunião.";
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
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lead Score</span>
            </div>
            <ScoreBadge score={score} />
          </div>
        </SheetHeader>

        <Tabs defaultValue="ficha" className="flex-1">
          <div className="px-6 pt-2 border-b border-border">
            <TabsList className="h-8">
              <TabsTrigger value="ficha" className="text-xs">Ficha</TabsTrigger>
              <TabsTrigger value="timeline" className="text-xs">Timeline</TabsTrigger>
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

            {current.socios.length > 0 && (
              <Card className="border-0 shadow-none bg-muted/50">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium flex items-center gap-2"><User className="h-4 w-4" /> Quadro Societário</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-3">
                  {current.socios.map((socio, i) => (
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
                      {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
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

                <div className="space-y-2">
                  <Label>Estágio do Funil</Label>
                  <Select value={current.estagio_funil || ""} onValueChange={(v) => setField("estagio_funil", (v || null) as EstagioFunil | null)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {ESTAGIO_FUNIL_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><DollarSign className="h-4 w-4" /> Valor Estimado do Negócio</Label>
                  <Input
                    type="number"
                    placeholder="R$ 0,00"
                    value={current.valor_negocio_estimado ?? ""}
                    onChange={(e) => setField("valor_negocio_estimado", e.target.value ? Number(e.target.value) : null)}
                  />
                </div>

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
            <LeadTimeline leadId={current.id} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
