import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Overlay } from "./pdf";

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
  // Keep the source PDF pages at their native size — overlays are stored in
  // coordinates relative to each page's own size, so display === export.
  const out = await PDFDocument.load(originalBytes.slice() as unknown as ArrayBuffer);
  const helv = await out.embedFont(StandardFonts.Helvetica);
  const helvB = await out.embedFont(StandardFonts.HelveticaBold);
  const pages = out.getPages();

  for (const o of overlays) {
    const page = pages[o.page]; if (!page) continue;
    const ph = page.getHeight();
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
      const img = await out.embedPng(bytes);
      page.drawImage(img, { x: o.x, y: yBottom, width: o.w, height: o.h });
    } else if (o.kind === "stamp") {
      const { bytes, mime } = await fetchAsBytes(o.src);
      const img = mime.includes("png") ? await out.embedPng(bytes) : await out.embedJpg(bytes);
      page.drawImage(img, { x: o.x, y: yBottom, width: o.w, height: o.h });
    }
  }
  return await out.save();
};
