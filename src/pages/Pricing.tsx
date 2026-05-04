import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, Coins, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Pack { credits: number; usdt: number; popular?: boolean; }
const PACKS: Pack[] = [
  { credits: 5, usdt: 2 },
  { credits: 20, usdt: 7, popular: true },
  { credits: 60, usdt: 18 },
  { credits: 200, usdt: 50 },
];

const Pricing = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const [wallet, setWallet] = useState<string>("");
  const [active, setActive] = useState<Pack | null>(null);
  const [tx, setTx] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("app_settings").select("value").eq("key", "usdt_trc20_wallet").maybeSingle()
      .then(({ data }) => setWallet(data?.value ?? ""));
  }, []);

  const buy = async () => {
    if (!user) { nav("/auth"); return; }
    if (!active) return;
    if (!tx.trim()) { toast.error("Paste your TRC20 transaction hash"); return; }
    setBusy(true);
    const { error } = await supabase.from("payments").insert({
      user_id: user.id, amount_usdt: active.usdt, credits: active.credits,
      wallet_address: wallet, tx_hash: tx.trim(), status: "pending",
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Payment submitted — credits will appear after verification.");
    setActive(null); setTx("");
  };

  const copy = async () => { await navigator.clipboard.writeText(wallet); toast.success("Wallet copied"); };

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-12">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">Simple, fair pricing</h1>
          <p className="mt-3 text-muted-foreground">1 credit = 1 finalized PDF download. Pay with USDT (TRC20). No subscription.</p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PACKS.map((p) => (
            <div key={p.credits} className={`relative rounded-2xl border p-6 bg-card/60 ${p.popular ? "border-primary/60 shadow-glow" : "border-border/70"}`}>
              {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-brand px-3 py-1 text-xs text-primary-foreground">Best value</span>}
              <div className="flex items-center gap-2 text-muted-foreground"><Coins className="h-4 w-4 text-primary" /><span className="text-sm">Credits</span></div>
              <p className="mt-1 text-4xl font-semibold">{p.credits}</p>
              <p className="mt-1 text-muted-foreground text-sm">{p.usdt} USDT</p>
              <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><Check className="h-4 w-4 text-success" /> {p.credits} PDF downloads</li>
                <li className="flex gap-2"><Check className="h-4 w-4 text-success" /> Templates & stamps included</li>
                <li className="flex gap-2"><Check className="h-4 w-4 text-success" /> Never expires</li>
              </ul>
              <Button variant={p.popular ? "hero" : "soft"} className="w-full mt-6" onClick={() => setActive(p)}>Buy</Button>
            </div>
          ))}
        </div>

        <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Pay {active?.usdt} USDT for {active?.credits} credits</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-secondary/40 p-4">
                <p className="text-xs text-muted-foreground">Send <strong>exactly {active?.usdt} USDT (TRC20)</strong> to:</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 break-all text-xs bg-background rounded px-2 py-2 border border-border">{wallet || "…"}</code>
                  <Button variant="ghost" size="icon" onClick={copy}><Copy className="h-4 w-4" /></Button>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Network: <strong>TRON (TRC20)</strong>. Sending on the wrong network will lose funds.</p>
              </div>
              <div>
                <Label>Transaction hash (TXID)</Label>
                <Textarea rows={2} value={tx} onChange={(e) => setTx(e.target.value)} placeholder="e.g. 4f7e1c…" />
              </div>
              <Button variant="hero" className="w-full" onClick={buy} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit payment for verification"}
              </Button>
              <p className="text-xs text-muted-foreground">Credits are added after admin verifies the transaction (usually within hours).</p>
            </div>
          </DialogContent>
        </Dialog>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Pricing;
