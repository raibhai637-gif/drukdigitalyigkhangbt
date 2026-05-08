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

    // Fetch all auth users (paginated)
    const all: { id: string; email: string | null; created_at: string }[] = [];
    let page = 1;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      for (const u of data.users) all.push({ id: u.id, email: u.email ?? null, created_at: u.created_at });
      if (data.users.length < 200) break;
      page++;
      if (page > 25) break;
    }

    // join with profiles + credits
    const ids = all.map((u) => u.id);
    const { data: profs } = await admin.from("profiles").select("id,display_name,is_suspended,avatar_url,must_change_password").in("id", ids);
    const { data: creds } = await admin.from("credits").select("user_id,balance").in("user_id", ids);
    const pMap = new Map((profs ?? []).map((p) => [p.id, p]));
    const cMap = new Map((creds ?? []).map((c) => [c.user_id, c.balance]));
    const users = all.map((u) => ({
      id: u.id, email: u.email, created_at: u.created_at,
      display_name: pMap.get(u.id)?.display_name ?? null,
      is_suspended: pMap.get(u.id)?.is_suspended ?? false,
      must_change_password: pMap.get(u.id)?.must_change_password ?? false,
      credits: cMap.get(u.id) ?? 0,
    }));
    return new Response(JSON.stringify({ users }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});