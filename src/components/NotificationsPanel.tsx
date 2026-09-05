import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, X, CalendarCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Notification {
  id: string;
  lead_name: string;
  lead_cnpj: string;
  created_at: string;
  read: boolean;
}

export function NotificationsPanel() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const loadNotifications = useCallback(async () => {
    // O banco registra reunião com os enums minúsculos reuniao/agendado.
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data, error } = await (supabase
      .from("atividades")
      .select("id, lead_cnpj, created_at, resultado")
      .eq("resultado", "agendado")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(50) as any);

    if (error) {
      console.error("Error loading notifications:", error);
      return;
    }

    if (!data || data.length === 0) {
      setNotifications([]);
      return;
    }

    // Get lead names
    const leadCnpjs = [...new Set(data.map((a: any) => a.lead_cnpj))] as string[];
    const { data: leads } = await (supabase
      .from("leads")
      .select("cnpj, fantasia, razao_social")
      .is("deleted_at", null)
      .in("cnpj", leadCnpjs) as any);

    const leadMap = new Map((leads || []).map((l: any) => [l.cnpj, l.fantasia || l.razao_social || "Lead"]));

    // Check which ones were read from localStorage
    const readIds = JSON.parse(localStorage.getItem("read_notifications") || "[]") as string[];

    setNotifications(
      data.map((a: any) => ({
        id: a.id,
        lead_name: leadMap.get(a.lead_cnpj) || "Lead",
        lead_cnpj: a.lead_cnpj,
        created_at: a.created_at,
        read: readIds.includes(a.id),
      }))
    );
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("notifications-closer")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "atividades",
        filter: "resultado=eq.agendado",
      }, () => {
        loadNotifications();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadNotifications]);

  const markAllRead = () => {
    const ids = notifications.map((n) => n.id);
    localStorage.setItem("read_notifications", JSON.stringify(ids));
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="relative gap-1.5 text-muted-foreground justify-start w-full">
          <Bell className="h-4 w-4" />
          <span>Notificações</span>
          {unreadCount > 0 && (
            <span className="absolute top-1 left-5 h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[380px] sm:w-[420px]">
        <SheetHeader>
          <div className="flex items-center justify-between pr-2">
            <SheetTitle className="text-base">Notificações</SheetTitle>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs h-7">
                Marcar todas como lidas
              </Button>
            )}
          </div>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-100px)] mt-4">
          {notifications.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma notificação</p>
            </div>
          ) : (
            <div className="space-y-1">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`rounded-lg p-3 flex items-start gap-3 transition-colors ${n.read ? "opacity-60" : "bg-primary/5 border border-primary/10"}`}
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <CalendarCheck className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">Reunião Agendada</p>
                    <p className="text-xs text-muted-foreground truncate">{n.lead_name}</p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
