const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const escape = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    // Require valid JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: ud } = await userClient.auth.getUser();
    if (!ud.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const body = await req.json();
    const { method, amount_usdt, credits, tx_hash } = body ?? {};
    // Trust caller identity from JWT, not body
    const user_email = ud.user.email ?? "";
    const user_id = ud.user.id;
    // Basic shape validation
    if (!["bob_bank", "usdt_trc20"].includes(String(method))) {
      return new Response(JSON.stringify({ error: "invalid method" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (typeof amount_usdt !== "number" || amount_usdt <= 0 || amount_usdt > 100000) {
      return new Response(JSON.stringify({ error: "invalid amount" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (typeof credits !== "number" || credits <= 0 || credits > 100000) {
      return new Response(JSON.stringify({ error: "invalid credits" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const subject = `New payment submission: ${credits} credits (${method === "bob_bank" ? "BoB" : "USDT"})`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:20px;color:#111">
        <h2 style="margin:0 0 12px">New payment awaiting verification</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#666">Method</td><td><strong>${escape(method === "bob_bank" ? "Bank of Bhutan" : "USDT (TRC20)")}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#666">Amount</td><td><strong>${escape(amount_usdt)} ${method === "bob_bank" ? "USDT (~" + (Number(amount_usdt) * 100) + " BTN)" : "USDT"}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#666">Credits</td><td><strong>${escape(credits)}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#666">User</td><td>${escape(user_email)} <span style="color:#999">(${escape(user_id)})</span></td></tr>
          <tr><td style="padding:6px 0;color:#666">TX / Ref</td><td style="word-break:break-all"><code>${escape(tx_hash)}</code></td></tr>
        </table>
        <p style="margin-top:20px"><a href="https://drukdigitalyigkhangbt.lovable.app/admin" style="background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open admin panel</a></p>
      </div>`;

    const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: "Druk Digital Yigkhang <onboarding@resend.dev>",
        to: ["raibhai637@gmail.com"],
        subject,
        html,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(data)}`);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("notify-admin-payment error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});