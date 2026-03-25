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
    const aiPrompt = `Você é um pesquisador especialista em Inteligência de Vendas B2B. Sua missão é enriquecer o cadastro de uma imobiliária encontrando EXATAMENTE a sua URL do Site Oficial e a sua URL do Instagram.

Dados da empresa para pesquisar:
- Razão Social: ${razao_social}
- Nome Fantasia: ${fantasia || 'N/A'}
- Cidade/Estado: ${cidade} - ${uf}
- Segmento: ${cnae_descricao}

RESULTADOS DA PESQUISA (use estes dados para sua análise):
${searchSummary || 'Nenhum resultado encontrado.'}

INSTRUÇÕES DE ANÁLISE (Siga rigorosamente):

1. SITE OFICIAL:
- Procure nos resultados um domínio que pareça ser o site oficial da empresa (ex: www.imobiliariax.com.br).
- IGNORE diretórios como Zap Imóveis, Viva Real, CNPJ Biz, Casa Mineira, Chaves na Mão, consultasocio.com, cnpj.info, econodata.com.br, speedio.com.br.
- Só marque possui_site=true se encontrar o domínio oficial real da empresa.

2. INSTAGRAM:
- Procure nos resultados URLs do instagram.com que sejam o perfil oficial da empresa.
- O resultado deve ser o perfil oficial (ex: https://instagram.com/imobiliariax).

3. ANÚNCIOS:
- Verifique se há menção a Facebook Ads, Meta Ads Library, Google Ads nos resultados.

4. WHATSAPP BOT:
- Só marque true se houver evidência clara de automação/bot no WhatsApp.

REGRAS DE RETORNO:
- Você é OBRIGADO a tentar encontrar OS DOIS (Site e Instagram). Não pare se encontrar apenas um.
- Se não encontrar um deles com 100% de certeza, retorne false/vazio para aquele campo específico, mas continue procurando o outro.
- Nas observações, escreva um resumo breve (2-3 frases) do que encontrou.

Responda EXCLUSIVAMENTE com um JSON válido neste formato:
{
  "possui_site": true/false,
  "url_site": "URL completa do site ou vazio",
  "instagram_ativo": true/false,
  "url_instagram": "URL completa do instagram ou vazio",
  "faz_anuncios": true/false,
  "whatsapp_automacao": false,
  "observacoes_sdr": "Resumo breve do que foi encontrado na pesquisa"
}`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
