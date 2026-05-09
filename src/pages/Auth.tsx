import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import HCaptcha from "@hcaptcha/react-hcaptcha";

// hCaptcha public TEST key — always passes. Replace with your real site key in production.
const HCAPTCHA_SITE_KEY = "10000000-ffff-ffff-ffff-000000000001";

const Auth = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const captchaRef = useRef<HCaptcha>(null);

  useEffect(() => { if (user) nav("/templates", { replace: true }); }, [user, nav]);

  const signIn = async () => {
    if (!captchaToken) return toast.error("Please complete the captcha");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    captchaRef.current?.resetCaptcha(); setCaptchaToken(null);
    if (error) toast.error(error.message);
    else toast.success("Welcome back!");
  };

  const signUp = async () => {
    if (!captchaToken) return toast.error("Please complete the captcha");
    setLoading(true);
    const redirectUrl = `${window.location.origin}/templates`;
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: redirectUrl, data: { display_name: name || email.split("@")[0] } },
    });
    setLoading(false);
    captchaRef.current?.resetCaptcha(); setCaptchaToken(null);
    if (error) toast.error(error.message);
    else toast.success("Account created. Check your email to confirm.");
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/templates` });
    if (result.error) toast.error(result.error.message ?? "Google sign-in failed");
  };

  const submitForgot = async () => {
    if (!forgotEmail) return toast.error("Enter your email");
    // Submit with user_id NULL — admin will resolve which account this email maps to.
    const { error } = await supabase.from("password_reset_requests").insert({
      user_id: null,
      email: forgotEmail,
    });
    if (error) toast.error(error.message);
    else { toast.success("Reset request sent. An admin will reset your password and you'll be required to set a new one on your next sign-in."); setForgotOpen(false); setForgotEmail(""); }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 grid place-items-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card/70 p-6 sm:p-8 shadow-card">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome to Druk Digital Yigkhang</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in or create an account. New users get 1 free credit.</p>

          <Tabs defaultValue="signin" className="mt-6">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="space-y-3 mt-4">
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
              <div className="flex justify-center"><HCaptcha ref={captchaRef} sitekey={HCAPTCHA_SITE_KEY} onVerify={(t) => setCaptchaToken(t)} onExpire={() => setCaptchaToken(null)} /></div>
              <Button variant="hero" className="w-full" onClick={signIn} disabled={loading}>Sign in</Button>
              <button type="button" onClick={() => setForgotOpen(true)} className="text-xs text-muted-foreground hover:text-foreground underline w-full text-center">
                Forgot password? Request admin reset
              </button>
            </TabsContent>

            <TabsContent value="signup" className="space-y-3 mt-4">
              <div><Label>Display name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
              <div className="flex justify-center"><HCaptcha ref={captchaRef} sitekey={HCAPTCHA_SITE_KEY} onVerify={(t) => setCaptchaToken(t)} onExpire={() => setCaptchaToken(null)} /></div>
              <Button variant="hero" className="w-full" onClick={signUp} disabled={loading}>Create account</Button>
            </TabsContent>
          </Tabs>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" />OR<div className="h-px flex-1 bg-border" /></div>
          <Button variant="soft" className="w-full" onClick={google}>Continue with Google</Button>

          {forgotOpen && (
            <div className="mt-5 rounded-lg border border-border/70 bg-secondary/40 p-4 space-y-3">
              <p className="text-sm font-medium">Request password reset</p>
              <p className="text-xs text-muted-foreground">An admin will reset your password to a temporary value. You'll be prompted to set a new one immediately after sign-in.</p>
              <Input type="email" placeholder="Your account email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
              <div className="flex gap-2">
                <Button variant="hero" size="sm" onClick={submitForgot}>Send request</Button>
                <Button variant="ghost" size="sm" onClick={() => setForgotOpen(false)}>Cancel</Button>
              </div>
            </div>
          )}

          <p className="mt-5 text-xs text-muted-foreground text-center">
            <Link to="/" className="hover:text-foreground">← Back to home</Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default Auth;
