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

    // Z-API sends various event types; we care about message events
    const event = body.event || body.type || "message";
    const isInbound = body.isFromMe === false || body.fromMe === false;
    const leadPhone = body.phone || body.from || body.chatId?.replace("@c.us", "") || "";
    const messageText = body.text?.message || body.body || body.caption || "";

    if (!leadPhone) {
      return new Response(JSON.stringify({ ok: false, error: "no phone" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find lead by phone (celular1 or telefone1)
    const normalized = leadPhone.replace(/\D/g, "").slice(-11);
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

    // Insert activity
    const insertData: Record<string, unknown> = {
      lead_id: lead.id,
      tipo_atividade: isInbound ? "whatsapp_in" : "WhatsApp",
      resultado: isInbound ? "Respondeu" : "Enviado",
      nota: messageText ? messageText.slice(0, 500) : `Evento Z-API: ${event}`,
    };
    if (lead.sdr_id) insertData.sdr_id = lead.sdr_id;
    if (lead.owner_id) insertData.owner_id = lead.owner_id;

    const { error } = await supabase.from("atividades").insert(insertData);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, lead_id: lead.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("webhook-zapi error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
