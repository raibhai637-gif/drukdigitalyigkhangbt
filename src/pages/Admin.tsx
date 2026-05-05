import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";

interface Payment {
  id: string; user_id: string; amount_usdt: number; credits: number;
  tx_hash: string | null; status: string; created_at: string;
  method?: string | null; wallet_address?: string | null;
}

const Admin = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Payment[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  const load = async () => {
    const { data, error } = await supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) toast.error(error.message); else setRows(data as Payment[]);
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const decide = async (p: Payment, approve: boolean) => {
    setBusy(p.id);
    if (approve) {
      const { data: cur } = await supabase.from("credits").select("balance").eq("user_id", p.user_id).maybeSingle();
      const newBal = (cur?.balance ?? 0) + p.credits;
      await supabase.from("credits").upsert({ user_id: p.user_id, balance: newBal, updated_at: new Date().toISOString() });
      await supabase.from("credit_ledger").insert({ user_id: p.user_id, delta: p.credits, kind: "purchase", reference_id: p.id, note: `${p.method === "bob_bank" ? "BoB" : "USDT"} ${p.amount_usdt}` });
      await supabase.from("payments").update({ status: "confirmed", confirmed_at: new Date().toISOString(), confirmed_by: user!.id }).eq("id", p.id);
    } else {
      await supabase.from("payments").update({ status: "rejected", confirmed_at: new Date().toISOString(), confirmed_by: user!.id }).eq("id", p.id);
    }
    setBusy(null); toast.success(approve ? "Credits added" : "Rejected"); load();
  };

  if (isAdmin === null) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col"><SiteHeader />
        <main className="flex-1 grid place-items-center text-center px-4">
          <div><h1 className="text-2xl font-semibold">Admins only</h1>
          <p className="mt-2 text-muted-foreground">This area is restricted.</p>
          <Button variant="soft" className="mt-4" onClick={() => nav("/")}>Back home</Button></div>
        </main></div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col"><SiteHeader />
      <main className="flex-1 container py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Admin · Payments</h1>
        <p className="mt-1 text-muted-foreground">Approve verified USDT (TRC20) transactions to credit users.</p>
        <div className="mt-6 rounded-xl border border-border/70 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50"><tr>
              <th className="text-left p-3">Date</th><th className="text-left p-3">User</th>
              <th className="text-left p-3">Method</th><th className="text-left p-3">Amount</th><th className="text-left p-3">Credits</th>
              <th className="text-left p-3">TX Hash</th><th className="text-left p-3">Status</th><th className="p-3"></th>
            </tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-border/60">
                  <td className="p-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</td>
                  <td className="p-3 font-mono text-xs">{p.user_id.slice(0, 8)}…</td>
                  <td className="p-3 text-xs"><Badge variant="secondary">{p.method === "bob_bank" ? "BoB" : "USDT"}</Badge></td>
                  <td className="p-3">{p.amount_usdt} USDT</td>
                  <td className="p-3">{p.credits}</td>
                  <td className="p-3 font-mono text-xs break-all max-w-[200px]">{p.tx_hash}</td>
                  <td className="p-3"><Badge variant={p.status === "confirmed" ? "default" : p.status === "rejected" ? "destructive" : "secondary"}>{p.status}</Badge></td>
                  <td className="p-3">
                    {p.status === "pending" && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="hero" onClick={() => decide(p, true)} disabled={busy === p.id}><Check className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => decide(p, false)} disabled={busy === p.id}><X className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No payments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

export default Admin;
