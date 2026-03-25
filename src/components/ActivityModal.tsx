import { useState } from "react";
import { Lead, TIPO_ATIVIDADE_OPTIONS, RESULTADO_OPTIONS, CADENCE_STEPS, TipoAtividade, ResultadoAtividade } from "@/types/lead";
import { registrarAtividade } from "@/store/leads-store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, Phone, MessageSquare, Building2, MapPin, Mail, User, Globe, Instagram, Megaphone, Bot, Zap, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { CopyButton } from "./CopyButton";

interface Props {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onDone: (updated: Lead) => void;
  userId?: string;
}

function PhoneLink({ phone, isCelular }: { phone: string; isCelular?: boolean }) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
      <span>{phone}</span>
      <CopyButton value={phone} label="Copiado" />
      {isCelular && digits.length >= 10 && (
        <a href={`https://wa.me/55${digits}`} target="_blank" rel="noopener noreferrer" className="text-success hover:text-success/80 ml-0.5" title="WhatsApp">
          <MessageSquare className="h-3.5 w-3.5" />
        </a>
      )}
    </span>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const color = score >= 70 ? "bg-success/15 text-success border-success/30"
    : score >= 40 ? "bg-warning/15 text-warning border-warning/30"
    : "bg-destructive/15 text-destructive border-destructive/30";
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold border ${color}`}>{score} pts</span>;
}

function QualBadge({ label, active, icon: Icon }: { label: string; active: boolean; icon: any }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md ${active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

export function ActivityModal({ lead, open, onClose, onDone, userId }: Props) {
  const [tipo, setTipo] = useState<string>("WhatsApp");
  const [resultado, setResultado] = useState<string>("");
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);

  if (!lead) return null;

  const step = CADENCE_STEPS[lead.dia_cadencia] || `Passo ${lead.dia_cadencia + 1}`;
  const isResearchStep = lead.dia_cadencia === 0;
  const searchName = lead.fantasia || lead.razao_social;

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
  const endereco = [lead.logradouro, lead.numero, lead.bairro, `${lead.cidade}/${lead.uf}`].filter(Boolean).join(", ");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base truncate">{lead.fantasia || lead.razao_social}</DialogTitle>
              <p className="text-xs text-muted-foreground">{lead.cnpj} · {lead.cnae_descricao}</p>
            </div>
            <ScoreBadge score={lead.lead_score} />
          </div>
          <p className="text-xs text-primary font-medium mt-2">
            📍 Dia {lead.dia_cadencia} — {step}
          </p>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-border">
          {/* Left: Lead Info */}
          <div className="p-4 space-y-3 overflow-y-auto max-h-[60vh]">
            {/* Contatos */}
            <Card className="border-0 shadow-none bg-muted/50">
              <CardHeader className="pb-1 pt-2 px-3">
                <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> Contatos
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-2 space-y-1.5">
                <PhoneLink phone={lead.telefone1} />
                <PhoneLink phone={lead.celular1} isCelular />
                {lead.celular2 && <PhoneLink phone={lead.celular2} isCelular />}
                {lead.email1 && (
                  <span className="inline-flex items-center gap-1 text-sm">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate max-w-[180px]">{lead.email1}</span>
                    <CopyButton value={lead.email1} label="Email copiado" />
                  </span>
                )}
              </CardContent>
            </Card>

            {/* Sócios */}
            {lead.socios.length > 0 && (
              <Card className="border-0 shadow-none bg-muted/50">
                <CardHeader className="pb-1 pt-2 px-3">
                  <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" /> Sócios
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-2 space-y-2">
                  {lead.socios.map((socio, i) => (
                    <div key={i} className="space-y-1">
                      <p className="font-medium text-xs">{socio.nome}</p>
                      <div className="flex flex-col gap-0.5">
                        <PhoneLink phone={socio.celular1 || ""} isCelular />
                        <PhoneLink phone={socio.telefone1 || ""} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Endereço */}
            <Card className="border-0 shadow-none bg-muted/50">
              <CardHeader className="pb-1 pt-2 px-3">
                <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Endereço
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-2 text-xs">{endereco}</CardContent>
            </Card>

            {/* Qualificação */}
            <Card className="border-0 shadow-none bg-muted/50">
              <CardHeader className="pb-1 pt-2 px-3">
                <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5" /> Qualificação
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-2">
                <div className="flex flex-wrap gap-1.5">
                  <QualBadge label="Site" active={lead.possui_site} icon={Globe} />
                  <QualBadge label="Instagram" active={lead.instagram_ativo} icon={Instagram} />
                  <QualBadge label="Anúncios" active={lead.faz_anuncios} icon={Megaphone} />
                  <QualBadge label="Bot WhatsApp" active={lead.whatsapp_automacao} icon={Bot} />
                </div>
                {lead.url_site && (
                  <a href={lead.url_site} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline mt-1 block truncate">{lead.url_site}</a>
                )}
                {lead.url_instagram && (
                  <a href={lead.url_instagram} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline mt-0.5 block truncate">{lead.url_instagram}</a>
                )}
                {lead.observacoes_sdr && (
                  <p className="text-xs text-muted-foreground mt-2 italic">"{lead.observacoes_sdr}"</p>
                )}
              </CardContent>
            </Card>

            {/* Research shortcuts for day 0 */}
            {isResearchStep && (
              <Card className="border-0 shadow-none bg-primary/5 border border-primary/20">
                <CardHeader className="pb-1 pt-2 px-3">
                  <CardTitle className="text-xs font-medium flex items-center gap-1.5 text-primary">
                    <Search className="h-3.5 w-3.5" /> Atalhos de Pesquisa
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button variant="outline" size="sm" className="justify-start text-xs h-7" asChild>
                      <a href={`https://www.google.com/search?q=${encodeURIComponent(`${searchName} ${lead.cidade}`)}`} target="_blank" rel="noopener noreferrer">
                        <Search className="h-3 w-3 mr-1" /> Google
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" className="justify-start text-xs h-7" asChild>
                      <a href={`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=BR&q=${encodeURIComponent(searchName)}`} target="_blank" rel="noopener noreferrer">
                        <Megaphone className="h-3 w-3 mr-1" /> Meta Ads
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right: Activity Form */}
          <div className="p-4 space-y-4">
            <h3 className="text-sm font-semibold">Registrar Atividade</h3>

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

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo de Atividade</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPO_ATIVIDADE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Resultado</Label>
                <Select value={resultado} onValueChange={setResultado}>
                  <SelectTrigger><SelectValue placeholder="O que aconteceu?" /></SelectTrigger>
                  <SelectContent>
                    {RESULTADO_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Nota (opcional)</Label>
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
