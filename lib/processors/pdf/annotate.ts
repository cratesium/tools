/**
 * Draws user-placed items (text, boxes, whiteout, images/signatures) onto PDF pages with pdf-lib.
 * Item geometry is in *visual* page fractions (as displayed, top-left origin), so rotated pages
 * are handled via the page's visual frame.
 */
import { loadPdf, pdfLib, savePdf } from "./load";
import { centeredOrigin, hexToRgb, pageFrame, type FontChoice } from "./stamp";

export type EditItem =
  | { id: string; kind: "text"; page: number; x: number; y: number; w: number; h: number; text: string; size: number; color: string; font: FontChoice }
  | { id: string; kind: "rect" | "whiteout"; page: number; x: number; y: number; w: number; h: number; color: string; fill: boolean; strokeWidth: number }
  | { id: string; kind: "image"; page: number; x: number; y: number; w: number; h: number; bytes: Uint8Array; mime: "image/png" | "image/jpeg" };

const FONTS: Record<FontChoice, string> = {
  helvetica: "Helvetica",
  "helvetica-bold": "Helvetica-Bold",
  times: "Times-Roman",
  "times-bold": "Times-Bold",
  courier: "Courier",
};

export async function applyEdits(bytes: Uint8Array, items: EditItem[], password?: string): Promise<{ bytes: Uint8Array; replacedChars: number }> {
  const lib = await pdfLib();
  const { rgb, degrees } = lib;
  const doc = await loadPdf(bytes, { password });
  const pages = doc.getPages();
  const fontCache = new Map<FontChoice, Awaited<ReturnType<typeof doc.embedFont>>>();
  let replaced = 0;
  for (const it of items) {
    const page = pages[it.page - 1];
    if (!page) continue;
    const f = pageFrame(page);
    const W = f.width;
    const H = f.height;
    const w = it.w * W;
    const h = it.h * H;
    const cx = it.x * W + w / 2;
    const cy = H - it.y * H - h / 2;
    if (it.kind === "text") {
      let font = fontCache.get(it.font);
      if (!font) {
        font = await doc.embedFont(FONTS[it.font]);
        fontCache.set(it.font, font);
      }
      const charset = new Set(font.getCharacterSet());
      const [r, g, b] = hexToRgb(it.color);
      const lines = it.text.split(/\r?\n/);
      lines.forEach((raw, i) => {
        const line = [...raw].map((ch) => (charset.has(ch.codePointAt(0)!) ? ch : (replaced++, "?"))).join("");
        const vx = it.x * W;
        const vy = H - it.y * H - it.size * (i + 1) * 1.15 + it.size * 0.2;
        const o = f.toPdf(vx, vy);
        page.drawText(line, { x: o.x, y: o.y, size: it.size, font, color: rgb(r / 255, g / 255, b / 255), rotate: degrees(f.rotation) });
      });
    } else if (it.kind === "rect" || it.kind === "whiteout") {
      const o = centeredOrigin(f, cx, cy, w, h, 0);
      const [r, g, b] = hexToRgb(it.kind === "whiteout" ? "#ffffff" : it.color);
      const c = rgb(r / 255, g / 255, b / 255);
      page.drawRectangle({
        x: o.x,
        y: o.y,
        width: w,
        height: h,
        rotate: degrees(o.rotate),
        color: it.kind === "whiteout" || it.fill ? c : undefined,
        borderColor: it.kind === "whiteout" ? undefined : c,
        borderWidth: it.kind === "whiteout" ? 0 : it.strokeWidth,
      });
    } else if (it.kind === "image") {
      const img = it.mime === "image/png" ? await doc.embedPng(it.bytes) : await doc.embedJpg(it.bytes);
      const o = centeredOrigin(f, cx, cy, w, h, 0);
      page.drawImage(img, { x: o.x, y: o.y, width: w, height: h, rotate: degrees(o.rotate) });
    }
  }
  return { bytes: await savePdf(doc), replacedChars: replaced };
}
