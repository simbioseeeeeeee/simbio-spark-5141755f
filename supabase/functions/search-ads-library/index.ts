const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface SearchRequest {
  keywords?: string[];
  cidade?: string;
  uf?: string;
}

interface AdResult {
  anunciante: string;
  url_anuncio: string;
  descricao: string;
  plataforma: string;
  tempo_anunciando: string;
  volume_estimado: string;
  total_ads: number;
  meses_ativo: number;
  confidence: number;
}

// ── Scrape the Meta Ads Library directly for a keyword ──
async function scrapeAdsLibrary(firecrawlKey: string, keyword: string): Promise<string> {
  const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&q=${encodeURIComponent(keyword)}&media_type=all`;
  console.log('Scraping Ads Library:', url);
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        waitFor: 5000, // wait for JS to render
        timeout: 30000,
      }),
    });
    const data = await res.json();
    const md = data?.data?.markdown || data?.markdown || '';
    console.log('Ads Library scrape result length:', md.length);
    return md;
  } catch (e) {
    console.error('Ads Library scrape error:', e);
    return '';
  }
}

// ── Search via Firecrawl for supplementary data ──
async function searchFirecrawl(firecrawlKey: string, query: string, limit = 10): Promise<any[]> {
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit, lang: 'pt-br', country: 'BR' }),
    });
    const d = await res.json();
    return d?.data || d?.results || [];
  } catch (e) {
    console.error('Search error:', e);
    return [];
  }
}

async function searchAds(searchTerms: string[], locationPart: string): Promise<AdResult[]> {
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  if (!firecrawlKey || !lovableKey) throw new Error('API keys não configuradas');

  const today = new Date().toISOString().slice(0, 10);

  // Strategy: scrape Ads Library directly + supplementary searches
  const scrapePromises = searchTerms.slice(0, 2).map(kw => scrapeAdsLibrary(firecrawlKey, kw));
  
  const searchQueries = searchTerms.flatMap(kw => [
    `site:facebook.com/ads/library "${kw}" "começou a ser veiculado"`,
    `"${kw}" "pago por" construtora incorporadora imobiliária ${locationPart}`.trim(),
  ]);
  
  const searchPromises = searchQueries.slice(0, 4).map(q => searchFirecrawl(firecrawlKey, q));

  const [scrapeResults, searchResultsArrays] = await Promise.all([
    Promise.all(scrapePromises),
    Promise.all(searchPromises),
  ]);

  // Build combined context
  const scrapedContent = scrapeResults
    .filter(s => s.length > 100)
    .map((s, i) => `=== CONTEÚDO DIRETO DA META ADS LIBRARY (busca: "${searchTerms[i]}") ===\n${s.slice(0, 4000)}`)
    .join('\n\n');

  const allSearchResults: any[] = [];
  searchResultsArrays.forEach(r => allSearchResults.push(...r));
  
  // Deduplicate by URL
  const seenUrls = new Set<string>();
  const uniqueSearch = allSearchResults.filter((r: any) => {
    const url = r.url || '';
    if (seenUrls.has(url)) return false;
    seenUrls.add(url);
    return true;
  });

  const searchContext = uniqueSearch
    .map((r: any, i: number) => `[${i + 1}] URL: ${r.url || ''}\nTitle: ${r.title || ''}\nContent: ${(r.markdown || r.description || r.snippet || '').slice(0, 800)}`)
    .join('\n\n---\n\n');

  const fullContext = [scrapedContent, searchContext].filter(Boolean).join('\n\n========\n\n');
  
  console.log('Context: scrape chars:', scrapedContent.length, 'search results:', uniqueSearch.length, 'total chars:', fullContext.length);

  if (fullContext.length < 50) return [];

  const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${lovableKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `Você é um analista de inteligência competitiva. Extraia anunciantes da Meta Ads Library.

DATA DE HOJE: ${today}
TERMOS BUSCADOS: ${searchTerms.join(', ')}

FONTES DE DADOS:
1. CONTEÚDO DIRETO DA ADS LIBRARY: dados renderizados da página da biblioteca de anúncios do Facebook. Contém nomes de anunciantes, "Pago por", datas "Começou a ser veiculado em", textos dos anúncios, e número de anúncios visíveis.
2. RESULTADOS DE BUSCA: páginas web que mencionam anunciantes e suas atividades.

EXTRAÇÃO DE MÉTRICAS (CRÍTICO):
- **total_ads**: Conte cada bloco/card de anúncio visível na página da Ads Library. Se vir "Resultados aproximados: X", use X. Se há vários criativos listados, conte-os. Se não há dados suficientes mas o anunciante aparece na Ads Library, estime mínimo 1. Use null SOMENTE se não é possível inferir.
- **meses_ativo**: Encontre a data mais antiga em "Começou a ser veiculado em DD de MÊS de AAAA" ou "Started running on". Calcule meses até ${today}. Se a empresa aparece como anunciante ativo sem data, estime mínimo 1. Use null SOMENTE se não há pista.
- **confidence**: 0.0-1.0. Dados diretos da Ads Library com datas = 0.9. Menção como anunciante sem dados = 0.4.

REGRAS:
- Extraia TODOS os anunciantes distintos encontrados (empresas, construtoras, incorporadoras, corretores).
- Use nomes EXPLÍCITOS. "Pago por X" → anunciante = X.
- NÃO invente empresas.
- Ignore portais genéricos (Zap Imóveis, VivaReal, etc).
- NUNCA retorne total_ads=0 para um anunciante que aparece NA Ads Library.`,
        },
        { role: 'user', content: fullContext },
      ],
      tools: [{
        type: 'function' as const,
        function: {
          name: 'report_advertisers',
          description: 'Report all advertisers extracted from Meta Ads Library data.',
          parameters: {
            type: 'object',
            properties: {
              anunciantes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    nome: { type: 'string', description: 'Nome do anunciante/empresa' },
                    url_anuncio: { type: 'string', description: 'URL do anúncio ou página na Ads Library' },
                    descricao: { type: 'string', description: 'O que a empresa anuncia' },
                    total_ads: { type: ['number', 'null'], description: 'Número de anúncios encontrados. Mínimo 1 se aparece na Ads Library.' },
                    meses_ativo: { type: ['number', 'null'], description: 'Meses desde o anúncio mais antigo até hoje.' },
                    data_inicio: { type: ['string', 'null'], description: 'Data mais antiga encontrada (formato YYYY-MM-DD)' },
                    confidence: { type: 'number', description: 'Confiança 0.0-1.0' },
                  },
                  required: ['nome', 'descricao', 'total_ads', 'meses_ativo', 'confidence'],
                },
              },
            },
            required: ['anunciantes'],
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'report_advertisers' } },
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error('AI error:', aiRes.status, errText.slice(0, 300));
    return [];
  }

  const aiData = await aiRes.json();
  const msg = aiData.choices?.[0]?.message;
  console.log('AI finish_reason:', aiData.choices?.[0]?.finish_reason, 'tool_calls:', msg?.tool_calls?.length || 0);

  const tc = msg?.tool_calls?.[0];
  if (!tc) {
    console.log('No tool call. Content:', (msg?.content || '').slice(0, 300));
    return [];
  }

  let parsed: any;
  try {
    parsed = JSON.parse(tc.function.arguments);
  } catch (e) {
    console.error('JSON parse failed:', (tc.function.arguments || '').slice(0, 300));
    return [];
  }

  const anunciantes = parsed.anunciantes || [];
  console.log('Extracted advertisers:', anunciantes.length);

  return anunciantes.map((a: any) => {
    const totalAds = a.total_ads ?? null;
    const mesesAtivo = a.meses_ativo ?? null;
    const confidence = a.confidence ?? 0;
    const vpm = (totalAds && mesesAtivo && mesesAtivo > 0) ? Math.max(1, Math.ceil(totalAds / mesesAtivo)) : null;

    return {
      anunciante: a.nome || '',
      url_anuncio: a.url_anuncio || `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=BR&q=${encodeURIComponent(a.nome || '')}`,
      descricao: a.descricao || '',
      plataforma: 'Meta Ads',
      tempo_anunciando: mesesAtivo != null
        ? (mesesAtivo >= 12 ? `${Math.floor(mesesAtivo / 12)} ano(s) e ${mesesAtivo % 12} meses` : `${mesesAtivo} mês(es)`)
        : 'desconhecido',
      volume_estimado: totalAds != null
        ? `${totalAds} total${vpm ? ` (~${vpm}/mês)` : ''}`
        : 'desconhecido',
      total_ads: totalAds ?? 0,
      meses_ativo: mesesAtivo ?? 0,
      confidence,
    };
  })
  .filter((a: AdResult) => a.confidence >= 0.2)
  .sort((a: AdResult, b: AdResult) => b.total_ads - a.total_ads || b.confidence - a.confidence);
}

// ── Main ──
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords, cidade, uf } = await req.json() as SearchRequest;
    const searchTerms = keywords?.length ? keywords : ['minha casa minha vida'];
    const locationPart = [cidade, uf].filter(Boolean).join(' ');

    console.log('Search ads:', searchTerms, 'location:', locationPart);

    const results = await searchAds(searchTerms, locationPart);

    console.log('Final:', results.length, 'advertisers');

    return new Response(
      JSON.stringify({ success: true, data: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
