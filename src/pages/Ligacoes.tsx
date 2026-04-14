import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Phone, Clock, TrendingUp, CalendarCheck, Play, Pause, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CallKpis {
  total_ligacoes: number;
  duracao_media: number;
  taxa_atendimento: number;
  reunioes_via_ligacao: number;
}

interface CallEntry {
  atividade_id: string;
  lead_id: string;
  fantasia: string | null;
  razao_social: string | null;
  cidade: string | null;
  resultado: string;
  nota: string | null;
  duracao_segundos: number | null;
  url_gravacao: string | null;
  transcricao: string | null;
  sentimento: string | null;
  de_numero: string | null;
  para_numero: string | null;
  created_at: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const RESULTADO_COLORS: Record<string, string> = {
  "Atendeu": "bg-success/15 text-success border-success/30",
  "Conectado": "bg-success/15 text-success border-success/30",
  "Agendou Reunião": "bg-primary/15 text-primary border-primary/30",
  "Não Atendeu": "bg-muted text-muted-foreground border-border",
  "Recusou": "bg-destructive/15 text-destructive border-destructive/30",
};

const SENTIMENTO_EMOJI: Record<string, string> = {
  positive: "😊",
  neutral: "😐",
  negative: "😞",
};

export default function Ligacoes() {
  const { role } = useAuth();
  const [days, setDays] = useState(7);
  const [resultadoFilter, setResultadoFilter] = useState("all");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [transcriptDialog, setTranscriptDialog] = useState<CallEntry | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: kpis } = useQuery<CallKpis>({
    queryKey: ["call-kpis", days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_call_kpis" as any, { p_days: days });
      if (error) throw error;
      const row: any = data?.[0] || {};
      return {
        total_ligacoes: Number(row.total_ligacoes) || 0,
        duracao_media: Number(row.duracao_media) || 0,
        taxa_atendimento: Number(row.taxa_atendimento) || 0,
        reunioes_via_ligacao: Number(row.reunioes_via_ligacao) || 0,
      };
    },
  });

  const { data: calls } = useQuery<CallEntry[]>({
    queryKey: ["calls-list", days, resultadoFilter],
    queryFn: async () => {
      const params: any = { p_days: days };
      if (resultadoFilter !== "all") params.p_resultado = resultadoFilter;
      const { data, error } = await supabase.rpc("get_calls_list" as any, params);
      if (error) throw error;
      return (data || []) as CallEntry[];
    },
  });

  function togglePlay(call: CallEntry) {
    if (!call.url_gravacao) return;
    if (playingId === call.atividade_id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(call.url_gravacao);
      audio.play();
      audio.onended = () => setPlayingId(null);
      audioRef.current = audio;
      setPlayingId(call.atividade_id);
    }
  }

  const kpiCards = [
    { label: "Total Ligações", value: kpis?.total_ligacoes ?? 0, icon: Phone, color: "text-primary" },
    { label: "Duração Média", value: formatDuration(kpis?.duracao_media ?? 0), icon: Clock, color: "text-warning" },
    { label: "Taxa Atendimento", value: `${kpis?.taxa_atendimento ?? 0}%`, icon: TrendingUp, color: "text-success" },
    { label: "Reuniões via Ligação", value: kpis?.reunioes_via_ligacao ?? 0, icon: CalendarCheck, color: "text-primary" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Painel de Ligações</h1>
            <p className="text-sm text-muted-foreground">Chamadas VAPI e registros manuais</p>
          </div>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Hoje</SelectItem>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="14">14 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-muted ${kpi.color}`}>
                    <kpi.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className="text-xl font-bold text-foreground">{kpi.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <Select value={resultadoFilter} onValueChange={setResultadoFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Resultado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos resultados</SelectItem>
              <SelectItem value="Atendeu">Atendeu</SelectItem>
              <SelectItem value="Não Atendeu">Não Atendeu</SelectItem>
              <SelectItem value="Conectado">Conectado</SelectItem>
              <SelectItem value="Agendou Reunião">Agendou Reunião</SelectItem>
              <SelectItem value="Recusou">Recusou</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {calls?.length ?? 0} ligações
          </span>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="h-[520px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Sentimento</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(calls || []).map((call) => (
                    <TableRow key={call.atividade_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground text-sm">
                            {call.fantasia || call.razao_social || "—"}
                          </p>
                          {call.para_numero && (
                            <p className="text-xs text-muted-foreground">{call.para_numero}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={RESULTADO_COLORS[call.resultado] || ""}>
                          {call.resultado}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDuration(call.duracao_segundos)}
                      </TableCell>
                      <TableCell>
                        {call.sentimento ? (
                          <span title={call.sentimento}>
                            {SENTIMENTO_EMOJI[call.sentimento] || call.sentimento}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(call.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {call.url_gravacao && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => togglePlay(call)}
                              title="Ouvir gravação"
                            >
                              {playingId === call.atividade_id ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          {call.transcricao && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setTranscriptDialog(call)}
                              title="Ver transcrição"
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!calls || calls.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nenhuma ligação encontrada no período.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Transcript Dialog */}
      <Dialog open={!!transcriptDialog} onOpenChange={() => setTranscriptDialog(null)}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              Transcrição — {transcriptDialog?.fantasia || transcriptDialog?.razao_social || "Lead"}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[400px] pr-4">
            <pre className="text-sm whitespace-pre-wrap text-foreground font-sans">
              {transcriptDialog?.transcricao || "Sem transcrição disponível."}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
