import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const ChangePassword = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [must, setMust] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) { nav("/auth"); return; }
    supabase.from("profiles").select("must_change_password").eq("id", user.id).maybeSingle()
      .then(({ data }) => setMust(!!data?.must_change_password));
  }, [user, nav]);

  const submit = async () => {
    if (pw.length < 6) return toast.error("Password must be at least 6 characters");
    if (pw !== pw2) return toast.error("Passwords do not match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { setBusy(false); return toast.error(error.message); }
    await supabase.from("profiles").update({ must_change_password: false }).eq("id", user!.id);
    setBusy(false);
    toast.success("Password updated");
    nav("/templates");
  };

  return (
    <div className="min-h-screen flex flex-col"><SiteHeader />
      <main className="flex-1 grid place-items-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card/70 p-6 sm:p-8 shadow-card">
          <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
          {must && <p className="mt-2 text-sm text-muted-foreground">Your password was reset by an administrator. Please choose a new one to continue.</p>}
          <div className="mt-5 space-y-3">
            <div><Label>New password</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <div><Label>Confirm password</Label><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
            <Button variant="hero" className="w-full" onClick={submit} disabled={busy}>Update password</Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ChangePassword;