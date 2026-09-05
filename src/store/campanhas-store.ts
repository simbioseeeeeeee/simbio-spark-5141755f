import { supabase } from "@/integrations/supabase/client";

// Painel de desempenho da operação comercial da Simbiose.
//
// A conta lê de três views diárias (vw_simbiose_midia_diaria, _atividade_diaria, _funil_diario)
// em vez de agregar no navegador: o filtro de período vira um `where dia between` e o mesmo
// dado serve gráfico e tabela sem duplicar lógica.
//
// A view de mídia só traz client_slug='simbiose' — o painel é da casa, não dos clientes.

export type Periodo = { de: string; ate: string };   // yyyy-mm-dd, inclusivo

export type MidiaLinha = {
  dia: string;
  campaign_id: string;
  campaign_name: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  gasto: number;
  impressoes: number;
  cliques: number;
  leads: number;
  cpl: number | null;
};

export type AtividadeDia = {
  dia: string;
  ligacoes: number;
  lig_conectadas: number;
  lig_conversa: number;
  lig_nao_atendeu: number;
  lig_ocupado: number;
  lig_caixa_postal: number;
  lig_falha_conexao: number;
  lig_duracao_media_s: number | null;
  sms: number;
  sms_ok: number;
  whatsapp: number;
  emails: number;
  reunioes_marcadas: number;
};

export type FunilDia = {
  dia: string;
  origem: string;
  leads_novos: number;
  reuniao_agendada: number;
  reuniao_realizada: number;
  fechado_ganho: number;
  desqualificado: number;
};

export type Painel = {
  midia: MidiaLinha[];
  atividade: AtividadeDia[];
  funil: FunilDia[];
};

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export async function carregarPainel(p: Periodo): Promise<Painel> {
  const [midia, atividade, funil] = await Promise.all([
    supabase.from("vw_simbiose_midia_diaria" as any)
      .select("*").gte("dia", p.de).lte("dia", p.ate).order("dia"),
    supabase.from("vw_simbiose_atividade_diaria" as any)
      .select("*").gte("dia", p.de).lte("dia", p.ate).order("dia"),
    supabase.from("vw_simbiose_funil_diario" as any)
      .select("*").gte("dia", p.de).lte("dia", p.ate).order("dia"),
  ]);
  const erro = midia.error || atividade.error || funil.error;
  if (erro) throw erro;

  return {
    midia: ((midia.data as any[]) || []).map((r) => ({
      ...r, gasto: num(r.gasto), impressoes: num(r.impressoes),
      cliques: num(r.cliques), leads: num(r.leads),
      cpl: r.cpl === null ? null : Number(r.cpl),
    })) as MidiaLinha[],
    atividade: ((atividade.data as any[]) || []) as AtividadeDia[],
    funil: ((funil.data as any[]) || []) as FunilDia[],
  };
}

// ─── período ────────────────────────────────────────────────────────────────
// Tudo em BRT: as views já convertem created_at pro fuso do negócio, então aqui
// basta montar a data local sem passar por UTC (new Date().toISOString() volta
// o dia anterior depois das 21h e mostraria "hoje" vazio).
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const PERIODOS = ["hoje", "7d", "30d", "mes"] as const;
export type PeriodoNome = (typeof PERIODOS)[number] | "custom";

export const PERIODO_LABEL: Record<string, string> = {
  hoje: "Hoje", "7d": "7 dias", "30d": "30 dias", mes: "Este mês", custom: "Personalizado",
};

export function montaPeriodo(nome: PeriodoNome): Periodo {
  const hoje = new Date();
  const ate = iso(hoje);
  if (nome === "hoje") return { de: ate, ate };
  if (nome === "mes") return { de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate };
  const dias = nome === "7d" ? 6 : 29;
  const de = new Date(hoje);
  de.setDate(de.getDate() - dias);
  return { de: iso(de), ate };
}

/** Janela imediatamente anterior, do mesmo tamanho — base das setas de variação. */
export function periodoAnterior(p: Periodo): Periodo {
  const d0 = new Date(p.de + "T12:00:00");
  const d1 = new Date(p.ate + "T12:00:00");
  const dias = Math.round((d1.getTime() - d0.getTime()) / 86400000) + 1;
  const ate = new Date(d0); ate.setDate(ate.getDate() - 1);
  const de = new Date(ate); de.setDate(de.getDate() - (dias - 1));
  return { de: iso(de), ate: iso(ate) };
}

// ─── consolidação ───────────────────────────────────────────────────────────

export type Resumo = {
  gasto: number; leads: number; cpl: number | null;
  impressoes: number; cliques: number;
  ligacoes: number; lig_conversa: number; sms: number; whatsapp: number; emails: number;
  reunioes: number; custoPorReuniao: number | null;
  leadsNovos: number; fechados: number;
};

export function resumir(p: Painel): Resumo {
  const s = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((a, x) => a + (f(x) || 0), 0);
  const gasto = s(p.midia, (m) => m.gasto);
  const leads = s(p.midia, (m) => m.leads);
  const reunioes = s(p.atividade, (a) => a.reunioes_marcadas);
  return {
    gasto, leads,
    cpl: leads > 0 ? gasto / leads : null,
    impressoes: s(p.midia, (m) => m.impressoes),
    cliques: s(p.midia, (m) => m.cliques),
    ligacoes: s(p.atividade, (a) => a.ligacoes),
    lig_conversa: s(p.atividade, (a) => a.lig_conversa),
    sms: s(p.atividade, (a) => a.sms),
    whatsapp: s(p.atividade, (a) => a.whatsapp),
    emails: s(p.atividade, (a) => a.emails),
    reunioes,
    custoPorReuniao: reunioes > 0 ? gasto / reunioes : null,
    leadsNovos: s(p.funil, (f) => f.leads_novos),
    fechados: s(p.funil, (f) => f.fechado_ganho),
  };
}

/** Agrupa a mídia por anúncio (ou por campanha quando ad_id é nulo). */
export function porAnuncio(midia: MidiaLinha[]) {
  const mapa = new Map<string, {
    chave: string; ad_name: string; campanha: string; gasto: number;
    leads: number; impressoes: number; cliques: number;
  }>();
  for (const m of midia) {
    const chave = m.ad_id || m.campaign_id;
    const at = mapa.get(chave) || {
      chave, ad_name: m.ad_name || m.campaign_name || "(sem nome)",
      campanha: m.campaign_name || "", gasto: 0, leads: 0, impressoes: 0, cliques: 0,
    };
    at.gasto += m.gasto; at.leads += m.leads;
    at.impressoes += m.impressoes; at.cliques += m.cliques;
    mapa.set(chave, at);
  }
  return [...mapa.values()].sort((a, b) => b.gasto - a.gasto);
}

export function porCampanha(midia: MidiaLinha[]) {
  const mapa = new Map<string, { nome: string; gasto: number; leads: number; anuncios: Set<string> }>();
  for (const m of midia) {
    const at = mapa.get(m.campaign_id) || {
      nome: m.campaign_name || "(sem nome)", gasto: 0, leads: 0, anuncios: new Set<string>(),
    };
    at.gasto += m.gasto; at.leads += m.leads;
    if (m.ad_id) at.anuncios.add(m.ad_id);
    mapa.set(m.campaign_id, at);
  }
  return [...mapa.values()]
    .map((c) => ({ ...c, anuncios: c.anuncios.size }))
    .sort((a, b) => b.gasto - a.gasto);
}

/** Série diária pronta pro gráfico: gasto e leads lado a lado. */
export function serieDiaria(p: Painel) {
  const dias = new Map<string, { dia: string; gasto: number; leads: number; ligacoes: number }>();
  for (const m of p.midia) {
    const at = dias.get(m.dia) || { dia: m.dia, gasto: 0, leads: 0, ligacoes: 0 };
    at.gasto += m.gasto; at.leads += m.leads;
    dias.set(m.dia, at);
  }
  for (const a of p.atividade) {
    const at = dias.get(a.dia) || { dia: a.dia, gasto: 0, leads: 0, ligacoes: 0 };
    at.ligacoes += a.ligacoes;
    dias.set(a.dia, at);
  }
  return [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia));
}
