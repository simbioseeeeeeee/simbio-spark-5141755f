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

async function searchAds(searchTerms: string[], locationPart: string): Promise<AdResult[]> {
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  if (!firecrawlKey || !lovableKey) throw new Error('API keys não configuradas');

  // Build search queries focused on Meta Ads Library pages with actual ad data
  const terms: string[] = [];
  for (const kw of searchTerms) {
    // Direct Ads Library results — these contain ad counts and dates
    terms.push(`site:facebook.com/ads/library "anúncios" "${kw}" ${locationPart}`.trim());
    terms.push(`site:facebook.com/ads/library "${kw}" "começou a ser veiculado" ${locationPart}`.trim());
    // "Pago por" pages with ad evidence
    terms.push(`"pago por" "${kw}" "anúncios" construtora incorporadora imobiliária ${locationPart}`.trim());
    // Broader search for advertisers in the segment
    terms.push(`"${kw}" "biblioteca de anúncios" construtora incorporadora lançamento ${locationPart}`.trim());
  }

  // Run searches in parallel (max 6 for better coverage)
  console.log('Starting Firecrawl searches:', terms.length, 'terms');
  const searchResults = await Promise.all(
    terms.slice(0, 6).map(async (term) => {
      try {
        const res = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: term, limit: 10, lang: 'pt-br', country: 'BR' }),
        });
        const d = await res.json();
        return d?.data || d?.results || [];
      } catch (e) {
        console.error('Search error:', e);
        return [];
      }
    })
  );

  const allResults: any[] = [];
  searchResults.forEach(r => allResults.push(...r));
  console.log('Firecrawl total results:', allResults.length);

  if (allResults.length === 0) return [];

  // Build context for AI - include more content per result
  const summary = allResults
    .map((r: any, i: number) => `[${i + 1}] URL: ${r.url || ''}\nTitle: ${r.title || ''}\nContent: ${(r.markdown || r.description || r.snippet || '').slice(0, 800)}`)
    .join('\n\n===\n\n');

  console.log('Sending to AI, context length:', summary.length);

  const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${lovableKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `Você extrai nomes de empresas anunciantes a partir de resultados de busca sobre anúncios no Facebook/Instagram.

TAREFA: Analise os textos e extraia TODAS as empresas que aparecem como anunciantes (quem paga pelos anúncios).
Foco: imobiliárias, construtoras, incorporadoras, corretores, assessorias imobiliárias que anunciam sobre: ${searchTerms.join(', ')}.

REGRAS:
- Extraia o MÁXIMO de empresas distintas possível.
- Só extraia nomes que estejam EXPLICITAMENTE nos textos.
- NÃO invente nomes.
- Se vir "Pago por" ou "page_name" ou nome de página do Facebook, use como nome do anunciante.
- total_ads: quantos anúncios distintos são mencionados para essa empresa (0 se não souber).
- meses_ativo: meses desde a data mais antiga mencionada até ${new Date().toISOString().slice(0, 10)} (0 se não souber).
- Inclua a URL do anúncio ou da página se disponível.`,
        },
        { role: 'user', content: summary },
      ],
      tools: [{
        type: 'function' as const,
        function: {
          name: 'report_advertisers',
          description: 'Report all advertisers found in the search results.',
          parameters: {
            type: 'object',
            properties: {
              anunciantes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    nome: { type: 'string' },
                    url_anuncio: { type: 'string' },
                    descricao: { type: 'string' },
                    total_ads: { type: 'number' },
                    meses_ativo: { type: 'number' },
                  },
                  required: ['nome', 'descricao', 'total_ads', 'meses_ativo'],
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
    const totalAds = a.total_ads || 0;
    const mesesAtivo = a.meses_ativo || 0;
    const vpm = mesesAtivo > 0 ? Math.max(1, Math.ceil(totalAds / mesesAtivo)) : 0;

    return {
      anunciante: a.nome || '',
      url_anuncio: a.url_anuncio || `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=BR&q=${encodeURIComponent(a.nome || '')}`,
      descricao: a.descricao || '',
      plataforma: 'Meta Ads',
      tempo_anunciando: mesesAtivo > 0
        ? (mesesAtivo >= 12 ? `${Math.floor(mesesAtivo / 12)} ano(s) e ${mesesAtivo % 12} meses` : `${mesesAtivo} mês(es)`)
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
