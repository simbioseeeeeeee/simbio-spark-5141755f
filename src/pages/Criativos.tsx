import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { apiGet } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import {
  Activity, Check, ChevronDown, ChevronUp, Clapperboard, ExternalLink,
  FolderCheck, History, Image as ImageIcon, Layers3, Pencil, Play,
  RefreshCw, Search, Video, X,
} from "lucide-react";

type Status = "aguardando" | "aprovado" | "ajustar" | "reprovado";
type MetaMode = "active" | "historical" | "all";

type Criativo = {
  id: number; peca: string; trilha: string; angulo: string; destino: string | null;
  preview_url: string | null; endcard: string | null; fala: string | null;
  duracao_seg: number | null; status: Status; nota: string | null;
  aprovado_em: string | null; no_ar: boolean;
};

type MetaAd = {
  ad_id: string; name: string; effective_status: string; is_active: boolean;
  ever_delivered: boolean; last_delivery_on: string | null; campaign_id: string | null;
  campaign_name: string | null; adset_id: string | null; adset_name: string | null;
};

type MetaCreative = {
  creative_id: string | null; name: string; media_type: "video" | "carousel" | "image";
  thumbnail_url: string | null; instagram_permalink_url: string | null;
  source: "meta_ads" | "historical_insights"; is_active: boolean;
  delivered_recently: boolean; ever_delivered: boolean;
  first_tracked_delivery_on: string | null; last_delivery_on: string | null;
  created_time: string | null; metrics: { spend: number; impressions: number; clicks: number };
  ads: MetaAd[];
};

type MetaInventory = {
  ok: true; account_id: string; refreshed_at: string; creatives: MetaCreative[];
  summary: {
    active_creatives: number; delivered_recently: number; historical_creatives: number;
    total_meta_creatives: number; total_meta_ads: number; historical_ads: number;
    historical_ads_without_preview: number; oldest_ad_created_at: string | null;
  };
};

const TRILHA_LABEL: Record<string, string> = {
  conversao: "conversão", objecao: "objeção", live: "live",
};
const int = new Intl.NumberFormat("pt-BR");
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function dataBr(value: string | null | undefined) {
  if (!value) return null;
  const [ano, mes, dia] = value.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : value;
}

function MetaThumbnail({ creative }: { creative: MetaCreative }) {
  const [falhou, setFalhou] = useState(false);
  const Icon = creative.media_type === "video" ? Video
    : creative.media_type === "carousel" ? Layers3 : ImageIcon;
  return (
    <div className="relative aspect-square overflow-hidden bg-muted/40">
      {creative.thumbnail_url && !falhou ? (
        <img src={creative.thumbnail_url} alt={`Preview de ${creative.name}`} loading="lazy"
          className="h-full w-full object-cover" onError={() => setFalhou(true)} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <Icon className="h-9 w-9" /><span className="text-xs">preview indisponível</span>
        </div>
      )}
      <Badge variant="secondary" className="absolute bottom-2 left-2 gap-1 bg-background/90 text-[10px]">
        <Icon className="h-3 w-3" />
        {creative.media_type === "video" ? "vídeo" : creative.media_type === "carousel" ? "carrossel" : "imagem"}
      </Badge>
    </div>
  );
}

function MetaCreativeCard({ creative, accountId }: { creative: MetaCreative; accountId: string }) {
  const [details, setDetails] = useState(false);
  const campaigns = [...new Set(creative.ads.map((ad) => ad.campaign_name).filter(Boolean))] as string[];
  const adsManagerUrl = creative.ads[0]?.ad_id
    ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${accountId}&selected_ad_ids=${creative.ads[0].ad_id}`
    : null;
  return (
    <Card className={creative.is_active ? "border-green-500/60" : ""}>
      <MetaThumbnail creative={creative} />
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium" title={creative.name}>{creative.name}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
              {creative.creative_id ? `creative ${creative.creative_id}` : "registro histórico sem creative_id"}
            </p>
          </div>
          {creative.is_active ? (
            <Badge className="shrink-0 bg-green-600 text-[10px] hover:bg-green-600">Ativo no Meta</Badge>
          ) : creative.ever_delivered ? (
            <Badge variant="outline" className="shrink-0 text-[10px]">Já veiculou</Badge>
          ) : <Badge variant="secondary" className="shrink-0 text-[10px]">Nunca entregou</Badge>}
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div><p className="text-muted-foreground">Investido</p><p className="font-semibold tabular-nums">{brl.format(creative.metrics.spend)}</p></div>
          <div><p className="text-muted-foreground">Impressões</p><p className="font-semibold tabular-nums">{int.format(creative.metrics.impressions)}</p></div>
          <div><p className="text-muted-foreground">Cliques</p><p className="font-semibold tabular-nums">{int.format(creative.metrics.clicks)}</p></div>
        </div>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="truncate" title={campaigns.join(", ")}>
            <b className="text-foreground">Campanha:</b> {campaigns[0] || "não disponível"}{campaigns.length > 1 ? ` +${campaigns.length - 1}` : ""}
          </p>
          <p><b className="text-foreground">Uso:</b> {creative.ads.length} anúncio{creative.ads.length === 1 ? "" : "s"}
            {creative.last_delivery_on ? ` · última entrega ${dataBr(creative.last_delivery_on)}` : ""}</p>
          {creative.is_active && (
            <p className={creative.delivered_recently ? "text-green-600" : "text-amber-600"}>
              {creative.delivered_recently ? "Habilitado e com entrega recente" : "Habilitado, sem entrega observada nos últimos 2 dias"}
            </p>
          )}
        </div>
        <button type="button" onClick={() => setDetails((open) => !open)}
          className="flex w-full items-center justify-between border-t pt-2 text-left text-xs text-muted-foreground hover:text-foreground">
          Ver campanhas e conjuntos
          {details ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {details && (
          <div className="max-h-44 space-y-2 overflow-y-auto border-l pl-3 text-xs">
            {creative.ads.map((ad) => (
              <div key={ad.ad_id}>
                <p className="font-medium">{ad.name}</p>
                <p className="text-muted-foreground">{ad.campaign_name || "campanha não disponível"}</p>
                <p className="text-muted-foreground">{ad.adset_name || "conjunto não disponível"}</p>
                <p className={ad.is_active ? "text-green-600" : "text-muted-foreground"}>
                  {ad.is_active ? "ativo" : ad.effective_status.toLowerCase().replaceAll("_", " ")}
                  {ad.last_delivery_on ? ` · entrega ${dataBr(ad.last_delivery_on)}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          {adsManagerUrl && <Button asChild size="sm" variant="outline" className="flex-1">
            <a href={adsManagerUrl} target="_blank" rel="noreferrer">Abrir no Ads Manager <ExternalLink className="ml-1 h-3.5 w-3.5" /></a>
          </Button>}
          {creative.instagram_permalink_url && <Button asChild size="sm" variant="ghost">
            <a href={creative.instagram_permalink_url} target="_blank" rel="noreferrer">Post</a>
          </Button>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Criativos() {
  const [internosLoading, setInternosLoading] = useState(true);
  const [itens, setItens] = useState<Criativo[]>([]);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<number | null>(null);
  const [editandoNota, setEditandoNota] = useState<number | null>(null);
  const [salvando, setSalvando] = useState<number | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [inventory, setInventory] = useState<MetaInventory | null>(null);
  const [metaMode, setMetaMode] = useState<MetaMode>("active");
  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(24);

  const loadInternos = useCallback(async () => {
    const { data } = await supabase.from("criativos").select("*").order("peca", { ascending: true });
    setItens((data || []) as Criativo[]);
    setInternosLoading(false);
  }, []);

  const loadMeta = useCallback(async (refresh = false) => {
    setMetaLoading(true); setMetaError(null);
    try {
      const data = await apiGet<MetaInventory>(`/api/crm/criativos/meta${refresh ? "?refresh=true" : ""}`);
      setInventory(data);
      if (refresh) toast({ title: "Inventário atualizado", description: "Dados relidos da Meta Ads." });
    } catch (error) {
      setMetaError(error instanceof Error ? error.message : "Não foi possível consultar a Meta Ads.");
    } finally { setMetaLoading(false); }
  }, []);

  useEffect(() => {
    loadInternos(); loadMeta();
    const channel = supabase.channel("criativos-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "criativos" }, loadInternos).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadInternos, loadMeta]);
  useEffect(() => { setLimite(24); }, [metaMode, busca]);

  async function decidir(c: Criativo, status: Status) {
    setSalvando(c.id); const anterior = c.status;
    setItens((prev) => prev.map((x) => x.id === c.id ? { ...x, status } : x));
    const { data: sess } = await supabase.auth.getUser();
    const { error } = await supabase.from("criativos")
      .update({ status, aprovado_por: sess?.user?.email || "crm" }).eq("id", c.id);
    if (error) {
      setItens((prev) => prev.map((x) => x.id === c.id ? { ...x, status: anterior } : x));
      toast({ title: "Não consegui salvar a decisão", description: error.message, variant: "destructive" });
    }
    setSalvando(null);
  }

  async function salvarNota(c: Criativo, nota: string) {
    const anterior = c.nota;
    setItens((prev) => prev.map((x) => x.id === c.id ? { ...x, nota } : x)); setEditandoNota(null);
    const { error } = await supabase.from("criativos").update({ nota: nota || null }).eq("id", c.id);
    if (error) {
      setItens((prev) => prev.map((x) => x.id === c.id ? { ...x, nota: anterior } : x));
      toast({ title: "Não consegui salvar a nota", description: error.message, variant: "destructive" });
    }
  }

  const cont = useMemo(() => {
    const counts: Record<string, number> = { aguardando: 0, aprovado: 0, ajustar: 0, reprovado: 0 };
    for (const item of itens) counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }, [itens]);
  const internosVisiveis = useMemo(
    () => filtro ? itens.filter((item) => item.trilha === filtro || item.status === filtro) : itens,
    [itens, filtro],
  );
  const metaVisiveis = useMemo(() => {
    const query = busca.trim().toLocaleLowerCase("pt-BR");
    return (inventory?.creatives || []).filter((creative) => {
      const modeOk = metaMode === "active" ? creative.is_active : metaMode === "historical" ? creative.ever_delivered : true;
      if (!modeOk) return false;
      if (!query) return true;
      const haystack = [creative.name, creative.creative_id,
        ...creative.ads.flatMap((ad) => [ad.name, ad.ad_id, ad.campaign_name, ad.adset_name])]
        .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
      return haystack.includes(query);
    });
  }, [inventory, metaMode, busca]);

  return (
    <AppLayout><div className="space-y-5 p-4 md:p-6">
      <div><div className="flex items-center gap-2"><Clapperboard className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Criativos</h1></div>
        <p className="mt-1 text-sm text-muted-foreground">O que está no Meta, o que já veiculou e a fila interna de aprovação em um só lugar.</p>
      </div>
      <Tabs defaultValue="meta" className="space-y-4">
        <TabsList>
          <TabsTrigger value="meta" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> Campanhas Meta</TabsTrigger>
          <TabsTrigger value="internal" className="gap-1.5"><FolderCheck className="h-3.5 w-3.5" /> Fila interna</TabsTrigger>
        </TabsList>
        <TabsContent value="meta" className="space-y-4">
          {metaLoading && !inventory ? <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-96 w-full" /></div>
            : metaError && !inventory ? <Card><CardContent className="flex flex-col items-start gap-3 p-5">
              <p className="font-medium">Não consegui carregar os criativos da Meta.</p><p className="text-sm text-muted-foreground">{metaError}</p>
              <Button size="sm" variant="outline" onClick={() => loadMeta()}>Tentar novamente</Button>
            </CardContent></Card> : inventory ? <>
              <Card><CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div>
                  <p className="font-semibold">Inventário real da conta de anúncios</p>
                  <p className="text-xs text-muted-foreground">Inclui uploads feitos direto no Meta. Histórico desde {dataBr(inventory.summary.oldest_ad_created_at) || "o primeiro anúncio disponível"}.</p>
                </div><Button size="sm" variant="outline" disabled={metaLoading} onClick={() => loadMeta(true)}>
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${metaLoading ? "animate-spin" : ""}`} /> Atualizar da Meta
                </Button></div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div><p className="text-2xl font-bold text-green-600">{inventory.summary.active_creatives}</p><p className="text-xs text-muted-foreground">criativos ativos no Meta</p></div>
                  <div><p className="text-2xl font-bold">{inventory.summary.delivered_recently}</p><p className="text-xs text-muted-foreground">com entrega nos últimos 2 dias</p></div>
                  <div><p className="text-2xl font-bold">{inventory.summary.historical_creatives}</p><p className="text-xs text-muted-foreground">já veicularam alguma vez</p></div>
                  <div><p className="text-2xl font-bold">{inventory.summary.total_meta_creatives}</p><p className="text-xs text-muted-foreground">criativos encontrados no Meta</p></div>
                </div>
              </CardContent></Card>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant={metaMode === "active" ? "default" : "outline"} onClick={() => setMetaMode("active")}><Activity className="mr-1 h-3.5 w-3.5" /> Em veiculação ({inventory.summary.active_creatives})</Button>
                  <Button size="sm" variant={metaMode === "historical" ? "default" : "outline"} onClick={() => setMetaMode("historical")}><History className="mr-1 h-3.5 w-3.5" /> Já veiculados ({inventory.summary.historical_creatives})</Button>
                  <Button size="sm" variant={metaMode === "all" ? "default" : "outline"} onClick={() => setMetaMode("all")}>Todos no Meta ({inventory.summary.total_meta_creatives})</Button>
                </div>
                <div className="relative w-full lg:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={busca} onChange={(event) => setBusca(event.target.value)} className="pl-9" placeholder="Buscar campanha, conjunto ou anúncio" />
                </div>
              </div>
              {metaError && <p className="text-xs text-amber-600">A atualização falhou; mantendo o último inventário carregado. {metaError}</p>}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {metaVisiveis.slice(0, limite).map((creative) => <MetaCreativeCard key={creative.creative_id || creative.ads[0]?.ad_id} creative={creative} accountId={inventory.account_id} />)}
              </div>
              {metaVisiveis.length === 0 && <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">Nenhum criativo encontrado com esse filtro.</p>}
              {metaVisiveis.length > limite && <div className="flex justify-center"><Button variant="outline" onClick={() => setLimite((value) => value + 24)}>
                Mostrar mais {Math.min(24, metaVisiveis.length - limite)} de {metaVisiveis.length}
              </Button></div>}
            </> : null}
        </TabsContent>
        <TabsContent value="internal" className="space-y-4">
          {internosLoading ? <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div> : <>
            <Card><CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
              <div><p className="font-semibold">Fila interna de aprovação</p><p className="text-xs text-muted-foreground">Peças produzidas antes de entrarem nas campanhas</p></div>
              <div className="flex items-end gap-2"><span className="text-3xl font-bold tabular-nums leading-none text-green-500">{cont.aprovado}</span><span className="pb-0.5 text-muted-foreground">/ {itens.length} aprovados</span></div>
              <div className="flex flex-wrap gap-3 text-xs"><span className="text-muted-foreground">{cont.aguardando} aguardando</span>
                {cont.ajustar > 0 && <span className="text-amber-500">{cont.ajustar} para ajustar</span>}{cont.reprovado > 0 && <span className="text-destructive">{cont.reprovado} reprovados</span>}</div>
              <div className="ml-auto flex flex-wrap gap-1.5">{["conversao", "objecao", "live", "aguardando", "aprovado"].map((value) =>
                <button key={value} onClick={() => setFiltro(filtro === value ? null : value)} className={`border px-2 py-1 text-xs transition-colors ${filtro === value ? "border-primary bg-primary/10" : "text-muted-foreground hover:bg-muted/50"}`}>{TRILHA_LABEL[value] || value}</button>)}</div>
            </CardContent></Card>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{internosVisiveis.map((creative) =>
              <Card key={creative.id} className={creative.status === "aprovado" ? "border-green-500/60" : creative.status === "ajustar" ? "border-amber-500/60" : creative.status === "reprovado" ? "border-destructive/60" : ""}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{creative.peca}</span><span className="font-medium">{creative.angulo}</span><Badge variant="outline" className="ml-auto text-[10px]">{TRILHA_LABEL[creative.trilha] || creative.trilha}</Badge></div>
                  {creative.preview_url ? aberto === creative.id ? <video src={creative.preview_url} controls autoPlay playsInline className="aspect-[9/16] w-full bg-black" />
                    : <button onClick={() => setAberto(creative.id)} className="flex aspect-[9/16] w-full items-center justify-center bg-muted/40 hover:bg-muted/60"><Play className="h-10 w-10 text-muted-foreground" /></button>
                    : <div className="flex aspect-[9/16] w-full items-center justify-center bg-muted/30 text-xs text-muted-foreground">sem preview</div>}
                  <div className="space-y-1 text-xs text-muted-foreground">{creative.endcard && <div><b className="text-foreground">endcard:</b> {creative.endcard}</div>}<div>{creative.duracao_seg ? `${creative.duracao_seg}s` : ""}{creative.destino ? ` · ${creative.destino}` : ""}</div></div>
                  {editandoNota === creative.id ? <Input autoFocus defaultValue={creative.nota || ""} className="h-8 text-xs" placeholder="o que ajustar?" onBlur={(event) => salvarNota(creative, event.target.value)} onKeyDown={(event) => event.key === "Enter" && salvarNota(creative, (event.target as HTMLInputElement).value)} />
                    : <button onClick={() => setEditandoNota(creative.id)} className="text-left text-xs text-muted-foreground hover:text-foreground">{creative.nota ? `“${creative.nota}”` : "+ anotar ajuste"}</button>}
                  <div className="flex gap-1.5"><Button size="sm" disabled={salvando === creative.id} variant={creative.status === "aprovado" ? "default" : "outline"} className={`flex-1 ${creative.status === "aprovado" ? "bg-green-600 hover:bg-green-700" : ""}`} onClick={() => decidir(creative, "aprovado")}><Check className="mr-1 h-3.5 w-3.5" /> aprovar</Button>
                    <Button size="sm" variant={creative.status === "ajustar" ? "default" : "outline"} disabled={salvando === creative.id} className={creative.status === "ajustar" ? "bg-amber-600 hover:bg-amber-700" : ""} onClick={() => decidir(creative, "ajustar")}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant={creative.status === "reprovado" ? "destructive" : "outline"} disabled={salvando === creative.id} onClick={() => decidir(creative, "reprovado")}><X className="h-3.5 w-3.5" /></Button></div>
                </CardContent>
              </Card>)}</div>
            {internosVisiveis.length === 0 && <p className="text-sm text-muted-foreground">Nenhum criativo com esse filtro.</p>}
          </>}
        </TabsContent>
      </Tabs>
    </div></AppLayout>
  );
}
