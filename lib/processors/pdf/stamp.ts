/**
 * Stamping text and images onto existing pages: watermarks, page numbers, headers and footers.
 * Positions are given in the page's *visual* orientation (as a viewer displays it, honouring
 * /Rotate and the CropBox) and mapped to PDF user space here.
 */
import type { PDFFont, PDFImage, PDFPage, PDFArray } from "@cantoo/pdf-lib";
import { loadPdf, pdfLib, savePdf, type PdfLib } from "./load";
import { makeSanitizer } from "./layout";
import { normalizeAngle } from "./organize";

export type HAlign = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";

export interface VisualFrame {
  /** Visual width/height of the page as displayed. */
  width: number;
  height: number;
  rotation: number;
  /** Maps a visual point (origin bottom-left of the displayed page) to PDF user space. */
  toPdf: (vx: number, vy: number) => { x: number; y: number };
}

export function visualFrame(box: { x: number; y: number; width: number; height: number }, rotation: number): VisualFrame {
  const r = normalizeAngle(rotation);
  const W = box.width;
  const H = box.height;
  const swap = r === 90 || r === 270;
  const toPdf = (vx: number, vy: number) => {
    let u: number;
    let v: number;
    if (r === 90) [u, v] = [W - vy, vx];
    else if (r === 180) [u, v] = [W - vx, H - vy];
    else if (r === 270) [u, v] = [vy, H - vx];
    else [u, v] = [vx, vy];
    return { x: box.x + u, y: box.y + v };
  };
  return { width: swap ? H : W, height: swap ? W : H, rotation: r, toPdf };
}

export function pageFrame(page: PDFPage): VisualFrame {
  return visualFrame(page.getCropBox(), page.getRotation().angle);
}

/** Origin (in PDF space) for drawing a w×h box whose visual centre is (cx, cy), rotated by `angle` (deg, CCW, visual). */
export function centeredOrigin(frame: VisualFrame, cx: number, cy: number, w: number, h: number, angle: number) {
  const a = (angle * Math.PI) / 180;
  const ox = cx - (Math.cos(a) * w) / 2 + (Math.sin(a) * h) / 2;
  const oy = cy - (Math.sin(a) * w) / 2 - (Math.cos(a) * h) / 2;
  return { ...frame.toPdf(ox, oy), rotate: normalizeDeg(angle + frame.rotation) };
}

function normalizeDeg(a: number) {
  return ((a % 360) + 360) % 360;
}

/** Wraps the existing page content in q…Q so a stray transform cannot displace our stamp. */
function isolate(lib: PdfLib, page: PDFPage) {
  const { PDFContentStream, pushGraphicsState, popGraphicsState } = lib;
  const ctx = page.doc.context;
  page.node.normalize();
  const start = ctx.register(PDFContentStream.of(ctx.obj({}), [pushGraphicsState()]));
  const end = ctx.register(PDFContentStream.of(ctx.obj({}), [popGraphicsState()]));
  page.node.wrapContentStreams(start, end);
}

/** Moves the stream(s) appended since `before` to the front so they paint underneath the page. */
function sendToBack(page: PDFPage, before: number) {
  const arr = page.node.Contents() as PDFArray | undefined;
  if (!arr || typeof (arr as PDFArray).size !== "function") return;
  const added: ReturnType<PDFArray["get"]>[] = [];
  while (arr.size() > before) {
    added.unshift(arr.get(arr.size() - 1));
    arr.remove(arr.size() - 1);
  }
  added.reverse().forEach((ref) => arr.insert(0, ref));
}

function contentCount(page: PDFPage): number {
  const arr = page.node.Contents() as PDFArray | undefined;
  return arr && typeof arr.size === "function" ? arr.size() : 0;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

export type FontChoice = "helvetica" | "helvetica-bold" | "times" | "times-bold" | "courier";

async function embedFont(lib: PdfLib, doc: PDFPage["doc"], f: FontChoice): Promise<PDFFont> {
  const { StandardFonts } = lib;
  const map: Record<FontChoice, string> = {
    helvetica: StandardFonts.Helvetica,
    "helvetica-bold": StandardFonts.HelveticaBold,
    times: StandardFonts.TimesRoman,
    "times-bold": StandardFonts.TimesRomanBold,
    courier: StandardFonts.Courier,
  };
  return doc.embedFont(map[f]);
}

export interface WatermarkOptions {
  kind: "text" | "image";
  text?: string;
  font?: FontChoice;
  fontSize?: number;
  color?: string;
  image?: { bytes: Uint8Array; mime: "image/png" | "image/jpeg" };
  /** Image width as a fraction of the page width. */
  imageScale?: number;
  opacity: number;
  /** Counter-clockwise degrees as seen on the page. */
  angle: number;
  position: "center" | "tile" | `${VAlign}-${HAlign}`;
  behind?: boolean;
  pages?: number[];
  password?: string;
}

export async function addWatermark(bytes: Uint8Array, o: WatermarkOptions): Promise<{ bytes: Uint8Array; replacedChars: number }> {
  const lib = await pdfLib();
  const { rgb, degrees } = lib;
  const doc = await loadPdf(bytes, { password: o.password });
  const target = new Set(o.pages ?? doc.getPageIndices().map((i) => i + 1));
  let font: PDFFont | null = null;
  let image: PDFImage | null = null;
  let text = "";
  let replaced = 0;
  if (o.kind === "text") {
    if (!o.text?.trim()) throw new Error("Enter the watermark text.");
    font = await embedFont(lib, doc.getPage(0).doc, o.font ?? "helvetica-bold");
    const san = makeSanitizer(new Set(font.getCharacterSet()));
    text = san.sanitize(o.text.replace(/\s*\n\s*/g, " "));
    replaced = san.count();
  } else {
    if (!o.image) throw new Error("Choose a watermark image.");
    image = o.image.mime === "image/png" ? await doc.embedPng(o.image.bytes) : await doc.embedJpg(o.image.bytes);
  }
  const [r, g, b] = hexToRgb(o.color ?? "#888888");
  doc.getPages().forEach((page, i) => {
    if (!target.has(i + 1)) return;
    const frame = pageFrame(page);
    let w: number;
    let h: number;
    let size = o.fontSize ?? 48;
    if (font) {
      w = font.widthOfTextAtSize(text, size);
      // Shrink text that would not fit across the page diagonal.
      const maxW = Math.hypot(frame.width, frame.height) * 0.9;
      if (o.position === "center" && w > maxW) {
        size *= maxW / w;
        w = maxW;
      }
      h = font.heightAtSize(size, { descender: false });
    } else {
      w = frame.width * (o.imageScale ?? 0.4);
      h = (w / image!.width) * image!.height;
    }
    isolate(lib, page);
    const before = contentCount(page);
    const draw = (cx: number, cy: number) => {
      const org = centeredOrigin(frame, cx, cy, w, h, o.angle);
      if (font) page.drawText(text, { x: org.x, y: org.y, size, font, color: rgb(r, g, b), opacity: o.opacity, rotate: degrees(org.rotate) });
      else page.drawImage(image!, { x: org.x, y: org.y, width: w, height: h, opacity: o.opacity, rotate: degrees(org.rotate) });
    };
    const pad = Math.min(frame.width, frame.height) * 0.06;
    if (o.position === "center") draw(frame.width / 2, frame.height / 2);
    else if (o.position === "tile") {
      const stepX = Math.max(w * 0.8, 60) + pad * 2;
      const stepY = Math.max(h * 3, 60) + pad;
      let row = 0;
      for (let cy = stepY / 2; cy < frame.height + stepY / 2; cy += stepY, row++)
        for (let cx = (row % 2 ? stepX / 2 : 0) + stepX / 4; cx < frame.width + stepX / 2; cx += stepX) draw(cx, cy);
    } else {
      const [v, hAl] = o.position.split("-") as [VAlign, HAlign];
      const bw = Math.abs(Math.cos((o.angle * Math.PI) / 180) * w) + Math.abs(Math.sin((o.angle * Math.PI) / 180) * h);
      const bh = Math.abs(Math.sin((o.angle * Math.PI) / 180) * w) + Math.abs(Math.cos((o.angle * Math.PI) / 180) * h);
      const cx = hAl === "left" ? pad + bw / 2 : hAl === "right" ? frame.width - pad - bw / 2 : frame.width / 2;
      const cy = v === "bottom" ? pad + bh / 2 : v === "top" ? frame.height - pad - bh / 2 : frame.height / 2;
      draw(cx, cy);
    }
    if (o.behind) sendToBack(page, before);
  });
  return { bytes: await savePdf(doc), replacedChars: replaced };
}

export interface TextStamp {
  text: string;
  v: "top" | "bottom";
  h: HAlign;
}

export interface PageTextOptions {
  /** Build the stamps for a page (1-based page number, total pages). */
  stamps: (pageNumber: number, total: number) => TextStamp[];
  font?: FontChoice;
  fontSize?: number;
  color?: string;
  /** Distance from the page edge, in points. */
  margin?: number;
  pages?: number[];
  password?: string;
}

/** Draws short text items at the top/bottom left/center/right of pages. Shared by page numbers and header/footer. */
export async function stampPageText(bytes: Uint8Array, o: PageTextOptions): Promise<{ bytes: Uint8Array; replacedChars: number }> {
  const lib = await pdfLib();
  const { rgb, degrees } = lib;
  const doc = await loadPdf(bytes, { password: o.password });
  const font = await embedFont(lib, doc.getPage(0).doc, o.font ?? "helvetica");
  const san = makeSanitizer(new Set(font.getCharacterSet()));
  const size = o.fontSize ?? 10;
  const margin = o.margin ?? 28;
  const [r, g, b] = hexToRgb(o.color ?? "#333333");
  const total = doc.getPageCount();
  const target = new Set(o.pages ?? doc.getPageIndices().map((i) => i + 1));
  doc.getPages().forEach((page, i) => {
    if (!target.has(i + 1)) return;
    const stamps = o.stamps(i + 1, total).filter((s) => s.text.trim());
    if (!stamps.length) return;
    const frame = pageFrame(page);
    isolate(lib, page);
    for (const s of stamps) {
      const text = san.sanitize(s.text.replace(/\s*\n\s*/g, " "));
      const w = font.widthOfTextAtSize(text, size);
      const vx = s.h === "left" ? margin : s.h === "right" ? frame.width - margin - w : (frame.width - w) / 2;
      const vy = s.v === "top" ? frame.height - margin - size * 0.8 : margin;
      const p = frame.toPdf(vx, vy);
      page.drawText(text, { x: p.x, y: p.y, size, font, color: rgb(r, g, b), rotate: degrees(frame.rotation) });
    }
  });
  return { bytes: await savePdf(doc), replacedChars: san.count() };
}

export type NumberStyle = "arabic" | "roman" | "roman-upper" | "alpha";

export function formatNumberStyle(n: number, style: NumberStyle): string {
  if (style === "arabic") return String(n);
  if (style === "alpha") {
    let s = "";
    let x = n;
    while (x > 0) {
      x--;
      s = String.fromCharCode(97 + (x % 26)) + s;
      x = Math.floor(x / 26);
    }
    return s;
  }
  const table: [number, string][] = [
    [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
    [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
  ];
  let s = "";
  let x = n;
  for (const [v, sym] of table) while (x >= v) {
    s += sym;
    x -= v;
  }
  return style === "roman-upper" ? s.toUpperCase() : s;
}

/**
 * Expands tokens in a header/footer/page-number template:
 * {n} / {page} page number, {total} page count, {date}, {title}, {filename}.
 */
export function expandTemplate(
  tpl: string,
  vars: { page: number; total: number; date?: string; title?: string; filename?: string; style?: NumberStyle },
): string {
  const style = vars.style ?? "arabic";
  return tpl
    .replace(/\{(n|page)\}/gi, formatNumberStyle(vars.page, style))
    .replace(/\{total\}/gi, formatNumberStyle(vars.total, style))
    .replace(/\{date\}/gi, vars.date ?? "")
    .replace(/\{title\}/gi, vars.title ?? "")
    .replace(/\{filename\}/gi, vars.filename ?? "");
}
