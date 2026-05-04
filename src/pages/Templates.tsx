import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Search, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Template {
  id: string;
  title: string;
  category: string | null;
  language: string;
  storage_path: string;
}

const Templates = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState<Template[]>([]);
  const [q, setQ] = useState("");
  const [lang, setLang] = useState<"all" | "en" | "dz">("all");
  const [cat, setCat] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("templates")
        .select("id,title,category,language,storage_path")
        .eq("is_public", true)
        .order("category")
        .order("title")
        .limit(500);
      if (error) toast.error(error.message);
      setRows((data ?? []) as Template[]);
      setLoading(false);
    })();
  }, []);

  const categories = useMemo(() => {
    const set = new Set(rows.map((r) => r.category ?? "Other"));
    return ["all", ...Array.from(set).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (lang !== "all" && r.language !== lang) return false;
      if (cat !== "all" && (r.category ?? "Other") !== cat) return false;
      if (q && !r.title.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [rows, q, lang, cat]);

  const useTemplate = async (t: Template) => {
    if (!user) { nav("/auth"); return; }
    setBusyId(t.id);
    try {
      // Create a document referencing the public template path. The editor will load it via signed URL fallback or public URL.
      const { data, error } = await supabase
        .from("documents")
        .insert({
          user_id: user.id,
          title: t.title,
          language: t.language,
          storage_path: `template-pdfs/${t.storage_path}`, // prefix marks it as template-sourced
        })
        .select("id")
        .single();
      if (error) throw error;
      nav(`/editor/${data.id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to open template");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Official Bhutanese Government Forms</h1>
            <p className="mt-2 text-muted-foreground">{rows.length} templates · English & Dzongkha · Free to open</p>
          </div>
          <Button variant="soft" onClick={() => nav("/editor")}><Upload className="h-4 w-4" /> Upload your own PDF</Button>
        </div>

        <div className="mt-6 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search forms…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Tabs value={lang} onValueChange={(v) => setLang(v as "all" | "en" | "dz")}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="en">English</TabsTrigger>
              <TabsTrigger value="dz">Dzongkha</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition ${
                cat === c ? "border-primary bg-primary/15 text-foreground" : "border-border/70 text-muted-foreground hover:text-foreground"
              }`}
            >
              {c === "all" ? "All ministries" : c}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid place-items-center py-24 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t) => (
              <div key={t.id} className="rounded-xl border border-border/70 bg-card/60 p-4 hover:border-primary/40 transition">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-secondary grid place-items-center shrink-0">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-sm leading-snug line-clamp-2">{t.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{t.category}</p>
                    <div className="mt-2 flex gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">{t.language === "dz" ? "Dzongkha" : "English"}</Badge>
                    </div>
                  </div>
                </div>
                <Button
                  variant="hero" size="sm" className="w-full mt-3"
                  onClick={() => useTemplate(t)} disabled={busyId === t.id}
                >
                  {busyId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Use template"}
                </Button>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full py-16 text-center text-muted-foreground">No forms match.</div>
            )}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
};

export default Templates;
