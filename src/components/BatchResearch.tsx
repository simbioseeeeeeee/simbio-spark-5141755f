import { useState, useRef, useCallback } from "react";
import { Lead, calculateScore } from "@/types/lead";
import { updateLead } from "@/store/leads-store";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Loader2, CheckCircle2, XCircle, Pause } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  cidade?: string;
  onComplete: () => void;
}



interface BatchState {
  running: boolean;
  total: number;
  done: number;
  success: number;
  errors: number;
  currentLead: string;
}

export function BatchResearch({ cidade, onComplete }: Props) {
  const [batch, setBatch] = useState<BatchState | null>(null);
  const cancelRef = useRef(false);

  const runBatch = useCallback(async () => {
    cancelRef.current = false;

    // Fetch unresearched leads for this city
    let query = supabase
      .from("leads")
      .select("*")
      .eq("pesquisa_realizada", false)
      .order("created_at", { ascending: true })
      .limit(500);

    if (cidade) {
      query = query.eq("cidade", cidade);
    }

    const { data: leads, error } = await query;

    if (error) {
      toast({ title: "Erro ao buscar leads", description: error.message, variant: "destructive" });
      return;
    }

    if (!leads || leads.length === 0) {
      toast({ title: "Nenhum lead para pesquisar", description: "Todos os leads desta cidade já foram pesquisados." });
      return;
    }

    const total = leads.length;
    setBatch({ running: true, total, done: 0, success: 0, errors: 0, currentLead: "" });

    let success = 0;
    let errors = 0;

    for (let i = 0; i < total; i++) {
      if (cancelRef.current) break;

      const lead = leads[i];
      const name = lead.fantasia || lead.razao_social || "Lead";

      setBatch((prev) => prev ? { ...prev, done: i, currentLead: name } : null);

      try {
        const { data, error: fnErr } = await supabase.functions.invoke("auto-research", {
          body: {
            razao_social: lead.razao_social,
            fantasia: lead.fantasia,
            cidade: lead.cidade,
            uf: lead.uf,
            cnae_descricao: lead.cnae_descricao,
          },
        });

        if (fnErr || !data?.success) {
          errors++;
          setBatch((prev) => prev ? { ...prev, errors } : null);
          continue;
        }

        const result = data.data;
        const score = calculateScore({
          possui_site: result.possui_site,
          instagram_ativo: result.instagram_ativo,
          faz_anuncios: result.faz_anuncios,
          whatsapp_automacao: result.whatsapp_automacao,
        });

        await supabase
          .from("leads")
          .update({
            possui_site: result.possui_site,
            url_site: result.url_site || "",
            instagram_ativo: result.instagram_ativo,
            url_instagram: result.url_instagram || "",
            faz_anuncios: result.faz_anuncios,
            whatsapp_automacao: result.whatsapp_automacao,
            observacoes_sdr: result.observacoes_sdr || "",
            lead_score: score,
            pesquisa_realizada: true,
          })
          .eq("id", lead.id);

        success++;
        setBatch((prev) => prev ? { ...prev, success } : null);

        // Insert research activity
        await supabase.from("atividades").insert({
          lead_id: lead.id,
          tipo_atividade: "Pesquisa",
          resultado: "Pesquisa Concluída",
          nota: `Pesquisa IA em lote — Score: ${score}`,
        });
      } catch {
        errors++;
        setBatch((prev) => prev ? { ...prev, errors } : null);
      }

      // Small delay to avoid rate limiting
      if (i < total - 1 && !cancelRef.current) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    const finalDone = cancelRef.current ? batch?.done || 0 : total;
    setBatch((prev) => prev ? { ...prev, running: false, done: finalDone } : null);

    toast({
      title: cancelRef.current ? "⏸ Pesquisa pausada" : "✅ Pesquisa em lote concluída!",
      description: `${success} sucesso, ${errors} erros de ${total} leads.`,
    });

    onComplete();
  }, [cidade, onComplete]);

  const handleCancel = () => {
    cancelRef.current = true;
  };

  const pct = batch ? Math.round((batch.done / Math.max(batch.total, 1)) * 100) : 0;

  if (!batch) {
    return (
      <Button variant="outline" size="sm" className="gap-1.5" onClick={runBatch}>
        <Sparkles className="h-3.5 w-3.5" />
        Pesquisar Todos (IA)
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          {batch.running ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-success" />
          )}
          <span>
            {batch.running
              ? `Pesquisando ${batch.done + 1} de ${batch.total}...`
              : `Concluído — ${batch.done} de ${batch.total}`}
          </span>
        </div>
        {batch.running && (
          <Button variant="ghost" size="sm" onClick={handleCancel} className="gap-1 h-7 text-xs">
            <Pause className="h-3 w-3" /> Pausar
          </Button>
        )}
        {!batch.running && (
          <Button variant="ghost" size="sm" onClick={() => setBatch(null)} className="h-7 text-xs">
            Fechar
          </Button>
        )}
      </div>

      <Progress value={pct} className="h-2" />

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-success" /> {batch.success} sucesso
        </span>
        {batch.errors > 0 && (
          <span className="flex items-center gap-1">
            <XCircle className="h-3 w-3 text-destructive" /> {batch.errors} erros
          </span>
        )}
        {batch.running && batch.currentLead && (
          <span className="truncate max-w-[200px]">→ {batch.currentLead}</span>
        )}
      </div>
    </div>
  );
}
