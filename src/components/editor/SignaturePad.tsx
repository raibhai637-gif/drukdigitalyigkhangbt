import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export const SignaturePad = ({ onDone }: { onDone: (dataUrl: string) => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr; c.height = rect.height * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#000";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent) => {
    setDrawing(true); setHasInk(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const up = () => setDrawing(false);

  const clear = () => {
    const c = canvasRef.current!; const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height); setHasInk(false);
  };
  const apply = () => {
    if (!hasInk) return;
    // Trim transparent and export PNG
    const c = canvasRef.current!;
    const url = c.toDataURL("image/png");
    onDone(url);
  };

  return (
    <div className="mt-4">
      <div className="rounded-lg border border-border bg-white">
        <canvas
          ref={canvasRef}
          className="block w-full h-[280px] touch-none rounded-lg"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        />
      </div>
      <div className="flex gap-2 mt-3">
        <Button variant="ghost" onClick={clear}>Clear</Button>
        <Button variant="hero" className="ml-auto" onClick={apply} disabled={!hasInk}>Apply signature</Button>
      </div>
    </div>
  );
};
