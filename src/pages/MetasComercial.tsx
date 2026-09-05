import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Target, MessageCircle, Instagram, Flame, Megaphone, MapPin, Send } from "lucide-react";

// Máquina de Agendamento — métrica-mãe: reuniões de diagnóstico agendadas hoje.
//
// 14/08: saiu o bloco "Aquecimento Instagram" (contador manual em comercial_micro_acoes,
// 16 linhas, parado desde 08/08), a "Jornada do dia" e os contadores de abordagem/resposta
// por canal (comercial_log_diario, 3 linhas, parado desde 07/08). Eram números digitados
// à mão que ninguém digitava mais — mostravam zero e escondiam o que é real.
//
// O que ficou é tudo derivado de dado vivo: reuniões vêm de `atividades`, social selling
// vem das marcações da página /social-selling.

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
};

// Prospecção 1-a-1 na base de imobiliárias (página /social-selling), datada por ação.
type SocialDia = {
  dia: string; curtidas: number; comentarios: number; seguidas: number;
  dms: number; respostas: number; imobiliarias: number;
} | null;

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

  const load = useCallback(async () => {
    const dia = hojeISO();
    const seteAtras = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const [cfg, painelHoje, painelSemana, socialHoje] = await Promise.all([
      supabase.from("comercial_config").select("*").eq("id", 1).maybeSingle(),
      supabase.from("comercial_painel_dia").select("*").eq("dia", dia),
      supabase.from("comercial_painel_dia").select("*").gte("dia", seteAtras),
      // A prospecção da Rayana vive em social_selling_alvos e nunca entrou aqui: a aba
      // mostrava zero enquanto saíam 100+ DMs por dia. Agora vem datada da view.
      supabase.from("vw_social_selling_dia" as any).select("*").eq("dia", dia).maybeSingle(),
    ]);
    if (cfg.data) {
      setMetaDia(cfg.data.meta_reunioes_dia ?? 6);
      setMetasCanal(cfg.data.metas_canal ?? metasCanal);
      setPraca(cfg.data.praca_atual ?? "");
      setPracaEdit(cfg.data.praca_atual ?? "");
    }
    setHoje((painelHoje.data as LinhaPainel[]) ?? []);
    setSemana((painelSemana.data as LinhaPainel[]) ?? []);
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

  async function salvarPraca() {
    setSalvando(true);
    const { data, error } = await supabase.from("comercial_config")
      .update({ praca_atual: pracaEdit.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", 1)
      .select("id");
    if (error || !data?.length) {
      toast({
        title: "Não consegui salvar a praça",
        description: error?.message || "nenhuma linha foi atualizada",
        variant: "destructive",
      });
    } else {
      setPraca(pracaEdit.trim());
      toast({ title: "Praça atualizada", description: "Vale para o Social Selling e o painel." });
    }
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

        {/* Canais — só reuniões, que é o que vem de dado real (atividades) */}
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
                <CardContent className="space-y-2">
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold tabular-nums">{feito}</span>
                    <span className="pb-0.5 text-muted-foreground">/ {meta} reuniões</span>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {linha?.reunioes_realizadas || 0} já realizada(s)
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

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

        {/* Praça da vez */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4" /> War por região · praça da vez
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Todos os canais concentrados numa cidade até dominá-la.
              {praca ? <> Atual: <b className="text-foreground">{praca}</b></> : " Nenhuma definida."}
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
    </AppLayout>
  );
}
