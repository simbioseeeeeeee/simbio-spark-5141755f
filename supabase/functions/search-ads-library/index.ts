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
}

// ── Expand CNPJ into multiple search variants ──
function expandSearchTerms(terms: string[]): string[] {
  const expanded: string[] = [];
  for (const term of terms) {
    const digits = term.replace(/\D/g, '');
    // If it looks like a CNPJ (11-14 digits), try multiple formats
    if (digits.length >= 11 && digits.length <= 14) {
      expanded.push(term);          // original formatted
      expanded.push(digits);        // all digits
      expanded.push(digits.slice(0, 8)); // root (first 8 digits)
    } else {
      expanded.push(term);
    }
  }
  // Deduplicate
  return [...new Set(expanded)];
}

// ── Try Meta Ads Library API ──
async function tryMetaApi(searchTerms: string[], locationPart: string): Promise<AdResult[] | null> {
  const metaToken = Deno.env.get('META_ACCESS_TOKEN');
  if (!metaToken) return null;

  const allTerms = expandSearchTerms(searchTerms);
  console.log('Meta API search variants:', allTerms);

  const allAds: any[] = [];
  const seenIds = new Set<string>();

  for (const term of allTerms.slice(0, 6)) {
    const params = new URLSearchParams({
      search_terms: term,
      ad_reached_countries: '["BR"]',
      ad_active_status: 'ALL',
      fields: 'page_name,page_id,ad_creation_time,ad_delivery_start_time,ad_delivery_stop_time,ad_snapshot_url',
      limit: '500',
      access_token: metaToken,
    });
    try {
      const res = await fetch(`https://graph.facebook.com/v22.0/ads_archive?${params}`);
      const data = await res.json();
      if (!res.ok) { console.error('Meta API err:', data?.error?.message); return null; }
      for (const ad of (data?.data || [])) {
        const uid = ad.id ?? `${ad.page_id}-${ad.ad_creation_time}`;
        if (!seenIds.has(uid)) { seenIds.add(uid); allAds.push(ad); }
      }
      if (data?.paging?.next && allAds.length < 800) {
        try {
          const r2 = await fetch(data.paging.next);
          const d2 = await r2.json();
          if (r2.ok) for (const ad of (d2?.data || [])) {
            const uid = ad.id ?? `${ad.page_id}-${ad.ad_creation_time}`;
            if (!seenIds.has(uid)) { seenIds.add(uid); allAds.push(ad); }
          }
        } catch(_){}
      }
    } catch { return null; }
  }
  if (allAds.length === 0) return null;

  const byPage: Record<string, { advertiser: string; page_id: string; count: number; first: Date; maxMonths: number; urls: string[] }> = {};
  for (const ad of allAds) {
    const key = ad.page_id || ad.page_name;
    const start = new Date(ad.ad_delivery_start_time || ad.ad_creation_time || Date.now());
    if (!byPage[key]) byPage[key] = { advertiser: ad.page_name || '?', page_id: ad.page_id || '', count: 0, first: start, maxMonths: 0, urls: [] };
    const e = byPage[key];
    e.count++;
    if (start < e.first) e.first = start;
    const m = Math.max(1, Math.ceil((Date.now() - start.getTime()) / (30.44*864e5)));
    if (m > e.maxMonths) e.maxMonths = m;
    if (ad.ad_snapshot_url && e.urls.length < 2) e.urls.push(ad.ad_snapshot_url);
  }

  return Object.values(byPage).map(a => {
    const vpm = Math.max(1, Math.ceil(a.count / Math.max(1, a.maxMonths)));
    return {
      anunciante: a.advertiser,
      url_anuncio: a.urls[0] || `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=BR&view_all_page_id=${a.page_id}`,
      descricao: `${a.count} anúncio(s). Ativo desde ${a.first.toISOString().slice(0,10)}.`,
      plataforma: 'Meta Ads',
      tempo_anunciando: a.maxMonths >= 12 ? `${Math.floor(a.maxMonths/12)} ano(s) e ${a.maxMonths%12} meses` : `${a.maxMonths} mês(es)`,
      volume_estimado: `${a.count} total (~${vpm}/mês)`,
      total_ads: a.count,
      meses_ativo: a.maxMonths,
    };
  }).sort((a,b) => b.total_ads - a.total_ads);
}

// ── Fallback: Firecrawl + AI ──
async function firecrawlFallback(searchTerms: string[], locationPart: string): Promise<AdResult[]> {
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  if (!firecrawlKey || !lovableKey) throw new Error('API keys não configuradas');

  // Also scrape the Ads Library search page directly for the first keyword
  const adsLibraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&q=${encodeURIComponent(searchTerms[0])}`;

  const terms: string[] = [];
  for (const kw of searchTerms) {
    terms.push(`"${kw}" imobiliária anúncio facebook ads library ${locationPart}`.trim());
    terms.push(`"${kw}" construtora tráfego pago meta ads ${locationPart}`.trim());
  }
  if (locationPart) {
    terms.push(`empreendimento imobiliário "${locationPart}" anúncio facebook meta ads`);
  }

  // Run Firecrawl searches + direct Ads Library scrape in parallel
  const [searchResults, adsLibraryScrape] = await Promise.all([
    Promise.all(terms.slice(0, 5).map(async (term) => {
      try {
        const res = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: term, limit: 10, lang: 'pt-br', country: 'BR' }),
        });
        const d = await res.json();
        return d?.data || d?.results || [];
      } catch { return []; }
    })),
    // Direct scrape of Ads Library
    (async () => {
      try {
        const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: adsLibraryUrl, formats: ['markdown'], waitFor: 5000 }),
        });
        const d = await res.json();
        return d?.data?.markdown || d?.markdown || '';
      } catch { return ''; }
    })(),
  ]);

  const allResults: any[] = [];
  searchResults.forEach(r => allResults.push(...r));
  console.log('Firecrawl raw:', allResults.length, 'Ads Library scrape len:', adsLibraryScrape.length);

  if (allResults.length === 0 && !adsLibraryScrape) return [];

  const summary = allResults
    .map((r: any, i: number) => `[${i+1}] ${r.url || ''} | ${r.title || ''} | ${(r.markdown || '').slice(0, 400)}`)
    .join('\n---\n');

  const adsLibrarySection = adsLibraryScrape
    ? `\n\n=== DADOS DIRETOS DA META ADS LIBRARY ===\n${adsLibraryScrape.slice(0, 3000)}\n=== FIM ===`
    : '';

  const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${lovableKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `Você é um extrator de dados especializado em anunciantes da Meta Ads Library.
Analise os resultados e extraia ANUNCIANTES REAIS (imobiliárias, construtoras, corretores) que anunciam sobre: ${searchTerms.join(', ')}.

REGRAS:
- NÃO invente nomes. Só liste empresas mencionadas nos textos.
- Para total_ads: conte quantos anúncios são mencionados para aquele anunciante. Se não souber, coloque 0.
- Para meses_ativo: calcule quantos meses desde a data mais antiga mencionada até hoje (${new Date().toISOString().slice(0,10)}). Se não souber, coloque 0.
- Se a seção "DADOS DIRETOS DA META ADS LIBRARY" estiver presente, USE-A como fonte primária — ela contém dados reais de anunciantes ativos.`,
        },
        { role: 'user', content: `Extraia anunciantes:\n\n${summary}${adsLibrarySection}` },
      ],
      tools: [{
        type: 'function' as const,
        function: {
          name: 'report_advertisers',
          description: 'Lista anunciantes encontrados com métricas.',
          parameters: {
            type: 'object',
            properties: {
              anunciantes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    nome: { type: 'string', description: 'Nome da empresa' },
                    url_anuncio: { type: ['string', 'null'], description: 'URL do anúncio ou página' },
                    descricao: { type: 'string', description: 'Descrição breve' },
                    total_ads: { type: 'number', description: 'Número de anúncios encontrados (0 se desconhecido)' },
                    meses_ativo: { type: 'number', description: 'Meses anunciando (0 se desconhecido)' },
                  },
                  required: ['nome', 'descricao', 'total_ads', 'meses_ativo'],
                },
              },
            },
            required: ['anunciantes'],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'report_advertisers' } },
    }),
  });

  if (!aiRes.ok) { console.error('AI err:', aiRes.status); return []; }

  const aiData = await aiRes.json();
  const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc) return [];

  const parsed = JSON.parse(tc.function.arguments);

  return (parsed.anunciantes || []).map((a: any) => {
    const totalAds = a.total_ads || 0;
    const mesesAtivo = a.meses_ativo || 0;
    const vpm = mesesAtivo > 0 ? Math.max(1, Math.ceil(totalAds / mesesAtivo)) : 0;

    return {
      anunciante: a.nome || '',
      url_anuncio: a.url_anuncio || `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=BR&q=${encodeURIComponent(a.nome || '')}`,
      descricao: a.descricao || '',
      plataforma: 'Meta Ads',
      tempo_anunciando: mesesAtivo > 0
        ? (mesesAtivo >= 12 ? `${Math.floor(mesesAtivo/12)} ano(s) e ${mesesAtivo%12} meses` : `${mesesAtivo} mês(es)`)
        : 'desconhecido',
      volume_estimado: totalAds > 0 ? `${totalAds} total (~${vpm}/mês)` : 'desconhecido',
      total_ads: totalAds,
      meses_ativo: mesesAtivo,
    };
  }).sort((a: AdResult, b: AdResult) => b.total_ads - a.total_ads);
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

    let results = await tryMetaApi(searchTerms, locationPart);
    if (!results || results.length === 0) {
      console.log('Meta API unavailable, using Firecrawl fallback');
      results = await firecrawlFallback(searchTerms, locationPart);
    }

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
