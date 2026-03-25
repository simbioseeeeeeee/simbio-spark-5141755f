const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ResearchRequest {
  razao_social: string;
  fantasia: string;
  cidade: string;
  uf: string;
  cnae_descricao: string;
}

interface ResearchResult {
  possui_site: boolean;
  url_site: string;
  instagram_ativo: boolean;
  url_instagram: string;
  faz_anuncios: boolean;
  whatsapp_automacao: boolean;
  observacoes_sdr: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { razao_social, fantasia, cidade, uf, cnae_descricao } = await req.json() as ResearchRequest;
    const companyName = fantasia || razao_social;

    if (!companyName) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nome da empresa é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'LOVABLE_API_KEY não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Researching: ${companyName} - ${cidade}/${uf}`);

    // Search for the company using Firecrawl
    const searchQuery = `"${companyName}" ${cidade} ${uf} site instagram`;
    console.log('Search query:', searchQuery);

    const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 8,
        scrapeOptions: { formats: ['markdown'] },
      }),
    });

    const searchData = await searchResponse.json();
    console.log('Search results count:', searchData?.data?.length || 0);

    // Also search specifically for Instagram
    const instaSearchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `"${companyName}" ${cidade} instagram.com`,
        limit: 5,
        lang: 'pt-br',
        country: 'BR',
      }),
    });

    const instaData = await instaSearchResponse.json();

    // Also search for Meta Ads
    const adsSearchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `"${companyName}" anúncio facebook ads meta ads`,
        limit: 5,
        lang: 'pt-br',
        country: 'BR',
      }),
    });

    const adsData = await adsSearchResponse.json();

    // Combine all search results for AI analysis
    const allResults = [
      ...(searchData?.data || []),
      ...(instaData?.data || []),
      ...(adsData?.data || []),
    ];

    const searchSummary = allResults.map((r: any, i: number) => 
      `[${i + 1}] URL: ${r.url || 'N/A'}\nTitle: ${r.title || 'N/A'}\nDescription: ${r.description || 'N/A'}\nContent: ${(r.markdown || '').slice(0, 500)}`
    ).join('\n\n---\n\n');

    // Use AI to analyze the search results
    const aiPrompt = `Você é um analista de qualificação de leads B2B. Analise os resultados de pesquisa abaixo sobre a empresa "${companyName}" localizada em ${cidade}/${uf}, segmento: ${cnae_descricao}.

RESULTADOS DA PESQUISA:
${searchSummary || 'Nenhum resultado encontrado.'}

Com base nos resultados, determine:
1. A empresa possui site próprio? Se sim, qual a URL?
2. A empresa tem Instagram ativo? Se sim, qual a URL do perfil?
3. A empresa faz anúncios online (Meta Ads, Google Ads)?
4. O WhatsApp da empresa tem automação/bot?

Responda EXCLUSIVAMENTE em JSON válido neste formato:
{
  "possui_site": true/false,
  "url_site": "URL do site ou vazio",
  "instagram_ativo": true/false,
  "url_instagram": "URL do Instagram ou vazio",
  "faz_anuncios": true/false,
  "whatsapp_automacao": false,
  "observacoes_sdr": "Resumo breve do que foi encontrado na pesquisa (2-3 frases)"
}

REGRAS:
- Só marque como true se houver evidência clara nos resultados
- Para site, procure URLs que pareçam ser o site oficial da empresa (não inclua links de diretórios como CNPJ.info, consultasocio.com, etc)
- Para Instagram, procure URLs do instagram.com com o perfil da empresa
- Para anúncios, procure menção a Facebook Ads, Meta Ads Library, Google Ads
- whatsapp_automacao deve ser false a menos que haja evidência clara
- Nas observações, explique brevemente o que encontrou`;

    const aiResponse = await fetch('https://llgmluxthgwmiwmdajvt.supabase.co/functions/v1/ai-gateway', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: aiPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errText);
      throw new Error(`AI Gateway returned ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';
    console.log('AI response:', aiContent.slice(0, 200));

    // Parse the JSON from AI response
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI não retornou JSON válido');
    }

    const result: ResearchResult = JSON.parse(jsonMatch[0]);

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Auto-research error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
