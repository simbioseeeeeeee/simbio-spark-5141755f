import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lead } from "@/types/lead";
import { LeadProfile } from "@/components/LeadProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Megaphone, ExternalLink, CheckCircle2, XCircle, ArrowRight, UserPlus, Clock, BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface AdResult {
  anunciante: string;
  url_anuncio: string;
  descricao: string;
  plataforma: string;
  tempo_anunciando?: string;
  volume_estimado?: string;
  total_ads?: number;
  meses_ativo?: number;
  matchedLead?: Lead | null;
  searching?: boolean;
  creating?: boolean;
}

function rowToLead(row: any): Lead {
  return {
    id: row.id,
    cnpj: row.cnpj || "",
    razao_social: row.razao_social || "",
    fantasia: row.fantasia || "",
    data_abertura: row.data_abertura || "",
    situacao: row.situacao || "",
    cnae_descricao: row.cnae_descricao || "",
    logradouro: row.logradouro || "",
    numero: row.numero || "",
    complemento: row.complemento || "",
    bairro: row.bairro || "",
    cidade: row.cidade || "",
    uf: row.uf || "",
    cep: row.cep || "",
    telefone1: row.telefone1 || "",
    telefone2: row.telefone2 || "",
    celular1: row.celular1 || "",
    celular2: row.celular2 || "",
    email1: row.email1 || "",
    email2: row.email2 || "",
    socios: Array.isArray(row.socios) ? row.socios : [],
    status_sdr: row.status_sdr || "A Contatar",
    possui_site: row.possui_site || false,
    url_site: row.url_site || "",
    instagram_ativo: row.instagram_ativo || false,
    url_instagram: row.url_instagram || "",
    faz_anuncios: row.faz_anuncios || false,
    whatsapp_automacao: row.whatsapp_automacao || false,
    whatsapp_humano: row.whatsapp_humano || false,
    observacoes_sdr: row.observacoes_sdr || "",
    estagio_funil: row.estagio_funil || null,
    valor_negocio_estimado: row.valor_negocio_estimado || null,
    data_proximo_passo: row.data_proximo_passo || null,
    observacoes_closer: row.observacoes_closer || "",
    pesquisa_realizada: row.pesquisa_realizada || false,
    lead_score: row.lead_score ?? null,
    dia_cadencia: row.dia_cadencia ?? 0,
    status_cadencia: row.status_cadencia || "ativo",
    created_at: row.created_at,
    owner_id: row.owner_id || null,
    sdr_id: row.sdr_id || null,
  };
}

export function AdsExplorer() {
  const [query, setQuery] = useState("minha casa minha vida");
  const [cidade, setCidade] = useState("");
  const [results, setResults] = useState<AdResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [filterHighPerformance, setFilterHighPerformance] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const filteredResults = filterHighPerformance
    ? results.filter((ad) => (ad.meses_ativo ?? 0) >= 3 || (ad.total_ads ?? 0) >= 20)
    : results;

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / pageSize));
  const pagedResults = useMemo(
    () => filteredResults.slice(page * pageSize, (page + 1) * pageSize),
    [filteredResults, page],
  );

  const searchAds = useCallback(async () => {
    setLoading(true);
    setResults([]);
    setPage(0);
    try {
      // Support both "MCMV" and full name as keywords
      const keywords = ["minha casa minha vida", "MCMV"];
      if (query.trim() && !keywords.some(k => k.toLowerCase() === query.trim().toLowerCase())) {
        keywords.unshift(query.trim());
      }

      const { data, error } = await supabase.functions.invoke("search-ads-library", {
        body: { keywords, cidade: cidade.trim() || undefined },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro na busca");

      const ads: AdResult[] = (data.data || []).map((a: any) => ({
        ...a,
        matchedLead: undefined,
        searching: false,
        creating: false,
      }));

      setResults(ads);

      if (ads.length === 0) {
        toast({ title: "Nenhum anunciante encontrado", description: "Tente ajustar os termos de busca." });
        return;
      }

      toast({ title: `${ads.length} anunciante(s) encontrado(s)`, description: "Buscando correspondência na base de leads..." });

      // Match each advertiser against the leads DB
      for (let i = 0; i < ads.length; i++) {
        const ad = ads[i];
        setResults((prev) => prev.map((r, idx) => idx === i ? { ...r, searching: true } : r));

        try {
          const nameParts = ad.anunciante.split(/\s+/).filter((p) => p.length > 2).slice(0, 3);
          const searchTerm = nameParts.join(" ");

          const { data: leads } = await supabase
            .from("leads")
            .select("*")
            .or(`razao_social.ilike.%${searchTerm}%,fantasia.ilike.%${searchTerm}%`)
            .limit(1);

          const match = leads && leads.length > 0 ? rowToLead(leads[0]) : null;

          // Auto-mark faz_anuncios=true if match found
          if (match && !match.faz_anuncios) {
            await supabase
              .from("leads")
              .update({ faz_anuncios: true })
              .eq("id", match.id);
            match.faz_anuncios = true;
          }

          setResults((prev) => prev.map((r, idx) => idx === i ? { ...r, matchedLead: match, searching: false } : r));
        } catch {
          setResults((prev) => prev.map((r, idx) => idx === i ? { ...r, matchedLead: null, searching: false } : r));
        }
      }
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro na busca", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [query, cidade]);

  const createLeadFromAd = useCallback(async (ad: AdResult, index: number) => {
    setResults((prev) => prev.map((r, idx) => idx === index ? { ...r, creating: true } : r));

    try {
      const { data, error } = await supabase
        .from("leads")
        .insert({
          razao_social: ad.anunciante,
          fantasia: ad.anunciante,
          faz_anuncios: true,
          status_sdr: "A Contatar",
          observacoes_sdr: `Encontrado via busca de anúncios. ${ad.descricao}. Tempo anunciando: ${ad.tempo_anunciando || "desconhecido"}. Volume: ${ad.volume_estimado || "desconhecido"}.`,
        })
        .select()
        .single();

      if (error) throw error;

      const newLead = rowToLead(data);
      setResults((prev) => prev.map((r, idx) => idx === index ? { ...r, matchedLead: newLead, creating: false } : r));
      toast({ title: "Lead criado!", description: `${ad.anunciante} adicionado à base.` });
    } catch (err: any) {
      console.error(err);
      setResults((prev) => prev.map((r, idx) => idx === index ? { ...r, creating: false } : r));
      toast({ title: "Erro ao criar lead", description: err.message, variant: "destructive" });
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Search Form */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Megaphone className="h-4 w-4 text-primary" />
          Buscar Anunciantes na Biblioteca de Anúncios
        </div>
        <p className="text-xs text-muted-foreground">
          Pesquisa por empresas anunciando sobre MCMV / Minha Casa Minha Vida. Busca automática por anúncios com alto volume e longa duração.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Palavra-chave adicional (opcional)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Cidade / Região (opcional)"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            className="w-full sm:w-[200px]"
          />
          <Button onClick={searchAds} disabled={loading} className="gap-2 shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Pesquisar
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Badge variant="outline" className="text-xs">MCMV</Badge>
          <Badge variant="outline" className="text-xs">minha casa minha vida</Badge>
          {cidade && <Badge variant="outline" className="text-xs">{cidade}</Badge>}
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
            <span className="text-xs text-muted-foreground">
              {filterHighPerformance
                ? `${filteredResults.length} de ${results.length} anunciante(s) com alta performance`
                : `${results.length} anunciante(s)`}
            </span>
            <Button
              size="sm"
              variant={filterHighPerformance ? "default" : "outline"}
              className="gap-1.5 text-xs h-7"
              onClick={() => setFilterHighPerformance((v) => !v)}
            >
              <BarChart3 className="h-3 w-3" />
              3+ meses / 20+ anúncios
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Anunciante</TableHead>
                  <TableHead className="w-[200px]">Descrição</TableHead>
                  <TableHead className="w-[120px]">
                    <div className="flex items-center gap-1"><Clock className="h-3 w-3" /> Tempo</div>
                  </TableHead>
                  <TableHead className="w-[100px]">
                    <div className="flex items-center gap-1"><BarChart3 className="h-3 w-3" /> Volume</div>
                  </TableHead>
                  <TableHead className="w-[200px]">Match na Base</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
              {filteredResults.map((ad) => {
                const i = results.indexOf(ad);
                return (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{ad.anunciante}</span>
                        {ad.url_anuncio && (
                          <a href={ad.url_anuncio} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{ad.descricao}</TableCell>
                    <TableCell>
                      <Badge variant={ad.tempo_anunciando?.includes("3") || ad.tempo_anunciando?.includes("mais") ? "default" : "secondary"} className="text-xs">
                        {ad.tempo_anunciando || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ad.volume_estimado?.includes("20") || ad.volume_estimado?.includes("+") ? "default" : "secondary"} className="text-xs">
                        {ad.volume_estimado || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {ad.searching ? (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> Buscando...
                        </span>
                      ) : ad.matchedLead ? (
                        <button
                          onClick={() => setSelectedLead(ad.matchedLead!)}
                          className="flex items-center gap-1.5 text-xs text-success hover:underline"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {ad.matchedLead.fantasia || ad.matchedLead.razao_social}
                        </button>
                      ) : ad.matchedLead === null ? (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <XCircle className="h-3.5 w-3.5" /> Não encontrado
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {ad.matchedLead ? (
                        <Button size="sm" variant="ghost" onClick={() => setSelectedLead(ad.matchedLead!)}>
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      ) : ad.matchedLead === null ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-xs"
                          disabled={ad.creating}
                          onClick={() => createLeadFromAd(ad, i)}
                        >
                          {ad.creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                          Criar Lead
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <LeadProfile
        lead={selectedLead}
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        onSaved={(u) => setSelectedLead(u)}
      />
    </div>
  );
}
