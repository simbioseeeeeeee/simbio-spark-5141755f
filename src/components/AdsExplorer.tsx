import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lead } from "@/types/lead";
import { LeadProfile } from "@/components/LeadProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Megaphone, ExternalLink, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface AdResult {
  anunciante: string;
  url_anuncio: string;
  descricao: string;
  plataforma: string;
  matchedLead?: Lead | null;
  searching?: boolean;
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

  const searchAds = useCallback(async () => {
    setLoading(true);
    setResults([]);
    try {
      const { data, error } = await supabase.functions.invoke("search-ads-library", {
        body: { query: query.trim(), cidade: cidade.trim() || undefined },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro na busca");

      const ads: AdResult[] = (data.data || []).map((a: any) => ({
        ...a,
        matchedLead: undefined,
        searching: false,
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
          // Search by name parts
          const nameParts = ad.anunciante.split(/\s+/).filter((p) => p.length > 2).slice(0, 3);
          const searchTerm = nameParts.join(" ");

          const { data: leads } = await supabase
            .from("leads")
            .select("*")
            .or(`razao_social.ilike.%${searchTerm}%,fantasia.ilike.%${searchTerm}%`)
            .limit(1);

          const match = leads && leads.length > 0 ? rowToLead(leads[0]) : null;
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

  return (
    <div className="space-y-4">
      {/* Search Form */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Megaphone className="h-4 w-4 text-primary" />
          Buscar Anunciantes na Biblioteca de Anúncios
        </div>
        <p className="text-xs text-muted-foreground">
          Pesquisa na Meta Ads Library por empresas anunciando sobre o tema escolhido e cruza com sua base de leads.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Tema do anúncio (ex: minha casa minha vida)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Cidade (opcional)"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            className="w-full sm:w-[200px]"
          />
          <Button onClick={searchAds} disabled={loading || !query.trim()} className="gap-2 shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Pesquisar
          </Button>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Anunciante</TableHead>
                  <TableHead className="w-[250px]">Descrição</TableHead>
                  <TableHead className="w-[100px]">Plataforma</TableHead>
                  <TableHead className="w-[200px]">Match na Base</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((ad, i) => (
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
                    <TableCell className="text-xs text-muted-foreground">{ad.descricao}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{ad.plataforma}</Badge>
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
                      {ad.matchedLead && (
                        <Button size="sm" variant="ghost" onClick={() => setSelectedLead(ad.matchedLead!)}>
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
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
