const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface SearchRequest {
  keywords?: string[];
  cidade?: string;
  uf?: string;
}

interface AdvertiserAgg {
  advertiser: string;
  page_id: string;
  count: number;
  first: Date;
  last: Date;
  maxMonths: number;
  urls: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords, cidade, uf } = await req.json() as SearchRequest;

    const metaToken = Deno.env.get('META_ACCESS_TOKEN');
    if (!metaToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'META_ACCESS_TOKEN não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const searchTerms = keywords?.length ? keywords : ['minha casa minha vida'];
    const locationPart = [cidade, uf].filter(Boolean).join(' ');

    console.log('Meta Ads Library search:', searchTerms, 'location:', locationPart);

    const allAds: any[] = [];

    // Query Meta Ads Library API for each keyword
    for (const term of searchTerms.slice(0, 3)) {
      const q = locationPart ? `${term} ${locationPart}` : term;
      const params = new URLSearchParams({
        search_terms: q,
        ad_reached_countries: '["BR"]',
        ad_active_status: 'ALL',
        fields: 'page_name,page_id,ad_creation_time,ad_delivery_start_time,ad_delivery_stop_time,ad_snapshot_url',
        limit: '500',
        access_token: metaToken,
      });

      const url = `https://graph.facebook.com/v22.0/ads_archive?${params.toString()}`;
      console.log('Fetching Meta API for term:', term);

      try {
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) {
          console.error('Meta API error:', JSON.stringify(data).slice(0, 500));
          // If token is invalid, fail fast
          if (res.status === 400 || res.status === 401) {
            return new Response(
              JSON.stringify({ success: false, error: `Erro na API Meta: ${data?.error?.message || res.status}` }),
              { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
          continue;
        }

        const ads = data?.data || [];
        console.log(`Term "${term}": ${ads.length} ads found`);
        allAds.push(...ads);

        // Follow paging if available (up to 1 more page)
        if (data?.paging?.next && allAds.length < 800) {
          try {
            const nextRes = await fetch(data.paging.next);
            const nextData = await nextRes.json();
            if (nextRes.ok && nextData?.data) {
              allAds.push(...nextData.data);
              console.log(`Paging: +${nextData.data.length} ads`);
            }
          } catch (e) {
            console.error('Paging error:', e);
          }
        }
      } catch (e) {
        console.error('Fetch error for term:', term, e);
      }
    }

    console.log('Total raw ads:', allAds.length);

    if (allAds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, data: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Aggregate by page (advertiser)
    const byPage: Record<string, AdvertiserAgg> = {};

    for (const ad of allAds) {
      const key = ad.page_id || ad.page_name || 'unknown';
      const start = new Date(ad.ad_delivery_start_time || ad.ad_creation_time || Date.now());
      const stop = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time) : new Date();

      if (!byPage[key]) {
        byPage[key] = {
          advertiser: ad.page_name || 'Desconhecido',
          page_id: ad.page_id || '',
          count: 0,
          first: start,
          last: stop,
          maxMonths: 0,
          urls: [],
        };
      }

      const entry = byPage[key];
      entry.count++;

      if (start < entry.first) entry.first = start;
      if (stop > entry.last) entry.last = stop;

      // Calculate months this ad has been running
      const months = Math.max(1, Math.ceil((Date.now() - start.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
      if (months > entry.maxMonths) entry.maxMonths = months;

      // Keep first ad URL
      if (ad.ad_snapshot_url && entry.urls.length < 3) {
        entry.urls.push(ad.ad_snapshot_url);
      }
    }

    // Convert to result array, sorted by count desc
    const results = Object.values(byPage)
      .map((agg) => {
        const volumePerMonth = Math.max(1, Math.ceil(agg.count / Math.max(1, agg.maxMonths)));
        return {
          anunciante: agg.advertiser,
          url_anuncio: agg.urls[0] || `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=BR&view_all_page_id=${agg.page_id}`,
          descricao: `${agg.count} anúncio(s) encontrado(s). Ativo desde ${agg.first.toISOString().slice(0, 10)}.`,
          plataforma: 'Meta Ads',
          tempo_anunciando: agg.maxMonths >= 12
            ? `${Math.floor(agg.maxMonths / 12)} ano(s) e ${agg.maxMonths % 12} meses`
            : `${agg.maxMonths} mês(es)`,
          volume_estimado: `${agg.count} total (~${volumePerMonth}/mês)`,
          total_ads: agg.count,
          meses_ativo: agg.maxMonths,
        };
      })
      .sort((a, b) => b.total_ads - a.total_ads);

    console.log('Unique advertisers:', results.length);

    return new Response(
      JSON.stringify({ success: true, data: results }),
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
