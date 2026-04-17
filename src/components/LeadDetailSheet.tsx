import { useEffect, useState } from "react";
import { Lead } from "@/types/lead";
import { getLeadById, getLeadByCnpj } from "@/store/leads-overhaul-store";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { OrigemBadge, TipoBadge } from "@/components/OrigemBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Phone,
  MessageCircle,
  Mail,
  MapPin,
  Building2,
  User,
  Calendar,
  ChevronDown,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  leadId: string | null;
  cnpj?: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function LeadDetailSheet({ leadId, cnpj, open, onOpenChange }: Props) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSocios, setShowSocios] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!leadId && !cnpj) return;
    setLoading(true);
    const fetcher = leadId ? getLeadById(leadId) : getLeadByCnpj(cnpj!);
    fetcher
      .then((l) => setLead(l))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [leadId, cnpj, open]);

  const waUrl = (num?: string) => {
    if (!num) return "#";
    const digits = num.replace(/\D/g, "");
    return `https://wa.me/55${digits}`;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[560px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            {loading ? <Skeleton className="h-5 w-48" /> : lead?.fantasia || lead?.razao_social || "Lead"}
          </SheetTitle>
          {lead && (
            <SheetDescription className="flex flex-wrap gap-2 items-center pt-1">
              <OrigemBadge origem={lead.origem_lead} />
              <TipoBadge tipo={lead.tipo_lead} />
              <span className="text-xs text-muted-foreground font-mono">{lead.cnpj}</span>
            </SheetDescription>
          )}
        </SheetHeader>

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {!loading && !lead && (
          <div className="text-center py-10 text-muted-foreground">Lead não encontrado.</div>
        )}

        {!loading && lead && (
          <div className="space-y-5">
            {/* Razão social */}
            {lead.razao_social && lead.razao_social !== lead.fantasia && (
              <div className="text-sm text-muted-foreground">{lead.razao_social}</div>
            )}

            {/* Contato */}
            <div>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Contato
              </h3>
              <div className="space-y-2 text-sm">
                {lead.celular1 && (
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-green-600" />
                    <a href={waUrl(lead.celular1)} target="_blank" rel="noreferrer" className="hover:underline">
                      {lead.celular1}
                    </a>
                    <span className="text-xs text-muted-foreground">(WhatsApp)</span>
                  </div>
                )}
                {lead.celular2 && (
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-green-600" />
                    <a href={waUrl(lead.celular2)} target="_blank" rel="noreferrer" className="hover:underline">
                      {lead.celular2}
                    </a>
                  </div>
                )}
                {lead.telefone1 && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${lead.telefone1}`} className="hover:underline">
                      {lead.telefone1}
                    </a>
                  </div>
                )}
                {lead.telefone2 && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${lead.telefone2}`} className="hover:underline">
                      {lead.telefone2}
                    </a>
                  </div>
                )}
                {lead.email1 && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${lead.email1}`} className="hover:underline">
                      {lead.email1}
                    </a>
                  </div>
                )}
                {lead.email2 && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${lead.email2}`} className="hover:underline">
                      {lead.email2}
                    </a>
                  </div>
                )}
                {!lead.celular1 && !lead.celular2 && !lead.telefone1 && !lead.email1 && (
                  <div className="text-xs text-muted-foreground italic">
                    Nenhum contato cadastrado.
                  </div>
                )}
              </div>
            </div>

            {/* Endereço */}
            {(lead.cidade || lead.logradouro) && (
              <>
                <Separator />
                <div>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                    <MapPin className="h-3 w-3 inline mr-1" />
                    Endereço
                  </h3>
                  <div className="text-sm text-muted-foreground space-y-0.5">
                    {lead.logradouro && (
                      <div>
                        {lead.logradouro}
                        {lead.numero && `, ${lead.numero}`}
                        {lead.complemento && ` — ${lead.complemento}`}
                      </div>
                    )}
                    {lead.bairro && <div>{lead.bairro}</div>}
                    <div>
                      {lead.cidade} {lead.uf && `— ${lead.uf}`}
                    </div>
                    {lead.cep && <div className="font-mono text-xs">CEP {lead.cep}</div>}
                  </div>
                </div>
              </>
            )}

            {/* Sócios */}
            {lead.socios && lead.socios.length > 0 && (
              <>
                <Separator />
                <div>
                  <button
                    onClick={() => setShowSocios((v) => !v)}
                    className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground hover:text-foreground transition"
                  >
                    <User className="h-3 w-3" />
                    Sócios ({lead.socios.length})
                    <ChevronDown
                      className={`h-3 w-3 transition ${showSocios ? "rotate-180" : ""}`}
                    />
                  </button>
                  {showSocios && (
                    <div className="mt-2 space-y-2">
                      {lead.socios.map((s: any, i: number) => (
                        <div key={i} className="text-sm border border-border rounded p-2">
                          <div className="font-medium">{s.nome}</div>
                          {s.celular1 && (
                            <a
                              href={waUrl(s.celular1)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-muted-foreground hover:underline block"
                            >
                              📱 {s.celular1}
                            </a>
                          )}
                          {s.telefone1 && (
                            <div className="text-xs text-muted-foreground">☎ {s.telefone1}</div>
                          )}
                          {s.email1 && (
                            <a
                              href={`mailto:${s.email1}`}
                              className="text-xs text-muted-foreground hover:underline block"
                            >
                              ✉ {s.email1}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            <Separator />

            {/* Status + pipeline */}
            <div>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Pipeline</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Status SDR</div>
                  <div className="font-medium">{lead.status_sdr || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Estágio Funil</div>
                  <div className="font-medium">{lead.estagio_funil || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Último contato</div>
                  <div className="text-xs">
                    {lead.updated_at
                      ? formatDistanceToNow(new Date(lead.updated_at), { addSuffix: true, locale: ptBR })
                      : "nunca"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Próximo passo</div>
                  <div className="text-xs">
                    {lead.data_proximo_passo
                      ? format(new Date(lead.data_proximo_passo), "dd/MM/yyyy", { locale: ptBR })
                      : "—"}
                  </div>
                </div>
              </div>
            </div>

            {/* Observações (timeline simples) */}
            {(lead.observacoes_sdr || lead.observacoes_closer) && (
              <>
                <Separator />
                <div>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                    <Calendar className="h-3 w-3 inline mr-1" />
                    Notas
                  </h3>
                  <div className="space-y-3">
                    {lead.observacoes_sdr && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">SDR</div>
                        <div className="text-sm bg-muted/40 rounded p-2 whitespace-pre-wrap">
                          {lead.observacoes_sdr}
                        </div>
                      </div>
                    )}
                    {lead.observacoes_closer && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Closer</div>
                        <div className="text-sm bg-muted/40 rounded p-2 whitespace-pre-wrap">
                          {lead.observacoes_closer}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            <Separator />
            <div className="flex gap-2">
              <Button variant="default" className="flex-1" disabled>
                Editar (em breve)
              </Button>
              <Button variant="outline" className="flex-1" disabled>
                Avançar estágio
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
