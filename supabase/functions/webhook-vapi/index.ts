import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // VAPI webhook payload structure
    const message = body.message || body;
    const call = message.call || message;
    const eventType = message.type || body.type || "call";

    // We primarily handle end-of-call reports
    if (eventType !== "end-of-call-report" && eventType !== "call.ended" && eventType !== "call") {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerPhone = call.customer?.number || call.to || call.phoneNumber || "";
    const fromPhone = call.assistantPhone || call.from || "";
    const duration = call.duration || call.endedReason ? Math.round((call.duration || 0)) : null;
    const recordingUrl = call.recordingUrl || call.artifact?.recordingUrl || "";
    const transcript = call.transcript || call.artifact?.transcript || "";
    const summary = call.summary || call.artifact?.summary || "";
    const sentiment = message.analysis?.sentiment || call.analysis?.sentiment || null;
    const outcome = call.endedReason || message.endedReason || "completed";

    if (!customerPhone) {
      return new Response(JSON.stringify({ ok: false, error: "no customer phone" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find lead
    const normalized = customerPhone.replace(/\D/g, "").slice(-11);
    const pattern = `%${normalized.slice(-8)}%`;

    const { data: lead } = await supabase
      .from("leads")
      .select("id, sdr_id, owner_id")
      .or(`celular1.like.${pattern},telefone1.like.${pattern}`)
      .limit(1)
      .maybeSingle();

    if (!lead) {
      return new Response(JSON.stringify({ ok: false, error: "lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine resultado based on call outcome
    let resultado = "Não Atendeu";
    if (outcome === "completed" || outcome === "assistant-ended" || outcome === "customer-ended") {
      resultado = duration && duration > 30 ? "Atendeu" : "Não Atendeu";
    }

    const insertData: Record<string, unknown> = {
      lead_id: lead.id,
      tipo_atividade: "Ligação",
      resultado,
      nota: summary || `Chamada VAPI - ${outcome}`,
      duracao_segundos: duration,
      url_gravacao: recordingUrl || null,
      transcricao: typeof transcript === "string" ? transcript.slice(0, 10000) : JSON.stringify(transcript).slice(0, 10000),
      sentimento: sentiment,
      de_numero: fromPhone || null,
      para_numero: customerPhone || null,
    };
    if (lead.sdr_id) insertData.sdr_id = lead.sdr_id;
    if (lead.owner_id) insertData.owner_id = lead.owner_id;

    const { error } = await supabase.from("atividades").insert(insertData);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, lead_id: lead.id, resultado }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("webhook-vapi error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
