const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface SearchRequest {
  query?: string;
  cidade?: string;
  uf?: string;
}

interface AdResult {
  anunciante: string;
  url_anuncio: string;
  descricao: string;
  plataforma: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, cidade, uf } = await req.json() as SearchRequest;

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');

    if (!firecrawlKey || !lovableKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'API keys não configuradas' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const searchQuery = query || 'minha casa minha vida';
    const locationPart = [cidade, uf].filter(Boolean).join(' ');
    
    // Search Meta Ads Library via Firecrawl
    const searchTerms = [
      `site:facebook.com/ads/library "informações sobre o anúncio" "${searchQuery}" ${locationPart} imobiliária`,
      `site:facebook.com/ads/library "${searchQuery}" ${locationPart} corretor imóveis`,
    ];

    console.log('Searching Ads Library for:', searchQuery, locationPart);

    const allResults: any[] = [];
    
    const searches = await Promise.all(
      searchTerms.map(async (term) => {
        try {
          const res = await fetch('https://api.firecrawl.dev/v1/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: term, limit: 10, lang: 'pt-br', country: 'BR' }),
          });
          const data = await res.json();
          return data?.data || [];
        } catch (e) {
          console.error('Firecrawl search error:', e);
          return [];
        }
      })
    );

    searches.forEach((results) => allResults.push(...results));
    console.log('Total ads results:', allResults.length);

    if (allResults.length === 0) {
      return new Response(
        JSON.stringify({ success: true, data: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const searchSummary = allResults
      .map((r: any, i: number) =>
        `[${i + 1}] URL: ${r.url || 'N/A'}\nTitle: ${r.title || 'N/A'}\nDescription: ${r.description || 'N/A'}\nContent: ${(r.markdown || '').slice(0, 500)}`,
      )
      .join('\n---\n');

    // Use AI to extract advertiser names from results
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Você é um extrator de dados especializado em identificar anunciantes na Meta Ads Library.
Analise os resultados de busca e extraia os NOMES DAS EMPRESAS/ANUNCIANTES que aparecem.
Foque em imobiliárias, construtoras e corretores que estão anunciando sobre "${searchQuery}".
Retorne APENAS empresas reais encontradas nos resultados. NÃO invente nomes.`,
          },
          {
            role: 'user',
            content: `Extraia os nomes dos anunciantes encontrados nos resultados abaixo:\n\n${searchSummary}`,
          },
        ],
        tools: [{
          type: 'function' as const,
          function: {
            name: 'report_advertisers',
            description: 'Lista os anunciantes encontrados na busca da Meta Ads Library.',
            parameters: {
              type: 'object',
              properties: {
                anunciantes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      nome: { type: 'string', description: 'Nome do anunciante/empresa' },
                      url_anuncio: { type: ['string', 'null'], description: 'URL do anúncio na Ads Library' },
                      descricao: { type: 'string', description: 'Breve descrição do que está anunciando' },
                    },
                    required: ['nome', 'descricao'],
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

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errText);
      throw new Error(`AI Gateway returned ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall || toolCall.function.name !== 'report_advertisers') {
      console.error('AI did not call expected tool:', JSON.stringify(aiData.choices?.[0]?.message));
      return new Response(
        JSON.stringify({ success: true, data: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const anunciantes: AdResult[] = (parsed.anunciantes || []).map((a: any) => ({
      anunciante: a.nome || '',
      url_anuncio: a.url_anuncio || '',
      descricao: a.descricao || '',
      plataforma: 'Meta Ads',
    }));

    console.log('Found advertisers:', anunciantes.length);

    return new Response(
      JSON.stringify({ success: true, data: anunciantes }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Search ads error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
