/**
 * PDF → PowerPoint: each rendered page image becomes one full-bleed slide (pptxgenjs).
 * Slides look like the PDF but their content is a picture, not editable text.
 */

export interface SlideImage {
  data: Uint8Array;
  mime: "image/png" | "image/jpeg";
  /** Page size in points. */
  widthPt: number;
  heightPt: number;
  /** Optional speaker notes (e.g. the page's extracted text, so it stays searchable). */
  notes?: string;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

/** Fits a w×h box inside W×H, centred. */
export function containRect(w: number, h: number, W: number, H: number) {
  const s = Math.min(W / w, H / h);
  const cw = w * s;
  const ch = h * s;
  return { x: (W - cw) / 2, y: (H - ch) / 2, w: cw, h: ch };
}

export async function imagesToPptx(slides: SlideImage[], opts: { title?: string } = {}): Promise<Uint8Array> {
  if (!slides.length) throw new Error("No pages to convert.");
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  // Slide size follows the first page (inches). PowerPoint allows 1"–56".
  const clampIn = (v: number) => Math.min(56, Math.max(1, v));
  const W = clampIn(slides[0].widthPt / 72);
  const H = clampIn(slides[0].heightPt / 72);
  pptx.defineLayout({ name: "PDF", width: W, height: H });
  pptx.layout = "PDF";
  if (opts.title) pptx.title = opts.title;
  pptx.author = "UtilityHub";
  for (const s of slides) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    const r = containRect(s.widthPt / 72, s.heightPt / 72, W, H);
    slide.addImage({ data: `data:${s.mime};base64,${bytesToBase64(s.data)}`, x: r.x, y: r.y, w: r.w, h: r.h });
    if (s.notes?.trim()) slide.addNotes(s.notes);
  }
  const out = await pptx.write({ outputType: "uint8array" });
  return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
}
