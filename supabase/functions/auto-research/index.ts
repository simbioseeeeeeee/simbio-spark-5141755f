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
  url_site: string | null;
  instagram_ativo: boolean;
  url_instagram: string | null;
  faz_anuncios: boolean;
  whatsapp_automacao: boolean;
  observacoes_sdr: string;
}

// ── 1. Sanitização do input ──────────────────────────────────────
const TERMOS_REMOVER = [
  'LTDA', 'ME', 'EPP', 'EIRELI', 'S\\.A\\.?', 'SA',
  'CORRETORA DE IMOVEIS', 'CORRETORA DE IMÓVEIS',
  'ADMINISTRADORA DE IMOVEIS', 'ADMINISTRADORA DE IMÓVEIS',
  'ADMINISTRADORA', 'CONSULTORIA IMOBILIARIA',
  'CONSULTORIA IMOBILIÁRIA', 'ASSESSORIA IMOBILIARIA',
  'EMPREENDIMENTOS IMOBILIARIOS', 'NEGOCIOS IMOBILIARIOS',
  'NEGÓCIOS IMOBILIÁRIOS', 'INTERMEDIACAO', 'INTERMEDIAÇÃO',
  'SERVICOS', 'SERVIÇOS', 'GESTAO', 'GESTÃO',
  'COMPRA E VENDA', 'COMPRA VENDA',
];

function sanitizarNome(razaoSocial: string, fantasia?: string): string {
  // Prioriza fantasia se existir
  const raw = (fantasia?.trim() || razaoSocial || '').trim();
  if (!raw) return '';

  const regex = new RegExp(`\\b(${TERMOS_REMOVER.join('|')})\\b`, 'gi');
  return raw
    .replace(regex, '')
    .replace(/[.\-\/]+/g, ' ')   // pontuação residual
    .replace(/\s{2,}/g, ' ')     // espaços duplos
    .trim();
}

// ── 2. Tool definition para saída estruturada ────────────────────
const RESEARCH_TOOL = {
  type: 'function' as const,
  function: {
    name: 'report_research',
    description: 'Retorna os dados de pesquisa encontrados sobre a empresa.',
    parameters: {
      type: 'object',
      properties: {
        url_site: {
          type: ['string', 'null'],
          description: 'URL completa do site oficial da empresa. null se não encontrado.',
        },
        url_instagram: {
          type: ['string', 'null'],
          description: 'URL completa do perfil do Instagram da empresa. null se não encontrado.',
        },
        faz_anuncios: {
          type: 'boolean',
          description: 'Se há evidência de anúncios pagos (Meta Ads, Google Ads).',
        },
        whatsapp_automacao: {
          type: 'boolean',
          description: 'Se há evidência clara de automação/bot no WhatsApp.',
        },
        observacoes: {
          type: 'string',
          description: 'Resumo breve (2-3 frases) do que foi encontrado.',
        },
      },
      required: ['url_site', 'url_instagram', 'faz_anuncios', 'whatsapp_automacao', 'observacoes'],
      additionalProperties: false,
    },
  },
};

// ── 3. Busca via Firecrawl ───────────────────────────────────────
async function searchFirecrawl(
  firecrawlKey: string,
  query: string,
  limit = 5,
): Promise<any[]> {
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit, lang: 'pt-br', country: 'BR' }),
    });
    const data = await res.json();
    return data?.data || [];
  } catch (e) {
    console.error('Firecrawl search error:', e);
    return [];
  }
}

// ── Handler principal ────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { razao_social, fantasia, cidade, uf, cnae_descricao } = await req.json() as ResearchRequest;

    const nomeLimpo = sanitizarNome(razao_social, fantasia);
    if (!nomeLimpo) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nome da empresa é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');

    if (!firecrawlKey || !lovableKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'API keys não configuradas' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`Researching: "${nomeLimpo}" — ${cidade}/${uf}`);

    // Buscas paralelas no Firecrawl
    const [siteResults, instaResults, adsResults] = await Promise.all([
      searchFirecrawl(firecrawlKey, `"${nomeLimpo}" ${cidade} ${uf} site oficial`, 8),
      searchFirecrawl(firecrawlKey, `site:instagram.com "${nomeLimpo}" ${cidade}`, 5),
      searchFirecrawl(firecrawlKey, `site:facebook.com/ads/library "informações sobre o anúncio" "${nomeLimpo}"`, 5),
    ]);

    const allResults = [...siteResults, ...instaResults, ...adsResults];
    console.log('Total search results:', allResults.length);

    const searchSummary = allResults
      .map((r: any, i: number) =>
        `[${i + 1}] URL: ${r.url || 'N/A'}\nTitle: ${r.title || 'N/A'}\nDescription: ${r.description || 'N/A'}\nContent: ${(r.markdown || '').slice(0, 400)}`,
      )
      .join('\n---\n');

    // ── Chamada ao LLM com tool calling para saída estruturada ──
    const systemPrompt = `Você é um pesquisador web especialista em inteligência de vendas B2B para o mercado imobiliário brasileiro.

SUA ÚNICA FONTE DE VERDADE são os resultados de busca fornecidos pelo usuário. Você NÃO deve inventar, adivinhar ou inferir URLs.

REGRAS ESTRITAS:
- Para url_site: Encontre o domínio oficial da empresa nos resultados. IGNORE portais como Zap Imóveis, Viva Real, CNPJ Biz, Casa Mineira, Chaves na Mão, consultasocio.com, cnpj.info, econodata.com.br, speedio.com.br, guiamais.com.br, apontador.com.br, 123i.com.br, wimoveis.com.br.
- Para url_instagram: Encontre uma URL do tipo instagram.com/perfil_da_empresa nos resultados. Deve ser o perfil oficial.
- Se NÃO encontrar com certeza nos resultados, retorne null para o campo. NUNCA invente uma URL.
- faz_anuncios: true SOMENTE se nos resultados existir uma URL do domínio facebook.com/ads/library que contenha o NOME EXATO da empresa (ou variação muito próxima). Menções genéricas a "Meta Ads", "Facebook Ads" ou "Google Ads" em textos de blog, artigos ou portais NÃO contam. Se não houver link direto da Meta Ads Library com o nome da empresa, retorne false.
- whatsapp_automacao: true somente com evidência clara de bot/automação.

Chame a função report_research com os dados encontrados.`;

    const userPrompt = `Pesquise os dados da seguinte empresa nos resultados abaixo:

Empresa: ${nomeLimpo}
Cidade/UF: ${cidade} - ${uf}
Segmento: ${cnae_descricao || 'Imobiliária'}

RESULTADOS DA BUSCA:
${searchSummary || 'Nenhum resultado encontrado.'}`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [RESEARCH_TOOL],
        tool_choice: { type: 'function', function: { name: 'report_research' } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errText);
      throw new Error(`AI Gateway returned ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();

    // Extrair argumentos do tool call
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'report_research') {
      console.error('AI did not call the expected tool. Response:', JSON.stringify(aiData.choices?.[0]?.message));
      throw new Error('IA não retornou dados estruturados via tool call');
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    console.log('Parsed tool result:', JSON.stringify(parsed));

    // Normalizar "null" string para null real
    const cleanUrl = (v: any): string | null => {
      if (!v || v === 'null' || v === 'undefined' || v === 'N/A') return null;
      return String(v).trim();
    };

    let urlSite = cleanUrl(parsed.url_site);
    let urlInstagram = cleanUrl(parsed.url_instagram);

    // Validar URLs com HEAD request
    async function validateUrl(url: string | null): Promise<string | null> {
      if (!url) return null;
      try {
        const res = await fetch(url, {
          method: 'HEAD',
          redirect: 'follow',
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok || res.status === 405 || res.status === 403) {
          // 405/403 = server exists but blocks HEAD, still valid
          return url;
        }
        console.log(`URL validation failed (${res.status}): ${url}`);
        return null;
      } catch (e) {
        console.log(`URL validation error for ${url}:`, e);
        return null;
      }
    }

    [urlSite, urlInstagram] = await Promise.all([
      validateUrl(urlSite),
      validateUrl(urlInstagram),
    ]);

    console.log('Validated URLs:', { urlSite, urlInstagram });

    const result: ResearchResult = {
      possui_site: !!urlSite,
      url_site: urlSite || '',
      instagram_ativo: !!urlInstagram,
      url_instagram: urlInstagram || '',
      faz_anuncios: !!parsed.faz_anuncios,
      whatsapp_automacao: !!parsed.whatsapp_automacao,
      observacoes_sdr: parsed.observacoes || '',
    };

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Auto-research error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
