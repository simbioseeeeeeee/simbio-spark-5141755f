import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Bot, User, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

// Conversas do WhatsApp da Larissa (UChat ws 132229) — mesmas tabelas mdew que o
// flow n8n grava (uchat_conversations / uchat_messages). Tudo dentro do CRM.

type Conversa = {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  user_ns: string;
  status: string | null;
  status_etapa: string | null;
  last_message_at: string | null;
  created_at: string;
};

type Mensagem = {
  id: string;
  direction: "in" | "out";
  text_content: string | null;
  created_at: string;
};

type LeadInfo = { cnpj: string; fantasia: string | null; status_sdr: string | null } | null;

export default function Conversas() {
  const [loading, setLoading] = useState(true);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [aberta, setAberta] = useState<Conversa | null>(null);
  const [msgs, setMsgs] = useState<Mensagem[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [lead, setLead] = useState<LeadInfo>(null);

  const load = useCallback(async () => {
    // tabela multi-tenant: o flow não grava client_slug — o recorte certo é o
    // workspace da Larissa (132229). Descoberto no 1º inbound real (2026-08-06).
    const { data } = await supabase
      .from("uchat_conversations" as any)
      .select("id,contact_name,contact_phone,user_ns,status,status_etapa,last_message_at,created_at")
      .eq("workspace_id", "132229")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(100);
    setConversas(((data as any[]) || []) as Conversa[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // conversa nova / mensagem nova → recarrega a lista
    const ch = supabase
      .channel("crm-conversas-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "uchat_conversations" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "uchat_messages" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  async function abrir(c: Conversa) {
    setAberta(c);
    setMsgsLoading(true);
    setLead(null);
    const [m, l] = await Promise.all([
      supabase
        .from("uchat_messages" as any)
        .select("id,direction,text_content,created_at")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: true })
        .limit(300),
      c.contact_phone
        ? supabase
            .from("leads")
            .select("cnpj,fantasia,status_sdr")
            .is("deleted_at", null)
            .ilike("celular1", `%${String(c.contact_phone).replace(/\D/g, "").slice(-9)}%`)
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setMsgs(((m.data as any[]) || []) as Mensagem[]);
    setLead((l as any)?.data ?? null);
    setMsgsLoading(false);
  }

  // transcript ao vivo enquanto o drawer está aberto
  useEffect(() => {
    if (!aberta) return;
    const ch = supabase
      .channel(`crm-conversa-${aberta.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "uchat_messages", filter: `conversation_id=eq.${aberta.id}` },
        (payload) => setMsgs((prev) => [...prev, payload.new as Mensagem]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [aberta]);

  return (
    <AppLayout>
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <MessageSquare className="h-5 w-5 text-primary" />
            Conversas da Larissa
            <span className="text-sm font-normal text-muted-foreground">WhatsApp · UChat</span>
          </h2>
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); load(); }}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> atualizar
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : conversas.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma conversa ainda — quando um lead falar com a Larissa no WhatsApp, aparece aqui em tempo real.
          </CardContent></Card>
        ) : (
          <div className="divide-y rounded-lg border">
            {conversas.map((c) => (
              <button key={c.id} onClick={() => abrir(c)}
                className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/50">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{c.contact_name || c.contact_phone || c.user_ns}</span>
                    {c.status_etapa ? <Badge variant="outline" className="text-[10px]">{c.status_etapa}</Badge> : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {c.contact_phone ? `+${String(c.contact_phone).replace(/\D/g, "")}` : "—"}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {c.last_message_at
                    ? formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true, locale: ptBR })
                    : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Sheet open={!!aberta} onOpenChange={(o) => !o && setAberta(null)}>
        <SheetContent className="flex w-full flex-col sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {aberta?.contact_name || aberta?.contact_phone}
              {lead ? (
                <Badge variant="secondary" className="ml-1">{lead.status_sdr || "no CRM"}</Badge>
              ) : (
                <Badge variant="outline" className="ml-1 text-muted-foreground">sem lead</Badge>
              )}
            </SheetTitle>
            {lead?.fantasia ? (
              <p className="text-xs text-muted-foreground">{lead.fantasia} · {lead.cnpj}</p>
            ) : null}
          </SheetHeader>
          <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
            {msgsLoading ? (
              [...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-3/4" />)
            ) : (
              msgs.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.direction === "out"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}>
                    <div className="mb-0.5 flex items-center gap-1 text-[10px] opacity-70">
                      {m.direction === "out" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                      {m.direction === "out" ? "Larissa" : "Lead"} ·{" "}
                      {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="whitespace-pre-wrap break-words">{m.text_content}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
