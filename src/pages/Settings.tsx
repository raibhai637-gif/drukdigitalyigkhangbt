import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload } from "lucide-react";

const Settings = () => {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name,avatar_url").eq("id", user.id).maybeSingle().then(({ data }) => {
      setName(data?.display_name ?? "");
      setAvatarUrl(data?.avatar_url ?? null);
    });
  }, [user]);

  const saveProfile = async () => {
    const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", user!.id);
    if (error) toast.error(error.message); else toast.success("Profile updated");
  };
  const changePw = async () => {
    if (pw.length < 6) return toast.error("Password must be at least 6 characters");
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) toast.error(error.message); else { toast.success("Password changed"); setPw(""); }
  };
  const onAvatar = async (file: File) => {
    const path = `${user!.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: true });
    if (error) return toast.error(error.message);
    const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    await supabase.from("profiles").update({ avatar_url: url }).eq("id", user!.id);
    setAvatarUrl(url); toast.success("Avatar updated");
  };

  return (
    <div className="min-h-screen flex flex-col"><SiteHeader />
      <main className="flex-1 container py-10 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>

        <section className="mt-8 rounded-2xl border border-border/70 p-6">
          <h2 className="text-lg font-semibold">Profile</h2>
          <div className="mt-4 flex items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-secondary overflow-hidden grid place-items-center">
              {avatarUrl ? <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" /> : <span className="text-2xl text-muted-foreground">{(name || user?.email || "?")[0]?.toUpperCase()}</span>}
            </div>
            <Button variant="soft" size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Upload photo</Button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onAvatar(e.target.files[0])} />
          </div>
          <div className="mt-4 space-y-3">
            <div><Label>Display name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>Email</Label><Input value={user?.email ?? ""} disabled /></div>
            <Button variant="hero" onClick={saveProfile}>Save profile</Button>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-border/70 p-6">
          <h2 className="text-lg font-semibold">Change password</h2>
          <div className="mt-4 space-y-3 max-w-sm">
            <div><Label>New password</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <Button variant="hero" onClick={changePw}>Update password</Button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Settings;