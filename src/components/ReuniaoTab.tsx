import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  Copy, Ban, Plus, Trash2, ThumbsUp, ThumbsDown, CircleDashed,
  ClipboardCheck, Handshake, ExternalLink,
} from "lucide-react";
import {
  listarObjecoes, objecoesDoLead, marcarObjecao, atualizarObjecaoLead, removerObjecaoLead,
  calcularScore, pontosDeMelhoria, salvarAvaliacao, avaliacoesDoLead,
  fechamentosDoLead, criarFechamento,
  PROMPTS_REUNIAO, GATILHOS_AVANCO, DESFECHO_LABEL, CATEGORIA_LABEL,
  type Objecao, type LeadObjecao, type Avaliacao, type FaixaFala, type Desfecho,
  type Fechamento, type CategoriaObjecao,
} from "@/store/playbook-store";

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
}

const FAIXAS: { v: FaixaFala; label: string }[] = [
  { v: "<40", label: "menos de 40%" }, { v: "40-60", label: "40–60%" },
  { v: "60-80", label: "60–80%" }, { v: ">80", label: "mais de 80%" },
];

export function ReuniaoTab({ cnpj, nome, cidade, estagioFunil, email, whatsapp, userName }: Props) {
  const [matriz, setMatriz] = useState<Objecao[]>([]);
  const [marcadas, setMarcadas] = useState<LeadObjecao[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([]);
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [formAberto, setFormAberto] = useState(false);
  const [fecharAberto, setFecharAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [av, setAv] = useState<Avaliacao>({
    lead_cnpj: cnpj, decisor_presente: false, duracao_min: null, fala_closer_faixa: null,
    preco_apresentado: false, preco_minuto: null, preco_tratado_na_hora: null,
    desconto_sem_contrapartida: false, gatilhos_avanco: [], desfecho: null,
    proximo_passo_data: null, obs: null,
  });

  const [fc, setFc] = useState({
    plano: "Operação completa", valor: "3000", periodicidade: "mensal",
    exclusividade: false, exclusividade_cidade: cidade || "", exclusividade_meses: "6",
    email: email || "", whatsapp: whatsapp || "", razao_social: nome, responsavel: "",
    cnpj_cliente: cnpj.match(/^\d{14}/) ? cnpj.replace(/\D/g, "").slice(0, 14) : "",
  });

  const load = useCallback(async () => {
    try {
      const [m, lo, avs, fs] = await Promise.all([
        listarObjecoes(), objecoesDoLead(cnpj), avaliacoesDoLead(cnpj), fechamentosDoLead(cnpj),
      ]);
      setMatriz(m); setMarcadas(lo); setAvaliacoes(avs); setFechamentos(fs);
    } catch (e: any) {
      toast({ title: "Erro ao carregar a aba Reunião", description: e?.message, variant: "destructive" });
    }
  }, [cnpj]);
  useEffect(() => { load(); }, [load]);

  const porId = useMemo(() => new Map(matriz.map((o) => [o.id, o])), [matriz]);
  const categoriasMarcadas = useMemo(
    () => [...new Set(marcadas.map((m) => porId.get(m.objecao_id)?.categoria).filter(Boolean))] as CategoriaObjecao[],
    [marcadas, porId]);
  const temDesqualificante = marcadas.some((m) => porId.get(m.objecao_id)?.desqualifica);
  const scorePreview = calcularScore(av, categoriasMarcadas);
  const pontos = avaliacoes.length
    ? pontosDeMelhoria(avaliacoes[0], categoriasMarcadas) : [];

  function copiar(texto: string, id: string) {
    navigator.clipboard.writeText(texto);
    toast({ title: `${id} copiado`, description: "cola no chat do Gemini" });
  }

  async function marcar(objecaoId: string) {
    try {
      await marcarObjecao(cnpj, objecaoId, userName);
      setSeletorAberto(false);
      load();
    } catch (e: any) {
      toast({ title: "Não marcou", description: e?.message, variant: "destructive" });
    }
  }

  async function salvarForm() {
    setSalvando(true);
    try {
      const score = calcularScore(av, categoriasMarcadas);
      await salvarAvaliacao({ ...av, score, created_by: userName } as Avaliacao);
      toast({ title: `Reunião avaliada — score ${score}`, description: "pontos de melhoria atualizados no card" });
      setFormAberto(false);
      load();
    } catch (e: any) {
      toast({ title: "Não salvou a avaliação", description: e?.message, variant: "destructive" });
    } finally { setSalvando(false); }
  }

  async function fecharNegocio() {
    setSalvando(true);
    try {
      const meses = parseInt(fc.exclusividade_meses) || 6;
      const hoje = new Date();
      const fim = new Date(hoje); fim.setMonth(fim.getMonth() + meses);
      const r = await criarFechamento({
        lead_cnpj: cnpj, plano: fc.plano, valor: parseFloat(fc.valor),
        periodicidade: fc.periodicidade,
        exclusividade: fc.exclusividade,
        exclusividade_cidade: fc.exclusividade ? fc.exclusividade_cidade : null,
        exclusividade_inicio: fc.exclusividade ? hoje.toISOString().slice(0, 10) : null,
        exclusividade_fim: fc.exclusividade ? fim.toISOString().slice(0, 10) : null,
        email: fc.email, whatsapp: fc.whatsapp,
        razao_social: fc.razao_social, responsavel: fc.responsavel,
        cnpj_cliente: fc.cnpj_cliente,
      });
      toast({ title: "Termo enviado", description: `aceite: ${r.termo_url}` });
      setFecharAberto(false);
      load();
    } catch (e: any) {
      toast({ title: "Não fechou", description: e?.message, variant: "destructive" });
    } finally { setSalvando(false); }
  }

  const noFunilCloser = !!estagioFunil && !["Fechado Ganho", "Fechado Perdido"].includes(estagioFunil);

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
          <CardHeader className="pb-2"><CardTitle className="text-sm">Pontos de melhoria — última reunião (score {avaliacoes[0]?.score ?? "—"})</CardTitle></CardHeader>
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
                    {m.superada === null && <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" title="em aberto" />}
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
                última: score {avaliacoes[0].score} · {avaliacoes[0].desfecho ? DESFECHO_LABEL[avaliacoes[0].desfecho] : "—"}
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
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={av.preco_apresentado}
                  onChange={(e) => setAv({ ...av, preco_apresentado: e.target.checked })} />
                Preço apresentado
              </label>
              <label className="flex items-center gap-2">
                Preço citado no min.
                <Input type="number" className="h-8 w-20" value={av.preco_minuto ?? ""}
                  onChange={(e) => setAv({ ...av, preco_minuto: e.target.value ? +e.target.value : null })} />
              </label>
              {av.preco_minuto !== null && av.preco_minuto < 20 && (
                <label className="flex items-center gap-2 sm:col-span-2">
                  <input type="checkbox" checked={av.preco_tratado_na_hora === true}
                    onChange={(e) => setAv({ ...av, preco_tratado_na_hora: e.target.checked })} />
                  Parei a apresentação e tratei o preço na hora (OBJ-009)
                </label>
              )}
              <label className="flex items-center gap-2 sm:col-span-2">
                <input type="checkbox" checked={av.desconto_sem_contrapartida}
                  onChange={(e) => setAv({ ...av, desconto_sem_contrapartida: e.target.checked })} />
                Concedi desconto sem contrapartida
              </label>
            </div>
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
              <span className="text-xs text-muted-foreground">score parcial: <b className="tabular-nums">{scorePreview}</b>/100</span>
            </div>
          </CardContent>
        )}
      </Card>

      {/* fechamento */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Handshake className="h-4 w-4" /> Fechar negócio
            {!noFunilCloser && <span className="text-xs font-normal text-muted-foreground">disponível no funil do Closer</span>}
            {noFunilCloser && (
              <Button size="sm" variant={fecharAberto ? "secondary" : "default"} className="ml-auto h-7"
                onClick={() => setFecharAberto((v) => !v)}>
                {fecharAberto ? "fechar" : "gerar termo"}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {fechamentos.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm">
              <Badge variant={f.status === "pago" ? "default" : f.status === "vencido" ? "destructive" : "secondary"}>
                {f.status.replace("_", " ")}
              </Badge>
              <span>{f.plano} · R$ {Number(f.valor).toLocaleString("pt-BR")} · {f.periodicidade}</span>
              {f.exclusividade && f.exclusividade_fim && (
                <span className="text-xs text-muted-foreground">exclusiva {f.exclusividade_cidade} até {f.exclusividade_fim.split("-").reverse().join("/")}</span>
              )}
              {f.asaas_payment_link && (
                <a href={f.asaas_payment_link} target="_blank" rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-xs underline">
                  cobrança <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ))}
          {fecharAberto && noFunilCloser && (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="plano" value={fc.plano} onChange={(e) => setFc({ ...fc, plano: e.target.value })} />
                <div className="flex gap-2">
                  <Input type="number" placeholder="valor" value={fc.valor}
                    onChange={(e) => setFc({ ...fc, valor: e.target.value })} />
                  <select value={fc.periodicidade} className="rounded-md border bg-background px-2"
                    onChange={(e) => setFc({ ...fc, periodicidade: e.target.value })}>
                    <option value="mensal">mensal</option>
                    <option value="trimestral">trimestral</option>
                    <option value="anual">anual</option>
                  </select>
                </div>
                <Input placeholder="razão social" value={fc.razao_social}
                  onChange={(e) => setFc({ ...fc, razao_social: e.target.value })} />
                <Input placeholder="responsável" value={fc.responsavel}
                  onChange={(e) => setFc({ ...fc, responsavel: e.target.value })} />
                <Input placeholder="CNPJ do cliente (obrigatório p/ cobrança)" value={fc.cnpj_cliente}
                  onChange={(e) => setFc({ ...fc, cnpj_cliente: e.target.value })} />
                <Input placeholder="e-mail" value={fc.email} onChange={(e) => setFc({ ...fc, email: e.target.value })} />
                <Input placeholder="WhatsApp (com DDD)" value={fc.whatsapp}
                  onChange={(e) => setFc({ ...fc, whatsapp: e.target.value })} />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={fc.exclusividade}
                  onChange={(e) => setFc({ ...fc, exclusividade: e.target.checked })} />
                Exclusividade na cidade (R5: sempre com janela)
              </label>
              {fc.exclusividade && (
                <div className="flex gap-2">
                  <Input placeholder="cidade" value={fc.exclusividade_cidade}
                    onChange={(e) => setFc({ ...fc, exclusividade_cidade: e.target.value })} />
                  <select value={fc.exclusividade_meses} className="rounded-md border bg-background px-2"
                    onChange={(e) => setFc({ ...fc, exclusividade_meses: e.target.value })}>
                    {/* política 14/08: começa em 3, máximo 6 — nunca 12, nunca aberta (R5) */}
                    <option value="3">3 meses</option><option value="6">6 meses</option>
                  </select>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Gera o termo de aceite (não é contrato — R6) + cobrança no Asaas, e envia por
                e-mail e WhatsApp. O pagamento NÃO é cobrado na reunião (R7) — o card espera o
                webhook confirmar.
              </p>
              <Button size="sm" disabled={salvando} onClick={fecharNegocio}>
                {salvando ? "gerando…" : "gerar termo + cobrança"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
