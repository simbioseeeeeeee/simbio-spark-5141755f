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

  // Deduplicate by URL
  const seenUrls = new Set<string>();
  const uniqueResults = allResults.filter((r: any) => {
    const url = r.url || '';
    if (seenUrls.has(url)) return false;
    seenUrls.add(url);
    return true;
  });

  // Build context for AI - include more content per result
  const today = new Date().toISOString().slice(0, 10);
  const summary = uniqueResults
    .map((r: any, i: number) => `[${i + 1}] URL: ${r.url || ''}\nTitle: ${r.title || ''}\nContent: ${(r.markdown || r.description || r.snippet || '').slice(0, 1000)}`)
    .join('\n\n===\n\n');

  console.log('Sending to AI, unique results:', uniqueResults.length, 'context length:', summary.length);

  const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${lovableKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `Você é um analista de inteligência competitiva especializado em extrair dados de anunciantes da Meta Ads Library.

DATA DE HOJE: ${today}

TAREFA: Analise TODOS os resultados de busca e extraia empresas que anunciam sobre: ${searchTerms.join(', ')}.
Foco: imobiliárias, construtoras, incorporadoras, corretores que fazem anúncios pagos no Facebook/Instagram.

REGRAS DE EXTRAÇÃO DE MÉTRICAS (CRÍTICO — NÃO RETORNE 0 SE HOUVER EVIDÊNCIA):
1. **total_ads**: Procure por padrões como "X anúncios", "X ads", contagem de criativos distintos, ou blocos repetidos de anúncio. Se a página da Ads Library mostra múltiplos anúncios, CONTE-OS. Se menciona "vários anúncios" ou há evidência de atividade contínua, estime um mínimo razoável (ex: 5). Use null SOMENTE quando não há absolutamente nenhuma evidência.
2. **meses_ativo**: Procure por datas como "Começou a ser veiculado em DD/MM/AAAA", "Ativo desde", "started running on". Calcule meses inteiros entre a data mais antiga e ${today}. Se há evidência de anúncios ativos sem data específica, estime com base no contexto (ex: se parece estabelecido, mínimo 3). Use null SOMENTE quando não há nenhuma pista temporal.
3. **confidence**: 0.0 a 1.0 — quão certo você está da extração. Dados da Ads Library direta = 0.8+. Menções indiretas = 0.3-0.6.

REGRAS GERAIS:
- Extraia o MÁXIMO de anunciantes distintos.
- Só use nomes EXPLÍCITOS nos textos. NÃO invente.
- "Pago por", "page_name", nome de página Facebook = nome do anunciante.
- Inclua a URL do anúncio/página quando disponível.
- NUNCA retorne total_ads=0 E meses_ativo=0 se houver qualquer evidência de atividade publicitária — use estimativas conservadoras.`,
        },
        { role: 'user', content: summary },
      ],
      tools: [{
        type: 'function' as const,
        function: {
          name: 'report_advertisers',
          description: 'Report all advertisers found with their metrics extracted from search results.',
          parameters: {
            type: 'object',
            properties: {
              anunciantes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    nome: { type: 'string', description: 'Nome da empresa/anunciante' },
                    url_anuncio: { type: 'string', description: 'URL do anúncio ou da página na Ads Library' },
                    descricao: { type: 'string', description: 'Breve descrição do que a empresa anuncia' },
                    total_ads: { type: ['number', 'null'], description: 'Número estimado de anúncios. null se desconhecido. NUNCA 0 se houver evidência.' },
                    meses_ativo: { type: ['number', 'null'], description: 'Meses anunciando. null se desconhecido. NUNCA 0 se houver evidência.' },
                    confidence: { type: 'number', description: 'Confiança da extração 0.0-1.0' },
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
  .filter((a: any) => a.confidence >= 0.2) // filter low-confidence noise
  .sort((a: any, b: any) => b.total_ads - a.total_ads || b.confidence - a.confidence);
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
