import * as pdfjsLib from "pdfjs-dist";
// @ts-expect-error - vite worker import
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };

export type OverlayKind = "text" | "checkbox" | "signature" | "stamp";

// All coords stored in PDF points (1pt = 1/72 inch). 1mm = 2.83465pt.
export const MM_TO_PT = 72 / 25.4;

export interface BaseOverlay {
  id: string;
  page: number; // 0-indexed
  kind: OverlayKind;
  x: number; // pt from left of PDF page
  y: number; // pt from top of PDF page (we will convert to bottom-up at export time)
  w: number; // pt
  h: number; // pt
}
export interface TextOverlay extends BaseOverlay {
  kind: "text";
  text: string;
  fontSize: number; // pt
  color: string; // hex
}
export interface CheckboxOverlay extends BaseOverlay {
  kind: "checkbox";
  checked: boolean;
}
export interface SignatureOverlay extends BaseOverlay {
  kind: "signature";
  dataUrl: string; // png data url
}
export interface StampOverlay extends BaseOverlay {
  kind: "stamp";
  src: string; // url or data url to image
  builtin?: "bhutan-legal-20x25"; // marker for bundled assets
}
export type Overlay = TextOverlay | CheckboxOverlay | SignatureOverlay | StampOverlay;
