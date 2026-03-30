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

// ── Firecrawl + AI search ──
async function searchAds(searchTerms: string[], locationPart: string): Promise<AdResult[]> {
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  if (!firecrawlKey || !lovableKey) throw new Error('API keys não configuradas');

  const adsLibraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&q=${encodeURIComponent(searchTerms[0])}`;

  const terms: string[] = [];
  for (const kw of searchTerms) {
    terms.push(`"${kw}" imobiliária anúncio facebook ads library ${locationPart}`.trim());
    terms.push(`"${kw}" construtora tráfego pago meta ads ${locationPart}`.trim());
  }
  if (locationPart) {
    terms.push(`empreendimento imobiliário "${locationPart}" anúncio facebook meta ads`);
  }

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
    .map((r: any, i: number) => `[${i+1}] ${r.url || ''} | ${r.title || ''} | ${(r.markdown || r.description || r.snippet || '').slice(0, 600)}`)
    .join('\n---\n');

  const adsLibrarySection = adsLibraryScrape
    ? `\n\n=== DADOS DIRETOS DA META ADS LIBRARY ===\n${adsLibraryScrape.slice(0, 15000)}\n=== FIM ===`
    : '';

  console.log('AI input length:', summary.length + adsLibrarySection.length);

  const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${lovableKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `Você é um extrator de dados especializado em encontrar empresas que fazem anúncios pagos no Facebook/Instagram (Meta Ads).

Analise TODOS os textos fornecidos e extraia o MÁXIMO de empresas/anunciantes que você encontrar relacionados a: ${searchTerms.join(', ')}.

INSTRUÇÕES:
1. Extraia QUALQUER empresa mencionada nos textos que esteja anunciando ou sendo referenciada como anunciante.
2. Inclua: imobiliárias, construtoras, corretores, incorporadoras, empresas de financiamento, assessorias, qualquer empresa do setor imobiliário.
3. Também inclua empresas que aparecem como "page_name" ou "anunciante" nos dados da Ads Library.
4. NÃO invente nomes — só extraia o que está explicitamente nos textos.
5. Se um nome de empresa aparecer múltiplas vezes, conte cada menção como um anúncio para total_ads.
6. Para meses_ativo: se houver datas, calcule a diferença até hoje (${new Date().toISOString().slice(0,10)}). Senão, coloque 0.
7. Tente extrair o MÁXIMO possível de anunciantes — quanto mais, melhor.
8. Na seção "DADOS DIRETOS DA META ADS LIBRARY", cada bloco separado geralmente representa um anunciante diferente. Extraia TODOS.`,
        },
        { role: 'user', content: `Extraia TODOS os anunciantes encontrados:\n\n${summary}${adsLibrarySection}` },
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
