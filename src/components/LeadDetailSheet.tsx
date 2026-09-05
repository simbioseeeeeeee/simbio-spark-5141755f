import { useEffect, useState } from "react";
import { Lead } from "@/types/lead";
import {
  getLeadById,
  getLeadByCnpj,
  restoreDeletedLead,
  softDeleteLead,
} from "@/store/leads-overhaul-store";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { OrigemBadge, TipoBadge } from "@/components/OrigemBadge";
import { LeadProfile } from "@/components/LeadProfile";
import { ActivityModal } from "@/components/ActivityModal";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Phone,
  MessageCircle,
  Mail,
  MapPin,
  Building2,
  User,
  Calendar,
  ChevronDown,
  ClipboardPlus,
  AlertTriangle,
  Loader2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  leadId: string | null;
  cnpj?: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged?: () => void;
}

export function LeadDetailSheet({ leadId, cnpj, open, onOpenChange, onChanged }: Props) {
  const { user, role } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSocios, setShowSocios] = useState(false);
  const [editando, setEditando] = useState(false);
  const [registrandoAtividade, setRegistrandoAtividade] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!leadId && !cnpj) return;
    setLoading(true);
    setLoadError(null);
    const fetcher = leadId ? getLeadById(leadId) : getLeadByCnpj(cnpj!);
    fetcher
      .then((l) => setLead(l))
      .catch((error: unknown) => {
        console.error("[lead-detail] falha ao carregar lead", error);
        setLoadError("Não foi possível carregar este lead. Verifique sua conexão e permissão.");
      })
      .finally(() => setLoading(false));
  }, [leadId, cnpj, open]);

  const waUrl = (num?: string) => {
    if (!num) return "#";
    const digits = num.replace(/\D/g, "");
    return `https://wa.me/55${digits}`;
  };

  const handleDelete = async () => {
    if (!lead) return;
    setDeleting(true);
    try {
      await softDeleteLead(lead.cnpj, deleteReason.trim());
      toast({
        title: "Lead movido para a Lixeira",
        description: "Atendimento e tarefas pendentes foram interrompidos. O histórico foi preservado.",
      });
      setDeleteOpen(false);
      setDeleteReason("");
      setDeleteConfirmation("");
      onOpenChange(false);
      onChanged?.();
    } catch (error: unknown) {
      toast({
        title: "Não foi possível excluir",
        description: error instanceof Error ? error.message : "Revise os dados e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleRestore = async () => {
    if (!lead) return;
    setRestoring(true);
    try {
      await restoreDeletedLead(lead.cnpj);
      const restored = await getLeadById(lead.cnpj);
      setLead(restored);
      onChanged?.();
      toast({
        title: "Lead restaurado",
        description: "O lead voltou ao CRM com a automação pausada para revisão humana.",
      });
    } catch (error: unknown) {
      toast({
        title: "Não foi possível restaurar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setRestoring(false);
    }
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

        {!loading && loadError && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}

        {!loading && !loadError && !lead && (
          <div className="text-center py-10 text-muted-foreground">Lead não encontrado.</div>
        )}

        {!loading && lead && (
          <div className="space-y-5">
            {lead.deleted_at && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-destructive">Lead na Lixeira</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Excluído em {format(new Date(lead.deleted_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.
                      {lead.deletion_reason && <> Motivo: {lead.deletion_reason}</>}
                    </div>
                  </div>
                  {role === "manager" && (
                    <Button size="sm" variant="outline" onClick={handleRestore} disabled={restoring}>
                      {restoring ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}
                      Restaurar
                    </Button>
                  )}
                </div>
              </div>
            )}
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
                  <div className="text-xs text-muted-foreground">Responsável SDR</div>
                  <div className="text-sm">{lead.responsavel_sdr || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Responsável Closer</div>
                  <div className="text-sm">{lead.responsavel_closer || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Último contato</div>
                  <div className="text-xs">
                    {lead.data_ultimo_contato || lead.updated_at
                      ? formatDistanceToNow(new Date(lead.data_ultimo_contato || lead.updated_at!), {
                          addSuffix: true,
                          locale: ptBR,
                        })
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
                {lead.tentativas_followup != null && (
                  <div>
                    <div className="text-xs text-muted-foreground">Tentativas follow-up</div>
                    <div className="text-sm">{lead.tentativas_followup}</div>
                  </div>
                )}
                {lead.motivo_perda && (
                  <div className="col-span-2">
                    <div className="text-xs text-muted-foreground">Motivo perda</div>
                    <div className="text-sm text-destructive">{lead.motivo_perda}</div>
                  </div>
                )}
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

            {!lead.deleted_at && (
              <>
                <Separator />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setRegistrandoAtividade(true)}>
                    <ClipboardPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Registrar atividade
                  </Button>
                  <Button variant="default" className="flex-1" onClick={() => setEditando(true)}>
                    Editar / avançar estágio
                  </Button>
                  <Button variant="outline" className="flex-1" asChild>
                    <a href={waUrl(lead.celular1 || lead.telefone1)} target="_blank" rel="noreferrer">
                      Abrir WhatsApp
                    </a>
                  </Button>
                  {role === "manager" && (
                    <Button
                      variant="outline"
                      className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir lead
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>

      {/* A ficha editável é o LeadProfile — o mesmo componente dos workspaces.
          Antes esta gaveta era só leitura e os dois botões nasciam disabled, então
          nenhum lead novo saía de "A Contatar" pela tela de Leads. */}
      <LeadProfile
        lead={lead}
        open={editando}
        onClose={() => setEditando(false)}
        onSaved={(atualizado) => {
          setLead(atualizado);
          setEditando(false);
        }}
      />
      <ActivityModal
        lead={lead}
        mode="manual"
        open={registrandoAtividade}
        onClose={() => setRegistrandoAtividade(false)}
        userId={user?.id}
        onDone={(atualizado) => {
          setLead(atualizado);
          setRegistrandoAtividade(false);
          toast({
            title: "Atividade registrada",
            description: "O histórico foi atualizado sem avançar a cadência.",
          });
        }}
      />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este lead?</AlertDialogTitle>
            <AlertDialogDescription>
              O lead sairá das listas, métricas, tarefas e automações. O histórico será preservado na Lixeira e poderá ser restaurado por um gestor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="delete-reason">Motivo da exclusão</Label>
              <Textarea
                id="delete-reason"
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
                placeholder="Ex.: cadastro duplicado ou empresa fora do perfil"
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delete-confirmation">
                Digite o CNPJ <span className="font-mono">{lead?.cnpj}</span> para confirmar
              </Label>
              <Input
                id="delete-confirmation"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value.replace(/\D/g, ""))}
                placeholder="Somente números"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
              disabled={deleting || deleteReason.trim().length < 5 || deleteConfirmation !== lead?.cnpj}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Mover para Lixeira
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
