import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Overlay } from "./pdf";

// A4 portrait in PDF points
const A4_W = 595.28;
const A4_H = 841.89;

const hexToRgb = (hex: string) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

const fetchAsBytes = async (src: string): Promise<{ bytes: Uint8Array; mime: string }> => {
  if (src.startsWith("data:")) {
    const [meta, b64] = src.split(",");
    const mime = /data:(.*?);base64/.exec(meta)?.[1] ?? "image/png";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, mime };
  }
  const r = await fetch(src);
  const ab = await r.arrayBuffer();
  return { bytes: new Uint8Array(ab), mime: r.headers.get("content-type") ?? "image/png" };
};

export const exportPdf = async (originalBytes: Uint8Array, overlays: Overlay[]): Promise<Uint8Array> => {
  // Build a fresh A4 document and embed each source page scaled (letterboxed)
  // into A4 so on-screen WYSIWYG matches the exported PDF exactly.
  const src = await PDFDocument.load(originalBytes.slice() as unknown as ArrayBuffer);
  const out = await PDFDocument.create();
  const helv = await out.embedFont(StandardFonts.Helvetica);
  const helvB = await out.embedFont(StandardFonts.HelveticaBold);

  const srcPageCount = src.getPageCount();
  const embeddedPages = await out.embedPdf(src, Array.from({ length: srcPageCount }, (_, i) => i));

  const a4Pages = embeddedPages.map((emb) => {
    const page = out.addPage([A4_W, A4_H]);
    const sw = emb.width;
    const sh = emb.height;
    const fit = Math.min(A4_W / sw, A4_H / sh);
    const w = sw * fit;
    const h = sh * fit;
    const x = (A4_W - w) / 2;
    const y = (A4_H - h) / 2;
    page.drawPage(emb, { x, y, width: w, height: h });
    return page;
  });

  for (const o of overlays) {
    const page = a4Pages[o.page]; if (!page) continue;
    const ph = A4_H;
    // Convert top-down (y from top) to bottom-up
    const yBottom = ph - o.y - o.h;

    if (o.kind === "text") {
      page.drawText(o.text || "", {
        x: o.x,
        y: ph - o.y - o.fontSize, // baseline placement near top of box
        size: o.fontSize,
        font: helv,
        color: hexToRgb(o.color),
        maxWidth: o.w,
      });
    } else if (o.kind === "checkbox") {
      // box outline
      page.drawRectangle({
        x: o.x, y: yBottom, width: o.w, height: o.h,
        borderColor: rgb(0, 0, 0), borderWidth: 1,
      });
      if (o.checked) {
        const size = Math.min(o.w, o.h) * 0.95;
        page.drawText("X", {
          x: o.x + (o.w - size * 0.55) / 2,
          y: yBottom + (o.h - size * 0.7) / 2,
          size, font: helvB, color: rgb(0, 0, 0),
        });
      }
    } else if (o.kind === "signature") {
      const { bytes } = await fetchAsBytes(o.dataUrl);
      const img = await pdf.embedPng(bytes);
      page.drawImage(img, { x: o.x, y: yBottom, width: o.w, height: o.h });
    } else if (o.kind === "stamp") {
      const { bytes, mime } = await fetchAsBytes(o.src);
      const img = mime.includes("png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      page.drawImage(img, { x: o.x, y: yBottom, width: o.w, height: o.h });
    }
  }
  return await out.save();
};
