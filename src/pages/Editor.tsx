import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import {
  Type, CheckSquare, PenLine, Stamp as StampIcon, Upload, Save, Download,
  Trash2, ZoomIn, ZoomOut, Loader2, ChevronLeft, Settings2,
} from "lucide-react";
import { pdfjsLib, MM_TO_PT, type Overlay } from "@/lib/pdf";
import bhutanStamp from "@/assets/bhutan-legal-stamp.jpeg";
import { SignaturePad } from "@/components/editor/SignaturePad";
import { exportPdf } from "@/lib/exportPdf";

interface DocRow {
  id: string;
  title: string;
  storage_path: string;
  language: string;
  overlays: unknown;
}

const uid = () => Math.random().toString(36).slice(2, 10);

const Editor = () => {
  const { docId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { balance, refresh: refreshCredits } = useCredits();

  const [doc, setDoc] = useState<DocRow | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pageSizes, setPageSizes] = useState<{ widthPt: number; heightPt: number }[]>([]);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [stampOpen, setStampOpen] = useState(false);
  const [propsOpen, setPropsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [userStamps, setUserStamps] = useState<{ id: string; name: string; url: string }[]>([]);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stampUploadRef = useRef<HTMLInputElement>(null);

  // === Load existing document by id ===
  useEffect(() => {
    if (!docId || !user) return;
    (async () => {
      setBusy("load");
      const { data, error } = await supabase
        .from("documents").select("*").eq("id", docId).maybeSingle();
      if (error || !data) { toast.error("Document not found"); nav("/templates"); return; }
      setDoc(data as DocRow);
      const ovs = (data.overlays as unknown as Overlay[]) ?? [];
      setOverlays(Array.isArray(ovs) ? ovs : []);
      // fetch PDF bytes (template-pdfs/* is public, others use signed url from pdfs bucket)
      const path = (data as DocRow).storage_path;
      let bytes: ArrayBuffer | null = null;
      if (path.startsWith("template-pdfs/")) {
        const url = supabase.storage.from("template-pdfs").getPublicUrl(path.replace("template-pdfs/","")).data.publicUrl;
        const r = await fetch(url);
        bytes = await r.arrayBuffer();
      } else {
        const { data: signed, error: e2 } = await supabase.storage.from("pdfs").createSignedUrl(path, 60 * 60);
        if (e2 || !signed) { toast.error("Cannot read PDF"); setBusy(null); return; }
        bytes = await (await fetch(signed.signedUrl)).arrayBuffer();
      }
      const u8 = new Uint8Array(bytes);
      setPdfBytes(u8);
      const pdf = await pdfjsLib.getDocument({ data: u8.slice() }).promise;
      setPdfDoc(pdf);
      setBusy(null);
    })();
  }, [docId, user, nav]);

  // === Load user stamps ===
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("stamps").select("id,name,storage_path").eq("user_id", user.id);
      if (!data) return;
      const withUrls = await Promise.all(data.map(async (s) => {
        const { data: u } = await supabase.storage.from("stamps").createSignedUrl(s.storage_path, 60 * 60);
        return { id: s.id, name: s.name, url: u?.signedUrl ?? "" };
      }));
      setUserStamps(withUrls);
    })();
  }, [user]);

  // === Render pages ===
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    (async () => {
      const sizes: { widthPt: number; heightPt: number }[] = [];
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        sizes.push({ widthPt: vp.width, heightPt: vp.height });
      }
      if (cancelled) return;
      setPageSizes(sizes);
    })();
    return () => { cancelled = true; };
  }, [pdfDoc]);

  // === Upload a new PDF (no docId) ===
  const onUploadPdf = async (file: File) => {
    if (!user) return;
    setBusy("upload");
    try {
      const path = `${user.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("pdfs").upload(path, file, { contentType: "application/pdf" });
      if (upErr) throw upErr;
      const { data, error } = await supabase.from("documents").insert({
        user_id: user.id, title: file.name.replace(/\.pdf$/i, ""), storage_path: path,
      }).select("id").single();
      if (error) throw error;
      nav(`/editor/${data.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally { setBusy(null); }
  };

  // === Save overlays ===
  const save = async () => {
    if (!doc) return;
    setBusy("save");
    const { error } = await supabase.from("documents").update({
      overlays: overlays as unknown as never, title: doc.title,
    }).eq("id", doc.id);
    setBusy(null);
    if (error) toast.error(error.message); else toast.success("Saved");
  };

  // === Download (spends 1 credit) ===
  const download = async () => {
    if (!doc || !pdfBytes) return;
    if ((balance ?? 0) < 1) {
      toast.error("Out of credits — top up to download.");
      nav("/pricing"); return;
    }
    setBusy("download");
    try {
      // Try to spend a credit first (atomic-ish via two writes)
      const { data: cur } = await supabase.from("credits").select("balance").eq("user_id", user!.id).single();
      if (!cur || cur.balance < 1) throw new Error("Not enough credits");
      const { error: dec } = await supabase.from("credits").update({ balance: cur.balance - 1, updated_at: new Date().toISOString() }).eq("user_id", user!.id);
      if (dec) throw dec;
      await supabase.from("credit_ledger").insert({ user_id: user!.id, delta: -1, kind: "spend", reference_id: doc.id, note: `Export ${doc.title}` });
      // Save current state, then export
      await supabase.from("documents").update({ overlays: overlays as unknown as never }).eq("id", doc.id);
      const out = await exportPdf(pdfBytes, overlays);
      const blob = new Blob([out as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${doc.title || "document"}.pdf`; a.click();
      URL.revokeObjectURL(url);
      refreshCredits();
      toast.success("Downloaded ✓");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally { setBusy(null); }
  };

  // === Save as template (admin or user's private template) ===
  const saveAsTemplate = async () => {
    if (!doc || !user) return;
    const title = prompt("Template title?", doc.title);
    if (!title) return;
    const { error } = await supabase.from("templates").insert({
      user_id: user.id, title, language: doc.language ?? "en",
      storage_path: doc.storage_path, overlays: overlays as unknown as never, is_public: false,
    });
    if (error) toast.error(error.message); else toast.success("Saved as private template");
  };

  // === Add overlays ===
  const addOverlayToPage0 = (o: Omit<Overlay, "id" | "page" | "x" | "y">) => {
    const page = 0;
    const size = pageSizes[page] ?? { widthPt: 595, heightPt: 842 };
    const x = (size.widthPt - (o.w ?? 100)) / 2;
    const y = (size.heightPt - (o.h ?? 30)) / 2;
    const ov = { ...o, id: uid(), page, x, y } as Overlay;
    setOverlays((prev) => [...prev, ov]);
    setSelectedId(ov.id);
  };

  const addText = () => addOverlayToPage0({ kind: "text", text: "Type here", fontSize: 12, color: "#000000", w: 160, h: 22 });
  const addCheckbox = () => addOverlayToPage0({ kind: "checkbox", checked: true, w: 14, h: 14 });
  const addSignature = (dataUrl: string) => { addOverlayToPage0({ kind: "signature", dataUrl, w: 140, h: 50 }); setSignOpen(false); };
  const addBhutanStamp = () => addOverlayToPage0({
    kind: "stamp", src: bhutanStamp, builtin: "bhutan-legal-20x25",
    w: 20 * MM_TO_PT, h: 25 * MM_TO_PT, // exact 20mm × 25mm
  });
  const addCustomStamp = (url: string) => { addOverlayToPage0({ kind: "stamp", src: url, w: 20 * MM_TO_PT, h: 25 * MM_TO_PT }); setStampOpen(false); };

  // === Upload a stamp image ===
  const onStampFile = async (file: File) => {
    if (!user) return;
    const path = `${user.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("stamps").upload(path, file, { contentType: file.type });
    if (error) { toast.error(error.message); return; }
    const { data } = await supabase.from("stamps").insert({ user_id: user.id, name: file.name, storage_path: path }).select("id,name,storage_path").single();
    if (!data) return;
    const { data: signed } = await supabase.storage.from("stamps").createSignedUrl(path, 60 * 60);
    setUserStamps((p) => [...p, { id: data.id, name: data.name, url: signed?.signedUrl ?? "" }]);
    toast.success("Stamp added");
  };

  const updateOverlay = (id: string, patch: Partial<Overlay>) =>
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } as Overlay : o)));
  const removeOverlay = (id: string) => { setOverlays((prev) => prev.filter((o) => o.id !== id)); setSelectedId(null); };

  const selected = overlays.find((o) => o.id === selectedId) ?? null;

  // === No docId & no user PDF -> show uploader ===
  if (!docId) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="flex-1 container py-12 max-w-2xl">
          <Button variant="ghost" size="sm" onClick={() => nav(-1)} className="mb-4"><ChevronLeft className="h-4 w-4" /> Back</Button>
          <h1 className="text-3xl font-semibold tracking-tight">Upload a PDF to edit</h1>
          <p className="mt-2 text-muted-foreground">Or pick from <button className="text-primary underline" onClick={() => nav("/templates")}>118 official forms</button>.</p>
          <label className="mt-8 block rounded-2xl border-2 border-dashed border-border/80 hover:border-primary/60 transition p-12 text-center cursor-pointer bg-card/40">
            <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium">Click to upload a PDF</p>
            <p className="mt-1 text-xs text-muted-foreground">Up to 20 MB</p>
            <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden"
              onChange={(e) => e.target.files?.[0] && onUploadPdf(e.target.files[0])} />
          </label>
          {busy === "upload" && <p className="mt-4 text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> Uploading…</p>}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />
      {/* Toolbar */}
      <div className="sticky top-16 z-30 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="container py-2 flex items-center gap-2 overflow-x-auto">
          <Input
            value={doc?.title ?? ""}
            onChange={(e) => setDoc((d) => d ? { ...d, title: e.target.value } : d)}
            className="max-w-[180px] sm:max-w-xs h-9 text-sm"
            placeholder="Document title"
          />
          <div className="h-6 w-px bg-border mx-1" />
          <Button size="sm" variant="ghost" onClick={addText}><Type className="h-4 w-4" /><span className="hidden sm:inline">Text</span></Button>
          <Button size="sm" variant="ghost" onClick={addCheckbox}><CheckSquare className="h-4 w-4" /><span className="hidden sm:inline">Tick</span></Button>
          <Button size="sm" variant="ghost" onClick={() => setSignOpen(true)}><PenLine className="h-4 w-4" /><span className="hidden sm:inline">Sign</span></Button>
          <Button size="sm" variant="ghost" onClick={() => setStampOpen(true)}><StampIcon className="h-4 w-4" /><span className="hidden sm:inline">Stamp</span></Button>
          <div className="h-6 w-px bg-border mx-1" />
          <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}><ZoomOut className="h-4 w-4" /></Button>
          <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.min(3, z + 0.1))}><ZoomIn className="h-4 w-4" /></Button>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={save} disabled={busy === "save"}><Save className="h-4 w-4" /><span className="hidden sm:inline">Save</span></Button>
            <Button size="sm" variant="ghost" onClick={saveAsTemplate}><span className="hidden sm:inline">Save as template</span><span className="sm:hidden">Tmpl</span></Button>
            <Button size="sm" variant="hero" onClick={download} disabled={busy === "download" || !pdfBytes}>
              {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="hidden sm:inline">Download (1 credit)</span>
              <span className="sm:hidden">PDF</span>
            </Button>
            {selected && (
              <Sheet open={propsOpen} onOpenChange={setPropsOpen}>
                <SheetTrigger asChild>
                  <Button size="sm" variant="soft"><Settings2 className="h-4 w-4" /></Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80">
                  <SheetHeader><SheetTitle>Properties</SheetTitle></SheetHeader>
                  <PropertyPanel
                    o={selected} onChange={(p) => updateOverlay(selected.id, p)}
                    onDelete={() => { removeOverlay(selected.id); setPropsOpen(false); }}
                  />
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>
      </div>

      <main ref={canvasContainerRef} className="flex-1 overflow-auto py-6 px-2 sm:px-4">
        <div className="mx-auto flex flex-col items-center gap-4">
          {busy === "load" || !pdfDoc ? (
            <div className="py-32 text-muted-foreground"><Loader2 className="inline h-5 w-5 animate-spin mr-2" /> Loading PDF…</div>
          ) : (
            pageSizes.map((sz, i) => (
              <PageView
                key={i} index={i} pdfDoc={pdfDoc} sizePt={sz} zoom={zoom}
                overlays={overlays.filter((o) => o.page === i)}
                selectedId={selectedId}
                onSelect={(id) => { setSelectedId(id); if (id) setPropsOpen(true); }}
                onChange={updateOverlay}
              />
            ))
          )}
        </div>
      </main>

      {/* Signature Sheet */}
      <Sheet open={signOpen} onOpenChange={setSignOpen}>
        <SheetContent side="bottom" className="h-[60vh]">
          <SheetHeader><SheetTitle>Draw your signature</SheetTitle></SheetHeader>
          <SignaturePad onDone={addSignature} />
        </SheetContent>
      </Sheet>

      {/* Stamp Sheet */}
      <Sheet open={stampOpen} onOpenChange={setStampOpen}>
        <SheetContent side="bottom" className="h-[70vh] overflow-y-auto">
          <SheetHeader><SheetTitle>Apply a stamp</SheetTitle></SheetHeader>
          <p className="text-xs text-muted-foreground mt-1">Stamps are placed at exact <strong>20 mm × 25 mm</strong>.</p>

          <h3 className="mt-5 text-sm font-medium">Bhutan Legal Stamp</h3>
          <button onClick={addBhutanStamp} className="mt-2 rounded-xl border border-border/70 hover:border-primary/60 p-3 flex items-center gap-3 w-full text-left">
            <img src={bhutanStamp} alt="Bhutan legal stamp" className="h-16 w-auto rounded" />
            <div>
              <p className="font-medium text-sm">Royal Government of Bhutan — Nu. 10 Legal Stamp</p>
              <p className="text-xs text-muted-foreground">Exact 20mm × 25mm</p>
            </div>
          </button>

          <h3 className="mt-6 text-sm font-medium">Your stamps</h3>
          <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-2">
            {userStamps.map((s) => (
              <button key={s.id} onClick={() => addCustomStamp(s.url)} className="rounded-lg border border-border/70 p-2 hover:border-primary/60">
                <img src={s.url} alt={s.name} className="h-16 w-full object-contain" />
                <p className="mt-1 text-[10px] truncate text-muted-foreground">{s.name}</p>
              </button>
            ))}
            <label className="rounded-lg border-2 border-dashed border-border/70 p-2 grid place-items-center cursor-pointer hover:border-primary/60 min-h-[80px]">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground mt-1">Upload</span>
              <input ref={stampUploadRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => e.target.files?.[0] && onStampFile(e.target.files[0])} />
            </label>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

// ====================== Page rendering + drag handling ======================

const PageView = ({ index, pdfDoc, sizePt, zoom, overlays, selectedId, onSelect, onChange }: {
  index: number;
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  sizePt: { widthPt: number; heightPt: number };
  zoom: number;
  overlays: Overlay[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<Overlay>) => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdfDoc.getPage(index + 1);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const scale = zoom * dpr;
      const vp = page.getViewport({ scale });
      const canvas = canvasRef.current; if (!canvas || cancelled) return;
      canvas.width = vp.width; canvas.height = vp.height;
      canvas.style.width = `${sizePt.widthPt * zoom}px`;
      canvas.style.height = `${sizePt.heightPt * zoom}px`;
      const ctx = canvas.getContext("2d")!;
      try { renderTaskRef.current?.cancel(); } catch { /* ignore */ }
      const task = page.render({ canvasContext: ctx, viewport: vp, canvas });
      renderTaskRef.current = task;
      try { await task.promise; } catch { /* cancelled */ }
    })();
    return () => { cancelled = true; try { renderTaskRef.current?.cancel(); } catch { /* ignore */ } };
  }, [pdfDoc, index, zoom, sizePt.widthPt, sizePt.heightPt]);

  const wrapStyle = { width: sizePt.widthPt * zoom, height: sizePt.heightPt * zoom };

  return (
    <div className="relative shadow-card rounded-md overflow-hidden bg-white" style={wrapStyle}
         onMouseDown={(e) => { if (e.target === e.currentTarget) onSelect(null); }}>
      <canvas ref={canvasRef} className="block select-none" />
      {overlays.map((o) => (
        <OverlayBox key={o.id} o={o} zoom={zoom} selected={o.id === selectedId}
                    onSelect={() => onSelect(o.id)} onChange={(p) => onChange(o.id, p)}
                    pageSize={sizePt} />
      ))}
    </div>
  );
};

const OverlayBox = ({ o, zoom, selected, onSelect, onChange, pageSize }: {
  o: Overlay; zoom: number; selected: boolean;
  onSelect: () => void;
  onChange: (p: Partial<Overlay>) => void;
  pageSize: { widthPt: number; heightPt: number };
}) => {
  const startRef = useRef<{ x: number; y: number; ox: number; oy: number; ow: number; oh: number; mode: "move" | "resize" } | null>(null);

  const onPointerDown = (e: React.PointerEvent, mode: "move" | "resize") => {
    e.stopPropagation(); onSelect();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY, ox: o.x, oy: o.y, ow: o.w, oh: o.h, mode };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = startRef.current; if (!s) return;
    const dx = (e.clientX - s.x) / zoom;
    const dy = (e.clientY - s.y) / zoom;
    if (s.mode === "move") {
      const nx = Math.min(pageSize.widthPt - o.w, Math.max(0, s.ox + dx));
      const ny = Math.min(pageSize.heightPt - o.h, Math.max(0, s.oy + dy));
      onChange({ x: nx, y: ny });
    } else {
      // resize: keep aspect for stamp & signature
      const keepAR = o.kind === "stamp" || o.kind === "signature";
      let nw = Math.max(8, s.ow + dx);
      let nh = Math.max(8, s.oh + dy);
      if (keepAR) {
        const ar = s.ow / s.oh;
        if (nw / nh > ar) nw = nh * ar; else nh = nw / ar;
      }
      onChange({ w: Math.min(pageSize.widthPt - o.x, nw), h: Math.min(pageSize.heightPt - o.y, nh) });
    }
  };
  const onPointerUp = () => { startRef.current = null; };

  const style: React.CSSProperties = {
    position: "absolute",
    left: o.x * zoom, top: o.y * zoom,
    width: o.w * zoom, height: o.h * zoom,
    border: selected ? "1.5px solid hsl(var(--primary))" : "1px dashed rgba(0,0,0,0.25)",
    background: selected ? "hsla(33,100%,55%,0.08)" : "transparent",
    cursor: "move", touchAction: "none",
  };

  return (
    <div style={style}
         onPointerDown={(e) => onPointerDown(e, "move")}
         onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {o.kind === "text" && (
        <input
          value={o.text}
          onChange={(e) => onChange({ text: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%", height: "100%", border: "none", background: "transparent",
            outline: "none", padding: 0, color: o.color, fontSize: o.fontSize * zoom, lineHeight: 1.1,
            fontFamily: "Helvetica, Arial, sans-serif",
          }}
        />
      )}
      {o.kind === "checkbox" && (
        <div style={{
          width: "100%", height: "100%", display: "grid", placeItems: "center",
          color: "#000", fontWeight: 700, fontSize: Math.min(o.w, o.h) * zoom * 0.95, lineHeight: 1,
        }}>
          {o.checked ? "✓" : ""}
        </div>
      )}
      {o.kind === "signature" && (
        <img src={o.dataUrl} alt="signature" style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
      )}
      {o.kind === "stamp" && (
        <img src={o.src} alt="stamp" style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
      )}
      {selected && (
        <div onPointerDown={(e) => onPointerDown(e, "resize")}
             style={{
               position: "absolute", right: -7, bottom: -7, width: 14, height: 14, borderRadius: 4,
               background: "hsl(var(--primary))", cursor: "se-resize",
             }} />
      )}
    </div>
  );
};

// ====================== Property panel ======================

const PropertyPanel = ({ o, onChange, onDelete }: { o: Overlay; onChange: (p: Partial<Overlay>) => void; onDelete: () => void; }) => {
  return (
    <div className="mt-4 space-y-4">
      <div className="text-xs text-muted-foreground">Type: <span className="font-medium text-foreground">{o.kind}</span></div>
      {o.kind === "text" && (
        <>
          <div><Label>Text</Label><Input value={o.text} onChange={(e) => onChange({ text: e.target.value })} /></div>
          <div><Label>Font size: {o.fontSize}pt</Label>
            <Slider value={[o.fontSize]} min={6} max={48} step={1} onValueChange={([v]) => onChange({ fontSize: v })} />
          </div>
          <div><Label>Color</Label><Input type="color" value={o.color} onChange={(e) => onChange({ color: e.target.value })} className="h-10 w-20 p-1" /></div>
        </>
      )}
      {o.kind === "checkbox" && (
        <Button variant="soft" onClick={() => onChange({ checked: !o.checked })}>
          {o.checked ? "Untick" : "Tick"}
        </Button>
      )}
      {o.kind === "stamp" && (
        <p className="text-xs text-muted-foreground">Stamp size locked aspect-ratio. Default Bhutanese legal stamp = 20 mm × 25 mm.</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div><Label>X (pt)</Label><Input type="number" value={Math.round(o.x)} onChange={(e) => onChange({ x: Number(e.target.value) })} /></div>
        <div><Label>Y (pt)</Label><Input type="number" value={Math.round(o.y)} onChange={(e) => onChange({ y: Number(e.target.value) })} /></div>
        <div><Label>W (pt)</Label><Input type="number" value={Math.round(o.w)} onChange={(e) => onChange({ w: Number(e.target.value) })} /></div>
        <div><Label>H (pt)</Label><Input type="number" value={Math.round(o.h)} onChange={(e) => onChange({ h: Number(e.target.value) })} /></div>
      </div>
      <Button variant="destructive" className="w-full" onClick={onDelete}><Trash2 className="h-4 w-4" /> Delete</Button>
    </div>
  );
};

export default Editor;
