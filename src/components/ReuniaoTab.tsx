import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Copy, Ban, Plus, Trash2, ThumbsUp, ThumbsDown, CircleDashed,
  ClipboardCheck, Handshake, ExternalLink, Calculator, FileDown,
} from "lucide-react";
import {
  listarObjecoes, objecoesDoLead, marcarObjecao, atualizarObjecaoLead, removerObjecaoLead,
  calcularScoreFit, calcularScoreExecucao, pontosDeMelhoria, salvarAvaliacao, avaliacoesDoLead,
  fechamentosDoLead, criarFechamento, gerarRascunhoFechamento,
  PROMPTS_REUNIAO, GATILHOS_AVANCO, DESFECHO_LABEL, CATEGORIA_LABEL,
  type Objecao, type LeadObjecao, type Avaliacao, type FaixaFala, type Desfecho,
  type Fechamento, type CategoriaObjecao,
} from "@/store/playbook-store";
import {
  CATALOG_VERSION, OFERTA_OPTIONS, PLAYBOOK_VERSION, MOTIVO_PERDA_LABEL,
  type Commitment, type EstagioFunil, type MotivoPerda, type OfferId,
} from "@/types/lead";
import {
  calcularCotacaoComercial, carregarCatalogoComercial, formatBrl,
  type AddonSelection, type CommercialCatalog, type CommercialQuote,
} from "@/lib/commercial-catalog";

// Aba "Reunião" do card do lead — o playbook em uso DURANTE a chamada:
// objeções com resposta na hora, prompts do Gemini, avaliação com score e fechamento.

interface Props {
  cnpj: string;
  nome: string;
  cidade: string | null;
  estagioFunil: string | null;
  email: string | null;
  whatsapp: string | null;
  userName: string;
  meetingEventId: string | null;
  onAssessmentSaved?: (result: {
    fitScore: number;
    executionScore: number;
    decisionMakerConfirmed: boolean;
    stage: EstagioFunil | null;
    nextStepAt: string | null;
  }) => void;
}

const FAIXAS: { v: FaixaFala; label: string }[] = [
  { v: "<40", label: "menos de 40%" }, { v: "40-60", label: "40–60%" },
  { v: "60-80", label: "60–80%" }, { v: ">80", label: "mais de 80%" },
];

const FIT_FIELDS: { key: keyof Avaliacao; label: string; max: number }[] = [
  { key: "fit_icp", label: "ICP", max: 20 },
  { key: "fit_dor_impacto", label: "Dor e impacto", max: 25 },
  { key: "fit_processo_capacidade", label: "Processo e capacidade", max: 20 },
  { key: "fit_decisao", label: "Decisão", max: 20 },
  { key: "fit_timing", label: "Timing", max: 15 },
];

const EXECUTION_FIELDS: { key: keyof Avaliacao; label: string; max: number }[] = [
  { key: "exec_diagnostico", label: "Diagnóstico", max: 25 },
  { key: "exec_escuta", label: "Escuta", max: 15 },
  { key: "exec_confirmacao_entendimento", label: "Confirmação de entendimento", max: 15 },
  { key: "exec_solucao_ligada_dor", label: "Solução ligada à dor", max: 15 },
  { key: "exec_transparencia_termos", label: "Transparência dos termos", max: 15 },
  { key: "exec_proximo_passo", label: "Próximo passo datado", max: 15 },
];

function fechamentoStatus(fechamento: Fechamento): { label: string; variant: "default" | "secondary" | "destructive" } {
  if (fechamento.payment_status === "pago" || fechamento.status === "pago") return { label: "Pago", variant: "default" };
  if (fechamento.payment_status === "vencido" || fechamento.status === "vencido") return { label: "Vencido", variant: "destructive" };
  if (fechamento.aceite_em) return { label: "Aceito · pagamento pendente", variant: "secondary" };
  if (fechamento.proposta_enviada_em || fechamento.status !== "rascunho") return { label: "Proposta enviada · aceite pendente", variant: "secondary" };
  return { label: "Rascunho", variant: "secondary" };
}

export function ReuniaoTab({
  cnpj, nome, cidade, estagioFunil, email, whatsapp, userName, meetingEventId, onAssessmentSaved,
}: Props) {
  const [matriz, setMatriz] = useState<Objecao[]>([]);
  const [marcadas, setMarcadas] = useState<LeadObjecao[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([]);
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [formAberto, setFormAberto] = useState(false);
  const [fecharAberto, setFecharAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [gerandoRascunho, setGerandoRascunho] = useState(false);
  const [evidenciasAusentes, setEvidenciasAusentes] = useState<string[]>([]);
  const [propostaAprovada, setPropostaAprovada] = useState(false);
  const [catalogo, setCatalogo] = useState<CommercialCatalog | null>(null);
  const [cotacao, setCotacao] = useState<CommercialQuote | null>(null);
  const [quoteId, setQuoteId] = useState("");
  const [calculandoCotacao, setCalculandoCotacao] = useState(false);

  const [av, setAv] = useState<Avaliacao>({
    lead_cnpj: cnpj, decisor_presente: false, duracao_min: null, fala_closer_faixa: null,
    preco_apresentado: false, preco_minuto: null, preco_tratado_na_hora: null,
    desconto_sem_contrapartida: false, gatilhos_avanco: [], desfecho: null,
    proximo_passo_data: null, obs: null,
    meeting_event_id: meetingEventId || "",
    fit_icp: 0, fit_dor_impacto: 0, fit_processo_capacidade: 0, fit_decisao: 0, fit_timing: 0,
    exec_diagnostico: 0, exec_escuta: 0, exec_confirmacao_entendimento: 0,
    exec_solucao_ligada_dor: 0, exec_transparencia_termos: 0, exec_proximo_passo: 0,
  });

  const [fc, setFc] = useState({
    offer_id: "" as OfferId | "", commitment: "mensal" as Commitment,
    addons: [] as AddonSelection[],
    email: email || "", whatsapp: whatsapp || "", razao_social: nome, responsavel: "",
    cnpj_cliente: cnpj.match(/^\d{14}/) ? cnpj.replace(/\D/g, "").slice(0, 14) : "",
    idempotency_key: crypto.randomUUID(),
    objetivo: "", decisor_nome: "", proximo_passo: "",
  });

  const load = useCallback(async () => {
    try {
      const [m, lo, avs, fs] = await Promise.all([
        listarObjecoes(), objecoesDoLead(cnpj, meetingEventId), avaliacoesDoLead(cnpj, meetingEventId), fechamentosDoLead(cnpj),
      ]);
      setMatriz(m); setMarcadas(lo); setAvaliacoes(avs); setFechamentos(fs);
      if (avs[0]) setAv(avs[0]);
    } catch (e: any) {
      toast({ title: "Erro ao carregar a aba Reunião", description: e?.message, variant: "destructive" });
    }
  }, [cnpj, meetingEventId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let active = true;
    carregarCatalogoComercial()
      .then((result) => { if (active) setCatalogo(result); })
      .catch((e: any) => {
        if (active) toast({ title: "Catálogo comercial indisponível", description: e?.message, variant: "destructive" });
      });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    setAv((current) => ({ ...current, lead_cnpj: cnpj, meeting_event_id: meetingEventId || "" }));
  }, [cnpj, meetingEventId]);

  const porId = useMemo(() => new Map(matriz.map((o) => [o.id, o])), [matriz]);
  const categoriasMarcadas = useMemo(
    () => [...new Set(marcadas.map((m) => porId.get(m.objecao_id)?.categoria).filter(Boolean))] as CategoriaObjecao[],
    [marcadas, porId]);
  const temDesqualificante = marcadas.some((m) => porId.get(m.objecao_id)?.desqualifica);
  const fitScorePreview = calcularScoreFit(av);
  const executionScorePreview = calcularScoreExecucao(av);
  const pontos = avaliacoes.length
    ? pontosDeMelhoria(avaliacoes[0], categoriasMarcadas) : [];
  const ofertaSelecionada = catalogo?.offers.find((offer) => offer.id === fc.offer_id) || null;
  const adicionaisDisponiveis = (catalogo?.catalog.addons || []).filter(
    (addon) => fc.offer_id && addon.eligible_offers.includes(fc.offer_id),
  );

  function copiar(texto: string, id: string) {
    navigator.clipboard.writeText(texto);
    toast({ title: `${id} copiado`, description: "cola no chat do Gemini" });
  }

  async function marcar(objecaoId: string) {
    try {
      if (!meetingEventId) throw new Error("Registre o event_id da reunião no card antes de marcar objeções.");
      await marcarObjecao(cnpj, meetingEventId, objecaoId, userName, avaliacoes[0]?.id);
      setSeletorAberto(false);
      load();
    } catch (e: any) {
      toast({ title: "Não marcou", description: e?.message, variant: "destructive" });
    }
  }

  async function salvarForm() {
    setSalvando(true);
    try {
      await salvarAvaliacao({ ...av, meeting_event_id: meetingEventId || av.meeting_event_id, created_by: userName } as Avaliacao);
      toast({
        title: `Reunião avaliada — fit ${fitScorePreview} / execução ${executionScorePreview}`,
        description: fitScorePreview >= 70 ? "lead qualificado pelo score de fit" : "score é apoio; não desqualifica automaticamente",
      });
      onAssessmentSaved?.({
        fitScore: fitScorePreview,
        executionScore: executionScorePreview,
        decisionMakerConfirmed: av.decisor_presente,
        stage: estagioFunil === "Reunião Agendada"
          ? av.desfecho === "no_show"
            ? "No-show"
            : av.desfecho === "perdido"
              ? "Fechado Perdido"
              : "Diagnóstico Realizado"
          : (estagioFunil as EstagioFunil | null),
        nextStepAt: av.proximo_passo_data,
      });
      setFormAberto(false);
      load();
    } catch (e: any) {
      toast({ title: "Não salvou a avaliação", description: e?.message, variant: "destructive" });
    } finally { setSalvando(false); }
  }

  function selecionarOferta(offerId: OfferId) {
    setFc((current) => ({
      ...current,
      offer_id: offerId,
      commitment: offerId === "imersao" ? "unico" : "mensal",
      addons: [],
    }));
    setCotacao(null);
    setQuoteId("");
    setPropostaAprovada(false);
  }

  function atualizarAdicional(id: string, selected: boolean, quantity = 1) {
    setFc((current) => ({
      ...current,
      addons: selected
        ? [...current.addons.filter((item) => item.id !== id), { id, quantity: Math.max(1, quantity) }]
        : current.addons.filter((item) => item.id !== id),
    }));
    setCotacao(null);
    setQuoteId("");
    setPropostaAprovada(false);
  }

  async function calcularCotacao() {
    if (!fc.offer_id) {
      toast({ title: "Selecione uma oferta", variant: "destructive" });
      return;
    }
    setCalculandoCotacao(true);
    try {
      const result = await calcularCotacaoComercial(cnpj, fc.offer_id, fc.commitment, fc.addons);
      setCotacao(result.quote);
      setQuoteId(result.quote_id);
      setPropostaAprovada(false);
      const proposalMrr = result.quote.billing_type === "recurring"
        ? Number(result.quote.recurring_monthly_brl || 0)
        : 0;
      const { error: mrrError } = await supabase
        .from("leads")
        .update({ mrr_proposta: proposalMrr } as any)
        .eq("cnpj", cnpj);
      if (mrrError) {
        toast({
          title: "Cotação calculada, mas o MRR não sincronizou",
          description: "A cotação foi preservada. Preencha o MRR no painel do gerente.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Cotação não calculada", description: e?.message, variant: "destructive" });
    } finally {
      setCalculandoCotacao(false);
    }
  }

  async function fecharNegocio() {
    setSalvando(true);
    try {
      // Avanço livre (decisão CEO 01/09): a proposta não exige mais decisor confirmado.
      if (!cotacao || !quoteId) throw new Error("Calcule e revise a cotação oficial antes do envio.");
      const r = await criarFechamento({
        lead_cnpj: cnpj,
        offer_id: fc.offer_id,
        commitment: fc.commitment,
        addons: fc.addons,
        quote_id: quoteId,
        catalog_version: CATALOG_VERSION,
        email: fc.email, whatsapp: fc.whatsapp,
        razao_social: fc.razao_social, responsavel: fc.responsavel,
        cnpj_cliente: fc.cnpj_cliente,
        playbook_version: PLAYBOOK_VERSION,
        idempotency_key: fc.idempotency_key,
        objetivo: fc.objetivo,
        decisor_nome: fc.decisor_nome,
        proximo_passo: fc.proximo_passo,
        proposal_approved: propostaAprovada,
        proposal_approved_by: userName,
        proposal_approved_at: new Date().toISOString(),
      });
      toast({ title: "Proposta e termo enviados", description: `PDF: ${r.proposal_pdf_url}` });
      setFecharAberto(false);
      setPropostaAprovada(false);
      setCotacao(null);
      setQuoteId("");
      setFc((current) => ({ ...current, idempotency_key: crypto.randomUUID(), addons: [] }));
      load();
    } catch (e: any) {
      toast({ title: "Não fechou", description: e?.message, variant: "destructive" });
    } finally { setSalvando(false); }
  }

  async function gerarRascunho() {
    setGerandoRascunho(true);
    try {
      const draft = await gerarRascunhoFechamento(cnpj, meetingEventId);
      setFc((current) => {
        const recommended = OFERTA_OPTIONS.find((offer) => offer.label === draft.oferta_recomendada);
        const objetivoComCriterios = [
          draft.dor_impacto,
          draft.objetivo,
          draft.criterios_decisao.length
            ? `Critérios de decisão:\n${draft.criterios_decisao.map((item) => `- ${item}`).join("\n")}`
            : "",
        ].filter(Boolean).join("\n\n");
        return {
          ...current,
          offer_id: recommended?.id || current.offer_id,
          commitment: recommended?.id === "imersao" ? "unico" : current.commitment,
          addons: recommended?.id && recommended.id !== current.offer_id ? [] : current.addons,
          objetivo: objetivoComCriterios || current.objetivo,
          decisor_nome: draft.decisor_nome || current.decisor_nome,
          proximo_passo: draft.proximo_passo || current.proximo_passo,
        };
      });
      setCotacao(null);
      setQuoteId("");
      setEvidenciasAusentes(draft.missing_evidence || []);
      setPropostaAprovada(false);
      toast({
        title: "Rascunho preenchido para revisão",
        description: "Dor, decisor e próximo passo vieram das evidências; preço e escopo virão do catálogo.",
      });
    } catch (e: any) {
      toast({ title: "Não gerou o rascunho", description: e?.message, variant: "destructive" });
    } finally {
      setGerandoRascunho(false);
    }
  }

  const podeGerarProposta = estagioFunil === "Diagnóstico Realizado";

  return (
    <div className="space-y-4 p-6 overflow-y-auto max-h-[calc(100vh-220px)]">

      {temDesqualificante && (
        <div className="rounded-md border border-red-400/60 bg-red-500/5 p-3 text-sm">
          <b className="text-red-600 flex items-center gap-1.5"><Ban className="h-4 w-4" />Objeção desqualificante marcada.</b>
          <span className="text-muted-foreground"> Encerrar com dignidade, oferecer conteúdo e mover para Nurturing — não contornar.</span>
        </div>
      )}

      {/* pontos de melhoria da última avaliação */}
      {pontos.length > 0 && (
        <Card className="border-amber-400/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Pontos de melhoria — última reunião (execução {avaliacoes[0]?.execution_score ?? "—"})</CardTitle></CardHeader>
          <CardContent><ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
            {pontos.map((p, i) => <li key={i}>{p}</li>)}
          </ul></CardContent>
        </Card>
      )}

      {/* objeções levantadas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            Objeções levantadas
            <Button size="sm" variant="outline" className="ml-auto h-7"
              onClick={() => setSeletorAberto((v) => !v)}>
              <Plus className="mr-1 h-3.5 w-3.5" />marcar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!meetingEventId && (
            <p className="rounded-md border border-amber-400/50 bg-amber-500/5 p-2 text-xs text-amber-700">
              Registre o event_id no card para vincular objeções a esta reunião.
            </p>
          )}
          {seletorAberto && (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
              {matriz.map((o) => (
                <button key={o.id} onClick={() => marcar(o.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
                  <span className="text-xs text-muted-foreground">{o.id}</span>
                  <span className="truncate">{o.titulo}</span>
                  {o.desqualifica && <Ban className="ml-auto h-3.5 w-3.5 shrink-0 text-red-500" />}
                </button>
              ))}
            </div>
          )}
          {marcadas.length === 0 && !seletorAberto && (
            <p className="text-sm text-muted-foreground">Nenhuma. Marque DURANTE a reunião — a resposta aparece na hora.</p>
          )}
          {marcadas.map((m) => {
            const o = porId.get(m.objecao_id);
            if (!o) return null;
            return (
              <div key={m.id} className={`rounded-lg border p-3 ${o.desqualifica ? "border-red-400/60" : ""}`}>
                <div className="flex items-center gap-2 text-sm">
                  <b>{o.id} · {o.titulo}</b>
                  {o.desqualifica && <Badge variant="destructive" className="text-[10px]">desqualifica</Badge>}
                  <span className="ml-auto flex items-center gap-0.5">
                    <Button size="sm" variant={m.superada === true ? "default" : "ghost"} className="h-7 w-7 p-0"
                      title="superada" onClick={() => atualizarObjecaoLead(m.id, { superada: true }).then(load)}>
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant={m.superada === false ? "default" : "ghost"} className="h-7 w-7 p-0"
                      title="não superada" onClick={() => atualizarObjecaoLead(m.id, { superada: false }).then(load)}>
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </Button>
                    {m.superada === null && <span title="em aberto"><CircleDashed className="h-3.5 w-3.5 text-muted-foreground" /></span>}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground"
                      onClick={() => removerObjecaoLead(m.id).then(load)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </div>
                <p className="mt-1.5 text-sm"><b>Como tratar:</b> {o.resposta}</p>
                {o.nao_fazer && <p className="mt-1 text-xs text-red-600"><b>Não fazer:</b> {o.nao_fazer}</p>}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* prompts do Gemini */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Prompts pro Gemini na reunião</CardTitle></CardHeader>
        <CardContent className="grid gap-1.5 sm:grid-cols-2">
          {PROMPTS_REUNIAO.map((p) => (
            <button key={p.id} onClick={() => copiar(p.texto, p.id)}
              className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs hover:bg-muted">
              <Badge variant={p.quando === "durante" ? "secondary" : "outline"} className="text-[10px]">{p.id}</Badge>
              <span className="truncate">{p.titulo}</span>
              <Copy className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </CardContent>
      </Card>

      {/* avaliação da reunião */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ClipboardCheck className="h-4 w-4" /> Avaliar a reunião
            {avaliacoes.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                última: fit {avaliacoes[0].fit_score ?? "—"} · execução {avaliacoes[0].execution_score ?? "—"}
              </span>
            )}
            <Button size="sm" variant={formAberto ? "secondary" : "default"} className="ml-auto h-7"
              onClick={() => setFormAberto((v) => !v)}>
              {formAberto ? "fechar" : "preencher"}
            </Button>
          </CardTitle>
        </CardHeader>
        {formAberto && (
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <b>Fit comercial</b>
                  <Badge variant={fitScorePreview >= 70 ? "default" : "secondary"}>{fitScorePreview}/100</Badge>
                </div>
                {FIT_FIELDS.map((field) => (
                  <label key={String(field.key)} className="flex items-center justify-between gap-2 text-xs">
                    <span>{field.label} <span className="text-muted-foreground">(0–{field.max})</span></span>
                    <Input
                      type="number"
                      min={0}
                      max={field.max}
                      className="h-8 w-20"
                      value={Number(av[field.key]) || 0}
                      onChange={(e) => setAv({ ...av, [field.key]: Math.min(field.max, Math.max(0, Number(e.target.value) || 0)) })}
                    />
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">≥70 indica qualificação; a nota nunca desqualifica sozinha.</p>
              </div>
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <b>Execução da reunião</b>
                  <Badge variant="secondary">{executionScorePreview}/100</Badge>
                </div>
                {EXECUTION_FIELDS.map((field) => (
                  <label key={String(field.key)} className="flex items-center justify-between gap-2 text-xs">
                    <span>{field.label} <span className="text-muted-foreground">(0–{field.max})</span></span>
                    <Input
                      type="number"
                      min={0}
                      max={field.max}
                      className="h-8 w-20"
                      value={Number(av[field.key]) || 0}
                      onChange={(e) => setAv({ ...av, [field.key]: Math.min(field.max, Math.max(0, Number(e.target.value) || 0)) })}
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={av.decisor_presente}
                  onChange={(e) => setAv({ ...av, decisor_presente: e.target.checked })} />
                Decisor presente
              </label>
              <label className="flex items-center gap-2">
                Duração (min)
                <Input type="number" className="h-8 w-24" value={av.duracao_min ?? ""}
                  onChange={(e) => setAv({ ...av, duracao_min: e.target.value ? +e.target.value : null })} />
              </label>
              <div className="sm:col-span-2">
                <span className="text-xs text-muted-foreground">Quanto VOCÊ falou:</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {FAIXAS.map((f) => (
                    <Button key={f.v} size="sm" variant={av.fala_closer_faixa === f.v ? "default" : "outline"}
                      className="h-7 text-xs" onClick={() => setAv({ ...av, fala_closer_faixa: f.v })}>
                      {f.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            {av.desfecho === "perdido" && (
              <div className="grid gap-3 rounded-md border border-destructive/40 p-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs">
                  <span>Motivo da perda</span>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={av.motivo_perda || ""}
                    onChange={(e) => setAv({ ...av, motivo_perda: e.target.value as MotivoPerda })}
                  >
                    <option value="">Selecione</option>
                    {(Object.keys(MOTIVO_PERDA_LABEL) as MotivoPerda[]).map((motivo) => (
                      <option key={motivo} value={motivo}>{MOTIVO_PERDA_LABEL[motivo]}</option>
                    ))}
                  </select>
                </label>
                {av.motivo_perda === "outro" && (
                  <label className="space-y-1 text-xs">
                    <span>Detalhe</span>
                    <Input
                      value={av.motivo_perda_detalhe || ""}
                      onChange={(e) => setAv({ ...av, motivo_perda_detalhe: e.target.value || null })}
                    />
                  </label>
                )}
              </div>
            )}
            <div>
              <span className="text-xs text-muted-foreground">Gatilhos de avanço observados:</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {GATILHOS_AVANCO.map((g) => {
                  const on = av.gatilhos_avanco.includes(g);
                  return (
                    <Button key={g} size="sm" variant={on ? "default" : "outline"} className="h-7 text-xs"
                      onClick={() => setAv({ ...av, gatilhos_avanco: on
                        ? av.gatilhos_avanco.filter((x) => x !== g) : [...av.gatilhos_avanco, g] })}>
                      {g}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="text-xs text-muted-foreground">Desfecho:</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(Object.keys(DESFECHO_LABEL) as Desfecho[]).map((d) => (
                    <Button key={d} size="sm" variant={av.desfecho === d ? "default" : "outline"}
                      className="h-7 text-xs" onClick={() => setAv({ ...av, desfecho: d })}>
                      {DESFECHO_LABEL[d]}
                    </Button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2">
                Próximo passo (data)
                <Input type="date" className="h-8 w-40" value={av.proximo_passo_data ?? ""}
                  onChange={(e) => setAv({ ...av, proximo_passo_data: e.target.value || null })} />
              </label>
            </div>
            <Textarea rows={2} placeholder="observação livre"
              value={av.obs ?? ""} onChange={(e) => setAv({ ...av, obs: e.target.value || null })} />
            <div className="flex items-center gap-3">
              <Button size="sm" disabled={salvando} onClick={salvarForm}>salvar avaliação</Button>
              <span className="text-xs text-muted-foreground">
                fit <b className="tabular-nums">{fitScorePreview}</b> · execução <b className="tabular-nums">{executionScorePreview}</b>
              </span>
            </div>
          </CardContent>
        )}
      </Card>

      {/* fechamento */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Handshake className="h-4 w-4" /> Fechar negócio
            {!podeGerarProposta && <span className="text-xs font-normal text-muted-foreground">disponível após o diagnóstico</span>}
            {podeGerarProposta && (
              <Button size="sm" variant={fecharAberto ? "secondary" : "default"} className="ml-auto h-7"
                onClick={() => setFecharAberto((v) => !v)}>
                {fecharAberto ? "fechar" : "preparar proposta"}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {fechamentos.map((f) => {
            const status = fechamentoStatus(f);
            const snapshot = f.quote_snapshot as CommercialQuote | null;
            return (
            <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm">
              <Badge variant={status.variant}>{status.label}</Badge>
              <span>
                {f.oferta_comercial || f.plano || "Oferta não definida"}
                {snapshot?.billing_type === "one_time" ? ` · ${formatBrl(snapshot.due_at_signature_brl)}` : ""}
                {snapshot?.billing_type === "recurring" ? ` · ${formatBrl(snapshot.recurring_monthly_brl)}/mês` : ""}
                {!snapshot && f.valor ? ` · R$ ${Number(f.valor).toLocaleString("pt-BR")}` : ""}
                {f.periodicidade ? ` · ${f.periodicidade}` : ""}
              </span>
              {f.exclusividade && f.exclusividade_fim && (
                <span className="text-xs text-muted-foreground">exclusiva {f.exclusividade_cidade} até {f.exclusividade_fim.split("-").reverse().join("/")}</span>
              )}
              {f.asaas_payment_link && (
                <a href={f.asaas_payment_link} target="_blank" rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-xs underline">
                  cobrança <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {f.termo_token && (
                <a href={`https://api.simbiosedigital.com/proposta/${f.termo_token}.pdf`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs underline">
                  proposta PDF <FileDown className="h-3 w-3" />
                </a>
              )}
            </div>
            );
          })}
          {fecharAberto && podeGerarProposta && (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2">
                <Button type="button" size="sm" variant="outline" disabled={gerandoRascunho} onClick={gerarRascunho}>
                  <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
                  {gerandoRascunho ? "gerando rascunho…" : "Gerar rascunho com IA"}
                </Button>
                <span className="text-xs text-muted-foreground">Preenche apenas evidências disponíveis; revisão humana continua obrigatória.</span>
              </div>
              {evidenciasAusentes.length > 0 && (
                <div className="rounded-md border border-amber-400/50 bg-amber-500/5 p-2 text-xs text-amber-800">
                  Evidências a completar: {evidenciasAusentes.join(", ")}.
                </div>
              )}
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {(catalogo?.offers || []).map((offer) => (
                  <button
                    key={offer.id}
                    type="button"
                    className={`rounded-md border p-3 text-left transition-colors ${fc.offer_id === offer.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                    onClick={() => selecionarOferta(offer.id)}
                  >
                    <span className="font-semibold">{offer.label}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{offer.audience}</span>
                    <span className="mt-2 block text-xs">{offer.includes.slice(0, 3).join(" · ")}</span>
                  </button>
                ))}
              </div>
              {ofertaSelecionada && (
                <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                  {ofertaSelecionada.billing_type === "recurring" && (
                    <label className="flex flex-col gap-1 text-xs">
                      Modalidade
                      <select
                        value={fc.commitment}
                        className="h-9 rounded-md border bg-background px-3 text-sm"
                        onChange={(e) => {
                          setFc((current) => ({ ...current, commitment: e.target.value as Commitment }));
                          setCotacao(null); setQuoteId(""); setPropostaAprovada(false);
                        }}
                      >
                        <option value="mensal">Mensal - preço-base</option>
                        <option value="trimestral">Trimestral - 5% na base</option>
                        <option value="anual">Anual - 10% na base</option>
                      </select>
                    </label>
                  )}
                  {adicionaisDisponiveis.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium">Adicionais fixos</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {adicionaisDisponiveis.map((addon) => {
                          const selected = fc.addons.find((item) => item.id === addon.id);
                          return (
                            <label key={addon.id} className="flex items-center gap-2 rounded border bg-background p-2 text-xs">
                              <input
                                type="checkbox"
                                checked={Boolean(selected)}
                                onChange={(e) => atualizarAdicional(addon.id, e.target.checked)}
                              />
                              <span className="flex-1">{addon.label}</span>
                              {selected && (
                                <Input
                                  type="number" min={1} max={100} aria-label={`Quantidade de ${addon.label}`}
                                  className="h-7 w-16"
                                  value={selected.quantity}
                                  onChange={(e) => atualizarAdicional(addon.id, true, Number(e.target.value) || 1)}
                                />
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <Button type="button" size="sm" variant="outline" disabled={calculandoCotacao} onClick={calcularCotacao}>
                    <Calculator className="mr-1.5 h-3.5 w-3.5" />
                    {calculandoCotacao ? "calculando…" : "Calcular cotação oficial"}
                  </Button>
                </div>
              )}
              {cotacao && (
                <div className="grid gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 sm:grid-cols-3">
                  <div><span className="block text-xs text-muted-foreground">No aceite</span><b>{formatBrl(cotacao.due_at_signature_brl)}</b></div>
                  <div><span className="block text-xs text-muted-foreground">No go-live</span><b>{cotacao.billing_type === "recurring" ? `${formatBrl(cotacao.due_at_go_live_brl)}/mês` : "—"}</b></div>
                  <div><span className="block text-xs text-muted-foreground">Compromisso mínimo</span><b>{formatBrl(cotacao.minimum_commitment_total_brl)}</b></div>
                  <p className="sm:col-span-3 text-xs text-muted-foreground">
                    Snapshot {cotacao.catalog_version} · setup e adicionais sem desconto · implantação {cotacao.implementation_business_days || "conforme turma"} {cotacao.implementation_business_days ? "dias úteis" : ""}.
                  </p>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="razão social" value={fc.razao_social}
                  onChange={(e) => setFc({ ...fc, razao_social: e.target.value })} />
                <Input placeholder="responsável" value={fc.responsavel}
                  onChange={(e) => setFc({ ...fc, responsavel: e.target.value })} />
                <Input placeholder="decisor responsável pela aprovação" value={fc.decisor_nome}
                  onChange={(e) => setFc({ ...fc, decisor_nome: e.target.value })} />
                <Input placeholder="CNPJ do cliente (obrigatório p/ cobrança)" value={fc.cnpj_cliente}
                  onChange={(e) => setFc({ ...fc, cnpj_cliente: e.target.value })} />
                <Input placeholder="e-mail" value={fc.email} onChange={(e) => setFc({ ...fc, email: e.target.value })} />
                <Input placeholder="WhatsApp (com DDD)" value={fc.whatsapp}
                  onChange={(e) => setFc({ ...fc, whatsapp: e.target.value })} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Textarea rows={3} placeholder="Objetivo e critérios de decisão *" value={fc.objetivo}
                  onChange={(e) => setFc({ ...fc, objetivo: e.target.value })} />
                <Textarea rows={3} placeholder="Próximo passo acordado e data *" value={fc.proximo_passo}
                  onChange={(e) => setFc({ ...fc, proximo_passo: e.target.value })} />
              </div>
              <p className="text-xs text-muted-foreground">
                O CRM gera a proposta PDF e o termo do mesmo snapshot. A cobrança de assinatura
                nasce após o aceite; a recorrência começa somente no go-live aceito.
              </p>
              <label className="flex items-start gap-2 rounded-md border p-2 text-xs">
                <input
                  type="checkbox"
                  checked={propostaAprovada}
                  onChange={(e) => setPropostaAprovada(e.target.checked)}
                />
                Revisei dor, objetivo, oferta, escopo, exclusões, investimento, decisor e próximo passo; aprovo o envio.
              </label>
              <Button size="sm" disabled={salvando || !cotacao || !propostaAprovada} onClick={fecharNegocio}>
                {salvando ? "gerando…" : "aprovar e enviar PDF + termo"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
