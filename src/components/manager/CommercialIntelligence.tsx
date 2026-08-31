import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { estagioLabel, ORIGEM_COMERCIAL_LABEL, type OrigemComercial } from "@/types/lead";

type Summary = {
  leads_created: number; meetings_scheduled: number; meetings_held: number; no_shows: number;
  closed: number; closed_mrr: number; approved_pipeline: number; projected_mrr_80: number;
  spend: number; qualified: number; cost_per_qualified: number | null; cost_per_close: number | null;
  realized_payback_months: number | null; projected_payback_months: number | null;
  waiting_replies: number; outside_crm: number;
};
type Dashboard = {
  summary: Summary;
  stages: { stage: string; leads: number; mrr: number }[];
  temperatures: { temperature: string; leads: number; mrr: number }[];
  origins: { origin: OrigemComercial; leads_created: number; qualified: number; closed: number; spend: number; cost_per_qualified: number | null; cost_per_close: number | null }[];
};

const money = (value?: number | null) => value == null ? "—" : Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const number = (value?: number | null) => value == null ? "—" : Number(value).toLocaleString("pt-BR");

function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>{note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}</CardContent></Card>;
}

export function CommercialIntelligence({ period }: { period: number }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [investment, setInvestment] = useState({ period_start: today, period_end: today, origem_comercial: "diagnostico" as OrigemComercial, campaign_name: "", amount: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const { data: result, error } = await (supabase.rpc as any)("crm_commercial_dashboard", { p_days: period });
    if (error) toast({ title: "Inteligência comercial indisponível", description: error.message, variant: "destructive" });
    else setData(result as Dashboard);
    setLoading(false);
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  const addInvestment = async () => {
    if (!investment.campaign_name.trim() || !investment.amount || Number(investment.amount) < 0) {
      toast({ title: "Preencha campanha e investimento", variant: "destructive" }); return;
    }
    setSaving(true);
    const { error } = await (supabase.from("crm_channel_investments") as any).insert({ ...investment, amount: Number(investment.amount) });
    setSaving(false);
    if (error) { toast({ title: "Erro ao registrar investimento", description: error.message, variant: "destructive" }); return; }
    setInvestment((current) => ({ ...current, campaign_name: "", amount: "" }));
    toast({ title: "Investimento registrado" });
    void load();
  };

  if (loading && !data) return <Card><CardContent className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></CardContent></Card>;
  if (!data) return null;
  const s = data.summary;

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3"><CardTitle className="text-base">Inteligência comercial</CardTitle><Button variant="ghost" size="sm" onClick={() => void load()}><RefreshCw className="mr-1 h-3.5 w-3.5" />Atualizar</Button></div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="weekly">
          <TabsList><TabsTrigger value="weekly">Semanal</TabsTrigger><TabsTrigger value="internal">Interno</TabsTrigger><TabsTrigger value="investment">Investimentos</TabsTrigger></TabsList>
          <TabsContent value="weekly" className="space-y-4 pt-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Leads criados" value={number(s.leads_created)} />
              <Metric label="Reuniões agendadas" value={number(s.meetings_scheduled)} />
              <Metric label="Reuniões realizadas" value={number(s.meetings_held)} note={`${s.no_shows} no-show(s)`} />
              <Metric label="Fechamentos" value={number(s.closed)} note={`${money(s.closed_mrr)} de MRR`} />
              <Metric label="Custo por qualificado" value={money(s.cost_per_qualified)} />
              <Metric label="Custo por fechamento" value={money(s.cost_per_close)} />
              <Metric label="Payback realizado" value={s.realized_payback_months == null ? "—" : `${s.realized_payback_months} meses`} />
              <Metric label="Payback projetado" value={s.projected_payback_months == null ? "—" : `${s.projected_payback_months} meses`} note="Pipeline aprovado × 80%" />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Table><TableHeader><TableRow><TableHead>Etapa atual</TableHead><TableHead className="text-right">Leads</TableHead><TableHead className="text-right">MRR</TableHead></TableRow></TableHeader><TableBody>{data.stages.map((row) => <TableRow key={row.stage}><TableCell>{estagioLabel(row.stage)}</TableCell><TableCell className="text-right">{row.leads}</TableCell><TableCell className="text-right">{money(row.mrr)}</TableCell></TableRow>)}</TableBody></Table>
              <Table><TableHeader><TableRow><TableHead>Origem</TableHead><TableHead className="text-right">Leads</TableHead><TableHead className="text-right">Qualif.</TableHead><TableHead className="text-right">Fech.</TableHead><TableHead className="text-right">Gasto</TableHead></TableRow></TableHeader><TableBody>{data.origins.map((row) => <TableRow key={row.origin}><TableCell>{ORIGEM_COMERCIAL_LABEL[row.origin] || row.origin}</TableCell><TableCell className="text-right">{row.leads_created}</TableCell><TableCell className="text-right">{row.qualified}</TableCell><TableCell className="text-right">{row.closed}</TableCell><TableCell className="text-right">{money(row.spend)}</TableCell></TableRow>)}</TableBody></Table>
            </div>
            <p className="text-xs text-muted-foreground">As métricas do período usam os eventos ocorridos no intervalo, independentemente da data de criação do lead. O histórico confiável de movimentação começa nesta implantação.</p>
          </TabsContent>
          <TabsContent value="internal" className="space-y-4 pt-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Pipeline aprovado" value={money(s.approved_pipeline)} />
              <Metric label="Projeção a 80%" value={money(s.projected_mrr_80)} />
              <Metric label="Aguardando nossa resposta" value={s.waiting_replies} note="Número do Guilherme" />
              <Metric label="Conversas fora do CRM" value={s.outside_crm} note="Número do Guilherme" />
            </div>
            <Table><TableHeader><TableRow><TableHead>Temperatura</TableHead><TableHead className="text-right">Leads ativos</TableHead><TableHead className="text-right">MRR</TableHead></TableRow></TableHeader><TableBody>{data.temperatures.map((row) => <TableRow key={row.temperature}><TableCell className="capitalize">{row.temperature.replace("sem_classificar", "Sem classificar")}</TableCell><TableCell className="text-right">{row.leads}</TableCell><TableCell className="text-right">{money(row.mrr)}</TableCell></TableRow>)}</TableBody></Table>
          </TabsContent>
          <TabsContent value="investment" className="space-y-4 pt-3">
            <p className="text-sm text-muted-foreground">Registre somente valores confirmados por campanha. Nenhum valor de reunião foi presumido.</p>
            <div className="grid gap-3 md:grid-cols-5">
              <div><Label>Início</Label><Input type="date" value={investment.period_start} onChange={(e) => setInvestment({ ...investment, period_start: e.target.value })} /></div>
              <div><Label>Fim</Label><Input type="date" value={investment.period_end} onChange={(e) => setInvestment({ ...investment, period_end: e.target.value })} /></div>
              <div><Label>Origem</Label><Select value={investment.origem_comercial} onValueChange={(v) => setInvestment({ ...investment, origem_comercial: v as OrigemComercial })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(Object.entries(ORIGEM_COMERCIAL_LABEL) as [OrigemComercial, string][]).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Campanha</Label><Input value={investment.campaign_name} onChange={(e) => setInvestment({ ...investment, campaign_name: e.target.value })} /></div>
              <div><Label>Investimento (R$)</Label><div className="flex gap-2"><Input type="number" min={0} step="0.01" value={investment.amount} onChange={(e) => setInvestment({ ...investment, amount: e.target.value })} /><Button size="icon" onClick={addInvestment} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}</Button></div></div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
