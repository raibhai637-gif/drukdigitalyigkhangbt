import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X, Ban, Trash2, RotateCcw, Users, CreditCard } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface Payment {
  id: string; user_id: string; amount_usdt: number; credits: number;
  tx_hash: string | null; status: string; created_at: string;
  method?: string | null; wallet_address?: string | null;
}

interface UserRow {
  id: string;
  display_name: string | null;
  is_suspended: boolean;
  created_at: string;
}

const Admin = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Payment[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  const load = async () => {
    const { data, error } = await supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) toast.error(error.message); else setRows(data as Payment[]);
    const { data: us } = await supabase.from("profiles").select("id,display_name,is_suspended,created_at").order("created_at", { ascending: false });
    setUsers((us ?? []) as UserRow[]);
    setPendingCount(((data ?? []) as Payment[]).filter((p) => p.status === "pending").length);
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

  const toggleSuspend = async (u: UserRow) => {
    setBusy(u.id);
    const { error } = await supabase.from("profiles").update({ is_suspended: !u.is_suspended }).eq("id", u.id);
    setBusy(null);
    if (error) toast.error(error.message);
    else { toast.success(u.is_suspended ? "User unsuspended" : "User suspended"); load(); }
  };

  const removeUser = async (u: UserRow) => {
    if (!confirm(`Permanently delete this user? This cannot be undone.`)) return;
    setBusy(u.id);
    const { error } = await supabase.functions.invoke("admin-delete-user", { body: { user_id: u.id } });
    setBusy(null);
    if (error) toast.error(error.message);
    else { toast.success("User deleted"); load(); }
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
        <h1 className="text-3xl font-semibold tracking-tight">Admin panel</h1>
        <p className="mt-1 text-muted-foreground">Manage payments and users.</p>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border/70 p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Users</div>
            <div className="text-2xl font-semibold mt-1">{users.length}</div>
          </div>
          <div className="rounded-xl border border-border/70 p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Ban className="h-3.5 w-3.5" /> Suspended</div>
            <div className="text-2xl font-semibold mt-1">{users.filter((u) => u.is_suspended).length}</div>
          </div>
          <div className="rounded-xl border border-border/70 p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Payments</div>
            <div className="text-2xl font-semibold mt-1">{rows.length}</div>
          </div>
          <div className="rounded-xl border border-border/70 p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Pending</div>
            <div className="text-2xl font-semibold mt-1">{pendingCount}</div>
          </div>
        </div>

        <Tabs defaultValue="payments" className="mt-8">
          <TabsList>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
          </TabsList>

          <TabsContent value="payments">
        <div className="mt-4 rounded-xl border border-border/70 overflow-x-auto">
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
          </TabsContent>

          <TabsContent value="users">
            <div className="mt-4 rounded-xl border border-border/70 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50"><tr>
                  <th className="text-left p-3">Joined</th>
                  <th className="text-left p-3">User ID</th>
                  <th className="text-left p-3">Display name</th>
                  <th className="text-left p-3">Status</th>
                  <th className="p-3"></th>
                </tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-border/60">
                      <td className="p-3 text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="p-3 font-mono text-xs">{u.id.slice(0, 8)}…</td>
                      <td className="p-3">{u.display_name ?? "—"}</td>
                      <td className="p-3">
                        <Badge variant={u.is_suspended ? "destructive" : "secondary"}>
                          {u.is_suspended ? "Suspended" : "Active"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => toggleSuspend(u)} disabled={busy === u.id}>
                            {u.is_suspended ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                            <span className="ml-1 hidden sm:inline">{u.is_suspended ? "Unsuspend" : "Suspend"}</span>
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => removeUser(u)} disabled={busy === u.id} className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                            <span className="ml-1 hidden sm:inline">Delete</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No users yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
