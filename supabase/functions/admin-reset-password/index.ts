import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...CORS, "Content-Type": "application/json" } });

    const { user_id, request_id } = await req.json();
    if (!user_id) return new Response(JSON.stringify({ error: "user_id required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

    const { error } = await admin.auth.admin.updateUserById(user_id, { password: "dorjijamtse" });
    if (error) throw error;
    await admin.from("profiles").update({ must_change_password: true }).eq("id", user_id);
    if (request_id) {
      await admin.from("password_reset_requests").update({ status: "done", resolved_at: new Date().toISOString(), resolved_by: userData.user.id }).eq("id", request_id);
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});