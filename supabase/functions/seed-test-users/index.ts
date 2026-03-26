import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const testUsers = [
      { email: "sdr@simbiose.com", password: "test1234", role: "sdr", nome: "Larissa" },
      { email: "closer@simbiose.com", password: "test1234", role: "closer", nome: "Junior" },
      { email: "manager@simbiose.com", password: "test1234", role: "manager", nome: "Cleiane" },
      { email: "guilherme@simbiosedigital.com", password: "Simbiose2026!", role: "manager", nome: "Guilherme" },
    ];

    const results = [];

    for (const u of testUsers) {
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const existing = listData?.users?.find((eu: any) => eu.email === u.email);

      let userId: string;
      if (existing) {
        userId = existing.id;
      } else {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true,
        });
        if (error) {
          results.push({ email: u.email, error: error.message });
          continue;
        }
        userId = data.user.id;
      }

      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);

      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: u.role, nome: u.nome });

      if (roleErr) {
        results.push({ email: u.email, error: roleErr.message });
        continue;
      }

      results.push({ email: u.email, role: u.role, nome: u.nome, status: "ok" });
    }

    return new Response(
      JSON.stringify({ success: true, users: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
