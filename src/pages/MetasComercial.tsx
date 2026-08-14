import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Target, Plus, Minus, MessageCircle, Instagram, Flame, Megaphone, MapPin, Heart, MessageSquareText, Eye, UserPlus, Send, Reply } from "lucide-react";

// Máquina de Agendamento — Fase 1 (Simbiose_Estrutura_Comercial.md)
// Métrica-mãe: reuniões de diagnóstico agendadas HOJE = 6 (IG 2 · Frio 1 · Reativação 2 · Pago 1).

type Canal = "instagram" | "whatsapp_frio" | "reativacao" | "pago";

const CANAIS: { key: Canal; label: string; icon: React.ElementType; quem: string }[] = [
  { key: "instagram", label: "Instagram (manual)", icon: Instagram, quem: "você" },
  { key: "whatsapp_frio", label: "WhatsApp frio (IA)", icon: MessageCircle, quem: "Larissa" },
  { key: "reativacao", label: "Reativação (IA)", icon: Flame, quem: "Larissa" },
  { key: "pago", label: "Campanha paga", icon: Megaphone, quem: "inbound" },
];

type LinhaPainel = {
  dia: string;
  canal: string;
  reunioes_agendadas: number;
  reunioes_realizadas: number;
  abordagens: number;
  respostas: number;
};

// Micro-ações do aquecimento IG (bloco 08-10h) + abordagem/resposta, POR PERFIL:
// guilherme = @guidomingues99 (pessoal) · simbiose = @asimbiosedigital (marca).
// Tudo em comercial_micro_acoes (dia, perfil, tipo); abordagem/resposta também
// alimentam o agregado comercial_log_diario (placar/manager leem de lá).
type MicroTipo = "curtida" | "comentario" | "story" | "follow" | "abordagem" | "resposta";
type Perfil = "guilherme" | "simbiose";

// Prospecção 1-a-1 na base de imobiliárias (página /social-selling). É trabalho de outra
// pessoa e de outra natureza que o aquecimento por perfil — por isso conta em bloco próprio
// em vez de somar nos mesmos contadores.
type SocialDia = {
  dia: string; curtidas: number; comentarios: number; seguidas: number;
  dms: number; respostas: number; imobiliarias: number;
} | null;

const PERFIS: { key: Perfil; label: string }[] = [
  { key: "guilherme", label: "@guidomingues99" },
  { key: "simbiose", label: "@asimbiosedigital" },
];

const MICRO_DEFS: { tipo: MicroTipo; label: string; icon: React.ElementType }[] = [
  { tipo: "curtida", label: "curtida", icon: Heart },
  { tipo: "comentario", label: "comentário", icon: MessageSquareText },
  { tipo: "story", label: "story visto", icon: Eye },
  { tipo: "follow", label: "follow", icon: UserPlus },
  { tipo: "abordagem", label: "DM enviada", icon: Send },
  { tipo: "resposta", label: "resposta", icon: Reply },
];

function hojeISO() {
  // dia em Brasília (o painel SQL também agrega em America/Sao_Paulo)
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
  return fmt.format(new Date());
}

export default function MetasComercial() {
  const [loading, setLoading] = useState(true);
  const [social, setSocial] = useState<SocialDia>(null);
  const [metasCanal, setMetasCanal] = useState<Record<string, number>>({
    instagram: 2, whatsapp_frio: 1, reativacao: 2, pago: 1,
  });
  const [metaDia, setMetaDia] = useState(6);
  const [praca, setPraca] = useState("");
  const [pracaEdit, setPracaEdit] = useState("");
  const [hoje, setHoje] = useState<LinhaPainel[]>([]);
  const [semana, setSemana] = useState<LinhaPainel[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [micro, setMicro] = useState<Record<Perfil, Record<string, number>>>({ guilherme: {}, simbiose: {} });
  const [metasMicro, setMetasMicro] = useState<Record<string, Record<string, number>>>({});
  const [perfil, setPerfil] = useState<Perfil>("guilherme");

  const load = useCallback(async () => {
    const dia = hojeISO();
    const seteAtras = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const [cfg, painelHoje, painelSemana, microHoje, socialHoje] = await Promise.all([
      supabase.from("comercial_config").select("*").eq("id", 1).maybeSingle(),
      supabase.from("comercial_painel_dia").select("*").eq("dia", dia),
      supabase.from("comercial_painel_dia").select("*").gte("dia", seteAtras),
      supabase.from("comercial_micro_acoes" as any).select("perfil,tipo,qtd").eq("dia", dia),
      // A prospecção da Rayana vive em social_selling_alvos e nunca entrou aqui: a aba
      // mostrava zero enquanto saíam 100+ DMs por dia. Agora vem datada da view.
      supabase.from("vw_social_selling_dia" as any).select("*").eq("dia", dia).maybeSingle(),
    ]);
    if (cfg.data) {
      setMetaDia(cfg.data.meta_reunioes_dia ?? 6);
      setMetasCanal(cfg.data.metas_canal ?? metasCanal);
      setMetasMicro((cfg.data as any).metas_micro ?? {});
      setPraca(cfg.data.praca_atual ?? "");
      setPracaEdit(cfg.data.praca_atual ?? "");
    }
    setHoje((painelHoje.data as LinhaPainel[]) ?? []);
    setSemana((painelSemana.data as LinhaPainel[]) ?? []);
    const m: Record<Perfil, Record<string, number>> = { guilherme: {}, simbiose: {} };
    for (const r of ((microHoje.data as any[]) || [])) {
      const p = (r.perfil === "simbiose" ? "simbiose" : "guilherme") as Perfil;
      m[p][r.tipo] = r.qtd;
    }
    setMicro(m);
    setSocial((socialHoje.data as SocialDia) ?? null);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // placar ao vivo
    return () => clearInterval(t);
  }, [load]);

  const porCanal = (canal: Canal) => hoje.find((l) => l.canal === canal);
  const totalHoje = hoje.reduce((s, l) => s + (l.reunioes_agendadas || 0), 0);
  const totalSemana = semana.reduce((s, l) => s + (l.reunioes_agendadas || 0), 0);

  async function bump(canal: Canal, campo: "abordagens" | "respostas", delta = 1) {
    setSalvando(true);
    const dia = hojeISO();
    const atual = porCanal(canal);
    const novo = {
      dia,
      canal,
      abordagens: Math.max(0, (atual?.abordagens || 0) + (campo === "abordagens" ? delta : 0)),
      respostas: Math.max(0, (atual?.respostas || 0) + (campo === "respostas" ? delta : 0)),
      updated_at: new Date().toISOString(),
    };
    await supabase.from("comercial_log_diario").upsert(novo, { onConflict: "dia,canal" });
    await load();
    setSalvando(false);
  }

  // +1/-1 numa micro-ação DO PERFIL selecionado. Tudo vai pra comercial_micro_acoes
  // (dia, perfil, tipo); abordagem/resposta ALÉM disso re-agregam no comercial_log_diario
  // (soma dos 2 perfis — é de lá que o placar e o manager leem).
  async function bumpMicro(tipo: MicroTipo, delta: 1 | -1) {
    setSalvando(true);
    const dia = hojeISO();
    const atual = Math.max(0, (micro[perfil][tipo] || 0) + delta);
    setMicro((m) => ({ ...m, [perfil]: { ...m[perfil], [tipo]: atual } })); // otimista
    await supabase.from("comercial_micro_acoes" as any).upsert(
      { dia, perfil, tipo, qtd: atual, updated_at: new Date().toISOString() },
      { onConflict: "dia,perfil,tipo" },
    );
    if (tipo === "abordagem" || tipo === "resposta") {
      // agregado dos 2 perfis → comercial_log_diario (canal instagram)
      const outro: Perfil = perfil === "guilherme" ? "simbiose" : "guilherme";
      const somaAb = (tipo === "abordagem" ? atual : (micro[perfil]["abordagem"] || 0)) + (micro[outro]["abordagem"] || 0);
      const somaRe = (tipo === "resposta" ? atual : (micro[perfil]["resposta"] || 0)) + (micro[outro]["resposta"] || 0);
      await supabase.from("comercial_log_diario").upsert(
        { dia, canal: "instagram", abordagens: somaAb, respostas: somaRe, updated_at: new Date().toISOString() },
        { onConflict: "dia,canal" },
      );
      await load();
    }
    setSalvando(false);
  }

  async function salvarPraca() {
    setSalvando(true);
    await supabase.from("comercial_config")
      .update({ praca_atual: pracaEdit.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setPraca(pracaEdit.trim());
    setSalvando(false);
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-4 p-6">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  const pct = Math.min(100, Math.round((totalHoje / metaDia) * 100));

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        {/* Métrica-mãe */}
        <Card className={totalHoje >= metaDia ? "border-green-500" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Target className="h-4 w-4" /> Métrica-mãe · reuniões de diagnóstico agendadas hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4">
              <span className="text-5xl font-bold tabular-nums">{totalHoje}</span>
              <span className="pb-1 text-2xl text-muted-foreground">/ {metaDia}</span>
              <span className="ml-auto pb-1 text-sm text-muted-foreground">
                semana: <b className="tabular-nums">{totalSemana}</b> / {metaDia * 7}
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded bg-muted">
              <div
                className={`h-full ${totalHoje >= metaDia ? "bg-green-500" : "bg-primary"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Canais */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {CANAIS.map(({ key, label, icon: Icon, quem }) => {
            const linha = porCanal(key);
            const meta = metasCanal[key] ?? 0;
            const feito = linha?.reunioes_agendadas || 0;
            const ok = feito >= meta;
            return (
              <Card key={key} className={ok ? "border-green-500/60" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Icon className="h-4 w-4" /> {label}
                    <span className="ml-auto text-xs font-normal text-muted-foreground">{quem}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold tabular-nums">{feito}</span>
                    <span className="pb-0.5 text-muted-foreground">/ {meta} reuniões</span>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {linha?.abordagens || 0} abordagens · {linha?.respostas || 0} respostas
                    {linha?.reunioes_realizadas ? ` · ${linha.reunioes_realizadas} realizadas` : ""}
                  </div>
                  {key === "instagram" && (
                    <p className="text-[11px] text-muted-foreground">
                      registre no card Aquecimento ↓
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Aquecimento Instagram — micro-ações (bloco 08–10h), botões de polegar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              <Instagram className="h-4 w-4" /> Aquecimento Instagram · hoje
              <div className="ml-auto flex rounded-md border p-0.5">
                {PERFIS.map((p) => (
                  <button key={p.key} onClick={() => setPerfil(p.key)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      perfil === p.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {MICRO_DEFS.map(({ tipo, label, icon: Icon }) => {
                const valor = micro[perfil][tipo] || 0;
                const outroPerfil: Perfil = perfil === "guilherme" ? "simbiose" : "guilherme";
                const valorOutro = micro[outroPerfil][tipo] || 0;
                const meta = (metasMicro[perfil] || {})[tipo] || 0;
                const ok = meta > 0 && valor >= meta;
                return (
                  <div key={tipo}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 ${ok ? "border-green-500/60 bg-green-500/5" : ""}`}>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </div>
                    <div className="text-2xl font-bold tabular-nums leading-none">
                      {valor}<span className="text-sm font-normal text-muted-foreground">{meta ? `/${meta}` : ""}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      {valorOutro > 0 ? `outro perfil: ${valorOutro}` : " "}
                    </div>
                    <div className="flex w-full gap-1">
                      <Button size="sm" variant="ghost" className="h-8 w-8 shrink-0 p-0 text-muted-foreground"
                        disabled={salvando || valor === 0} onClick={() => bumpMicro(tipo, -1)}>
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" className="h-8 flex-1" disabled={salvando}
                        onClick={() => bumpMicro(tipo, 1)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Funil manual: aquecer → DM → resposta → diagnóstico, nos dois perfis.
              Placar e report somam os dois; metas por perfil em <code>comercial_config.metas_micro</code>.
            </p>
          </CardContent>
        </Card>

        {/* Social selling — prospecção 1-a-1 na base (página /social-selling) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Send className="h-4 w-4" /> Social selling · hoje
              <span className="text-xs font-normal text-muted-foreground">
                prospecção na base de imobiliárias
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!social || social.imobiliarias === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma imobiliária trabalhada hoje ainda. O que for marcado em{" "}
                <a href="/social-selling" className="underline">Social Selling</a> aparece aqui.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    { label: "curtidas", v: social.curtidas },
                    { label: "comentários", v: social.comentarios },
                    { label: "seguidas", v: social.seguidas },
                    { label: "DMs", v: social.dms },
                    { label: "respostas", v: social.respostas },
                  ].map((x) => (
                    <div key={x.label} className="rounded-lg border p-3 text-center">
                      <div className="text-2xl font-semibold tabular-nums">{x.v ?? 0}</div>
                      <div className="text-xs text-muted-foreground">{x.label}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {social.imobiliarias} imobiliária(s) trabalhada(s) hoje. Contagem vem das
                  marcações da página Social Selling, não de digitação manual.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Jornada do dia + praça da vez */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Jornada do dia (08h–22h)</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ol className="list-inside list-decimal space-y-1">
                <li><b className="text-foreground">08–10h</b> aquecimento Instagram (curtir/stories, sem mensagem)</li>
                <li><b className="text-foreground">10–12h</b> abordagem manual (30–50 contatos aquecidos)</li>
                <li><b className="text-foreground">14–16h</b> reativação com IA (disparo + revisar retornos)</li>
                <li><b className="text-foreground">16–18h</b> follow-up e agendamento (IG + WhatsApp)</li>
                <li><b className="text-foreground">19–22h</b> encaixe de reuniões + 2ª rodada de follow-up</li>
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4" /> War por região · praça da vez
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Todos os canais concentrados numa cidade até dominá-la.
                {praca ? <> Atual: <b className="text-foreground">{praca}</b></> : " Nenhuma definida — alinhar cidades liberadas com o Vinícius."}
              </p>
              <div className="flex gap-2">
                <Input value={pracaEdit} onChange={(e) => setPracaEdit(e.target.value)}
                  placeholder="ex.: Campinas/SP" />
                <Button size="sm" onClick={salvarPraca} disabled={salvando}>salvar</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leads da prospecção manual do IG entram com prefixo <code>IG-</code> (contam no canal Instagram).
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
