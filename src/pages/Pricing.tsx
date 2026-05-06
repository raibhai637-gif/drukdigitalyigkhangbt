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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Coins, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Pack { credits: number; usdt: number; popular?: boolean; }
const PACKS: Pack[] = [
  { credits: 10, usdt: 2, popular: true },
  { credits: 30, usdt: 5 },
  { credits: 75, usdt: 12 },
  { credits: 200, usdt: 30 },
];

const Pricing = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const [wallet, setWallet] = useState<string>("");
  const [bobAccount, setBobAccount] = useState<string>("");
  const [bobName, setBobName] = useState<string>("");
  const [contactEmail, setContactEmail] = useState<string>("");
  const [active, setActive] = useState<Pack | null>(null);
  const [tx, setTx] = useState("");
  const [method, setMethod] = useState<"usdt_trc20" | "bob_bank">("usdt_trc20");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("app_settings").select("key,value")
      .in("key", ["usdt_trc20_wallet", "bob_account_number", "bob_account_name", "contact_email"])
      .then(({ data }) => {
        for (const row of data ?? []) {
          if (row.key === "usdt_trc20_wallet") setWallet(row.value);
          if (row.key === "bob_account_number") setBobAccount(row.value);
          if (row.key === "bob_account_name") setBobName(row.value);
          if (row.key === "contact_email") setContactEmail(row.value);
        }
      });
  }, []);

  const buy = async () => {
    if (!user) { nav("/auth"); return; }
    if (!active) return;
    if (!tx.trim()) {
      toast.error(method === "usdt_trc20" ? "Paste your TRC20 transaction hash" : "Paste your BoB transaction reference");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("payments").insert({
      user_id: user.id, amount_usdt: active.usdt, credits: active.credits,
      wallet_address: method === "usdt_trc20" ? wallet : bobAccount,
      tx_hash: tx.trim(), status: "pending", method,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    // Notify admin (best-effort, non-blocking)
    supabase.functions.invoke("notify-admin-payment", {
      body: {
        method,
        amount_usdt: active.usdt,
        credits: active.credits,
        tx_hash: tx.trim(),
        user_email: user.email,
        user_id: user.id,
      },
    }).catch(() => {});
    toast.success("Payment submitted — credits will appear after verification.");
    setActive(null); setTx(""); setMethod("usdt_trc20");
  };

  const copyText = async (t: string, label: string) => { await navigator.clipboard.writeText(t); toast.success(`${label} copied`); };

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

        {contactEmail && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Any problem? Contact <a href={`mailto:${contactEmail}`} className="text-primary underline">{contactEmail}</a>
          </p>
        )}

        <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Buy {active?.credits} credits ({active?.usdt} USDT)</DialogTitle></DialogHeader>
            <Tabs value={method} onValueChange={(v) => setMethod(v as "usdt_trc20" | "bob_bank")} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="usdt_trc20">USDT (TRC20)</TabsTrigger>
                <TabsTrigger value="bob_bank">Bank of Bhutan</TabsTrigger>
              </TabsList>
              <TabsContent value="usdt_trc20" className="space-y-4">
                <div className="rounded-lg border border-border bg-secondary/40 p-4">
                  <p className="text-xs text-muted-foreground">Send <strong>exactly {active?.usdt} USDT (TRC20)</strong> to:</p>
                  <div className="mt-2 flex items-center justify-between gap-2 rounded bg-background border border-border px-3 py-2">
                    <span className="text-xs text-muted-foreground">Wallet address hidden for security</span>
                    <Button variant="soft" size="sm" onClick={() => copyText(wallet, "Wallet address")} disabled={!wallet}>
                      <Copy className="h-4 w-4" /> Copy address
                    </Button>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Network: <strong>TRON (TRC20)</strong>. Sending on the wrong network will lose funds.</p>
                </div>
                <div>
                  <Label>Transaction hash (TXID)</Label>
                  <Textarea rows={2} value={tx} onChange={(e) => setTx(e.target.value)} placeholder="e.g. 4f7e1c…" />
                </div>
              </TabsContent>
              <TabsContent value="bob_bank" className="space-y-4">
                <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Transfer <strong>{active ? active.usdt * 100 : ""} BTN</strong> (≈ {active?.usdt} USDT) to:
                  </p>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Bank</p>
                    <p className="text-sm font-medium">Bank of Bhutan (BoB)</p>
                  </div>
                  {bobName && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Account name</p>
                      <p className="text-sm font-medium">{bobName}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Account number</p>
                    <div className="mt-1 flex items-center justify-between gap-2 rounded bg-background border border-border px-3 py-2">
                      <span className="text-xs text-muted-foreground">Account number hidden for security</span>
                      <Button variant="soft" size="sm" onClick={() => copyText(bobAccount, "Account number")} disabled={!bobAccount}>
                        <Copy className="h-4 w-4" /> Copy number
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">After transfer, paste the BoB transaction reference / journal number below for verification.</p>
                </div>
                <div>
                  <Label>BoB transaction reference</Label>
                  <Textarea rows={2} value={tx} onChange={(e) => setTx(e.target.value)} placeholder="e.g. mBoB journal no. or TXN ref" />
                </div>
              </TabsContent>
            </Tabs>
            <Button variant="hero" className="w-full mt-2" onClick={buy} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit payment for verification"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Credits are added after admin verifies the transaction (usually within hours).
              {contactEmail && <> Need help? <a href={`mailto:${contactEmail}`} className="text-primary underline">{contactEmail}</a></>}
            </p>
          </DialogContent>
        </Dialog>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Pricing;
