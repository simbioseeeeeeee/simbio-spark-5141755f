import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { estagioLabel, ORIGEM_COMERCIAL_LABEL, type OrigemComercial } from "@/types/lead";
import type { MidiaLinha } from "@/store/campanhas-store";

type Summary = {
  leads_created: number; meetings_scheduled: number; meetings_held: number; no_shows: number;
  closed: number; closed_mrr: number; approved_pipeline: number; spend: number; qualified: number;
  waiting_replies: number; outside_crm: number;
};
type Dashboard = {
  summary: Summary;
  stages: { stage: string; leads: number; mrr: number }[];
  temperatures: { temperature: string; leads: number; mrr: number }[];
  origins: { origin: OrigemComercial; leads_created: number; qualified: number; closed: number }[];
};
type PendingMrr = { cnpj: string; fantasia: string | null; razao_social: string | null; estagio_funil: string | null };
type QualifiedMeeting = { cnpj: string; origem_comercial: OrigemComercial | null; reuniao_realizada_em: string };

const PROPOSAL_STAGES = ["Proposta Enviada", "Em Negociação", "Aguardando Aceite", "Aguardando Pagamento"];
const MRR_STAGES = [...PROPOSAL_STAGES, "Fechado Ganho"];
const money = (value?: number | null) => value == null ? "—" : Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const number = (value?: number | null) => value == null ? "—" : Number(value).toLocaleString("pt-BR");

function brtDate(daysAgo = 0) {
  const now = new Date();
  now.setDate(now.getDate() - daysAgo);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

function Metric({ label, value, note, emphasis = false }: { label: string; value: string | number; note?: string; emphasis?: boolean }) {
  return <Card className={emphasis ? "border-primary/50 bg-primary/[0.035]" : ""}><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>{note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}</CardContent></Card>;
}

export function CommercialIntelligence({ period }: { period: number }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [media, setMedia] = useState<MidiaLinha[]>([]);
  const [qualifiedMeetings, setQualifiedMeetings] = useState<QualifiedMeeting[]>([]);
  const [pendingMrr, setPendingMrr] = useState<PendingMrr[]>([]);
  const [mrrValues, setMrrValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const today = brtDate();
  const [investment, setInvestment] = useState({ period_start: today, period_end: today, origem_comercial: "diagnostico" as OrigemComercial, campaign_name: "", amount: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const from = brtDate(period - 1);
    const [dashboardResponse, mediaResponse, qualifiedResponse, pendingResponse] = await Promise.all([
      (supabase.rpc as any)("crm_commercial_dashboard", { p_days: period }),
      supabase.from("vw_simbiose_midia_diaria" as any).select("*").gte("dia", from).lte("dia", brtDate()).order("dia"),
      supabase.from("leads").select("cnpj,origem_comercial,reuniao_realizada_em").is("deleted_at", null).gte("reuniao_realizada_em", `${from}T00:00:00-03:00`).lte("reuniao_realizada_em", `${brtDate()}T23:59:59-03:00`),
      supabase.from("leads").select("cnpj,fantasia,razao_social,estagio_funil").is("deleted_at", null).in("estagio_funil", MRR_STAGES).is("mrr_proposta", null).order("stage_changed_at", { ascending: false }).limit(20),
    ]);
    if (dashboardResponse.error) toast({ title: "Painel comercial indisponível", description: dashboardResponse.error.message, variant: "destructive" });
    else setData(dashboardResponse.data as Dashboard);
    if (mediaResponse.error) toast({ title: "Custos de mídia indisponíveis", description: mediaResponse.error.message, variant: "destructive" });
    else setMedia(((mediaResponse.data as any[]) || []).map((row) => ({ ...row, gasto: Number(row.gasto || 0), leads: Number(row.leads || 0), impressoes: Number(row.impressoes || 0), cliques: Number(row.cliques || 0) })) as MidiaLinha[]);
    if (qualifiedResponse.error) toast({ title: "Reuniões realizadas indisponíveis", description: qualifiedResponse.error.message, variant: "destructive" });
    else setQualifiedMeetings((qualifiedResponse.data || []) as QualifiedMeeting[]);
    if (!pendingResponse.error) setPendingMrr((pendingResponse.data || []) as PendingMrr[]);
    setLoading(false);
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  const mediaSummary = useMemo(() => {
    const campaigns = new Map<string, { name: string; spend: number; leads: number }>();
    let spend = 0; let leads = 0;
    for (const row of media) {
      spend += row.gasto; leads += row.leads;
      const key = row.campaign_id || row.campaign_name || "sem-campanha";
      const current = campaigns.get(key) || { name: row.campaign_name || "Campanha sem nome", spend: 0, leads: 0 };
      current.spend += row.gasto; current.leads += row.leads; campaigns.set(key, current);
    }
    return { spend, leads, campaigns: [...campaigns.values()].sort((a, b) => b.spend - a.spend) };
  }, [media]);

  const qualifiedByOrigin = useMemo(() => {
    const counts = new Map<string, number>();
    for (const meeting of qualifiedMeetings) {
      const origin = meeting.origem_comercial || "outros";
      counts.set(origin, (counts.get(origin) || 0) + 1);
    }
    return counts;
  }, [qualifiedMeetings]);

  const addInvestment = async () => {
    if (!investment.campaign_name.trim() || !investment.amount || Number(investment.amount) < 0) {
      toast({ title: "Preencha descrição e custo extra", variant: "destructive" }); return;
    }
    setSaving("investment");
    const { error } = await (supabase.from("crm_channel_investments") as any).insert({ ...investment, amount: Number(investment.amount) });
    setSaving(null);
    if (error) { toast({ title: "Erro ao registrar custo", description: error.message, variant: "destructive" }); return; }
    setInvestment((current) => ({ ...current, campaign_name: "", amount: "" }));
    toast({ title: "Custo extra registrado" }); void load();
  };

  const saveMrr = async (lead: PendingMrr) => {
    const value = Number(mrrValues[lead.cnpj]);
    if (!Number.isFinite(value) || value < 0) { toast({ title: "Informe um MRR válido", variant: "destructive" }); return; }
    setSaving(lead.cnpj);
    const { error } = await supabase.from("leads").update({ mrr_proposta: value } as any).eq("cnpj", lead.cnpj);
    setSaving(null);
    if (error) { toast({ title: "MRR não foi salvo", description: error.message, variant: "destructive" }); return; }
    toast({ title: "MRR atualizado", description: lead.fantasia || lead.razao_social || "Lead" }); void load();
  };

  if (loading && !data) return <Card><CardContent className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></CardContent></Card>;
  if (!data) return null;
  const s = data.summary;
  const pipelineMrr = data.stages.filter((row) => PROPOSAL_STAGES.includes(row.stage)).reduce((sum, row) => sum + Number(row.mrr || 0), 0);
  const contractedMrr = data.stages.filter((row) => row.stage === "Fechado Ganho").reduce((sum, row) => sum + Number(row.mrr || 0), 0);
  const totalSpend = mediaSummary.spend + Number(s.spend || 0);
  const costPerLead = mediaSummary.leads > 0 ? mediaSummary.spend / mediaSummary.leads : null;
  const qualified = qualifiedMeetings.length;
  const costPerQualified = qualified > 0 ? totalSpend / qualified : null;
  const costPerClose = s.closed > 0 ? totalSpend / s.closed : null;
  const realizedPayback = s.closed_mrr > 0 ? totalSpend / s.closed_mrr : null;
  const projectedPayback = s.approved_pipeline > 0 ? totalSpend / (s.approved_pipeline * 0.8) : null;

  return (
    <Card className="border-primary/40 shadow-sm">
      <CardHeader className="pb-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="text-base">Receita, custo e payback</CardTitle><p className="mt-1 text-xs text-muted-foreground">Mídia importada automaticamente + MRR registrado no pipeline · últimos {period} dia(s)</p></div><div className="flex items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-xs text-success"><CheckCircle2 className="h-3 w-3" />Meta sincronizada</span><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Atualizar</Button></div></div></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <Metric label="Investimento total" value={money(totalSpend)} note={`${money(mediaSummary.spend)} Meta · ${money(s.spend)} extras`} emphasis />
          <Metric label="MRR em propostas" value={money(pipelineMrr)} note="Propostas realizadas e em negociação" emphasis />
          <Metric label="MRR aprovado" value={money(s.approved_pipeline)} note="Sinal verde, antes do fechamento" emphasis />
          <Metric label="Projeção a 80%" value={money(s.approved_pipeline * 0.8)} note="Pipeline aprovado × 80%" emphasis />
          <Metric label="MRR contratado atual" value={money(contractedMrr)} note={`${money(s.closed_mrr)} fechado no período`} emphasis />
          <Metric label="Custo por lead de mídia" value={money(costPerLead)} note={`${mediaSummary.leads} lead(s) atribuídos pela Meta`} />
          <Metric label="Custo por oportunidade qualificada" value={money(costPerQualified)} note={`${qualified} reunião(ões) realizada(s) no período`} />
          <Metric label="Custo por fechamento" value={money(costPerClose)} />
          <Metric label="Payback realizado" value={realizedPayback == null ? "—" : `${realizedPayback.toFixed(1)} meses`} />
          <Metric label="Payback projetado" value={projectedPayback == null ? "—" : `${projectedPayback.toFixed(1)} meses`} note="Sobre a projeção de 80%" />
        </div>

        {pendingMrr.length > 0 && <div className="rounded-lg border border-amber-400/60 bg-amber-500/5 p-4"><div className="mb-3 flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" /><div><p className="text-sm font-semibold">{pendingMrr.length} negócio(s) sem MRR</p><p className="text-xs text-muted-foreground">Enquanto estiverem vazios, pipeline, projeção e payback ficam incompletos. Preencha aqui mesmo.</p></div></div><div className="space-y-2">{pendingMrr.slice(0, 6).map((lead) => <div key={lead.cnpj} className="flex flex-col gap-2 rounded-md border bg-background p-2 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{lead.fantasia || lead.razao_social || "Lead sem nome"}</p><p className="text-xs text-muted-foreground">{estagioLabel(lead.estagio_funil)}</p></div><div className="flex gap-2"><Input type="number" min={0} step="0.01" className="w-40" placeholder="MRR em R$" value={mrrValues[lead.cnpj] || ""} onChange={(event) => setMrrValues((current) => ({ ...current, [lead.cnpj]: event.target.value }))} /><Button size="sm" onClick={() => void saveMrr(lead)} disabled={saving === lead.cnpj}>{saving === lead.cnpj ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar MRR"}</Button></div></div>)}</div></div>}

        <Tabs defaultValue="summary">
          <TabsList><TabsTrigger value="summary">Resumo</TabsTrigger><TabsTrigger value="pipeline">Pipeline e MRR</TabsTrigger><TabsTrigger value="costs">Custos por campanha</TabsTrigger><TabsTrigger value="internal">Operação interna</TabsTrigger></TabsList>
          <TabsContent value="summary" className="space-y-4 pt-3"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Leads criados" value={number(s.leads_created)} /><Metric label="Reuniões agendadas" value={number(s.meetings_scheduled)} /><Metric label="Reuniões realizadas" value={number(qualified)} note={`${s.no_shows} no-show(s)`} /><Metric label="Fechamentos" value={number(s.closed)} /></div><Table><TableHeader><TableRow><TableHead>Origem</TableHead><TableHead className="text-right">Leads</TableHead><TableHead className="text-right">Qualificados</TableHead><TableHead className="text-right">Fechamentos</TableHead></TableRow></TableHeader><TableBody>{data.origins.map((row) => <TableRow key={row.origin}><TableCell>{ORIGEM_COMERCIAL_LABEL[row.origin] || row.origin}</TableCell><TableCell className="text-right">{row.leads_created}</TableCell><TableCell className="text-right">{qualifiedByOrigin.get(row.origin) || 0}</TableCell><TableCell className="text-right">{row.closed}</TableCell></TableRow>)}</TableBody></Table></TabsContent>
          <TabsContent value="pipeline" className="grid gap-4 pt-3 lg:grid-cols-2"><Table><TableHeader><TableRow><TableHead>Etapa atual</TableHead><TableHead className="text-right">Leads</TableHead><TableHead className="text-right">MRR</TableHead></TableRow></TableHeader><TableBody>{data.stages.map((row) => <TableRow key={row.stage}><TableCell>{estagioLabel(row.stage)}</TableCell><TableCell className="text-right">{row.leads}</TableCell><TableCell className="text-right font-medium">{money(row.mrr)}</TableCell></TableRow>)}</TableBody></Table><Table><TableHeader><TableRow><TableHead>Temperatura</TableHead><TableHead className="text-right">Leads ativos</TableHead><TableHead className="text-right">MRR</TableHead></TableRow></TableHeader><TableBody>{data.temperatures.map((row) => <TableRow key={row.temperature}><TableCell className="capitalize">{row.temperature.replace("sem_classificar", "Sem classificar")}</TableCell><TableCell className="text-right">{row.leads}</TableCell><TableCell className="text-right">{money(row.mrr)}</TableCell></TableRow>)}</TableBody></Table></TabsContent>
          <TabsContent value="costs" className="space-y-4 pt-3"><Table><TableHeader><TableRow><TableHead>Campanha Meta</TableHead><TableHead className="text-right">Investimento</TableHead><TableHead className="text-right">Leads</TableHead><TableHead className="text-right">CPL</TableHead></TableRow></TableHeader><TableBody>{mediaSummary.campaigns.map((campaign) => <TableRow key={campaign.name}><TableCell className="max-w-[380px] truncate" title={campaign.name}>{campaign.name}</TableCell><TableCell className="text-right">{money(campaign.spend)}</TableCell><TableCell className="text-right">{campaign.leads}</TableCell><TableCell className="text-right">{money(campaign.leads > 0 ? campaign.spend / campaign.leads : null)}</TableCell></TableRow>)}</TableBody></Table>{mediaSummary.campaigns.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma entrega de mídia no período.</p>}<div className="rounded-md border p-3"><p className="mb-1 text-sm font-medium">Adicionar custo fora da Meta</p><p className="mb-3 text-xs text-muted-foreground">A mídia Meta já entra automaticamente. Use apenas para evento, ferramenta, produção ou outro custo não importado.</p><div className="grid gap-3 md:grid-cols-5"><div><Label>Início</Label><Input type="date" value={investment.period_start} onChange={(e) => setInvestment({ ...investment, period_start: e.target.value })} /></div><div><Label>Fim</Label><Input type="date" value={investment.period_end} onChange={(e) => setInvestment({ ...investment, period_end: e.target.value })} /></div><div><Label>Origem</Label><Select value={investment.origem_comercial} onValueChange={(v) => setInvestment({ ...investment, origem_comercial: v as OrigemComercial })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(Object.entries(ORIGEM_COMERCIAL_LABEL) as [OrigemComercial, string][]).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div><Label>Descrição</Label><Input value={investment.campaign_name} onChange={(e) => setInvestment({ ...investment, campaign_name: e.target.value })} /></div><div><Label>Custo (R$)</Label><div className="flex gap-2"><Input type="number" min={0} step="0.01" value={investment.amount} onChange={(e) => setInvestment({ ...investment, amount: e.target.value })} /><Button size="icon" onClick={addInvestment} disabled={saving === "investment"}>{saving === "investment" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}</Button></div></div></div></div></TabsContent>
          <TabsContent value="internal" className="grid gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Aguardando nossa resposta" value={s.waiting_replies} note="Número do Guilherme" /><Metric label="Conversas fora do CRM" value={s.outside_crm} note="Número do Guilherme" /><Metric label="Gasto Meta" value={money(mediaSummary.spend)} /><Metric label="Custos extras" value={money(s.spend)} /></TabsContent>
        </Tabs>
        <p className="text-xs text-muted-foreground">Custos vêm da visão diária da conta de anúncios. As métricas do período usam eventos ocorridos no intervalo, independentemente da data de criação do lead.</p>
      </CardContent>
    </Card>
  );
}
