/**
 * Spreadsheet (XLSX/XLS/ODS/CSV) → PDF. Cells are read as their formatted display text with
 * SheetJS and drawn as a table with pdf-lib. Cell colours, fonts, merged cells, images and
 * charts are not reproduced.
 */
import type { PDFFont, PDFPage } from "@cantoo/pdf-lib";
import { makeSanitizer, PAGE_SIZES } from "./layout";
import { pdfLib } from "./load";

export interface SheetData {
  name: string;
  rows: string[][];
}

/** Reads every sheet as formatted text rows, trimming empty trailing rows/columns. */
export async function readWorkbook(data: ArrayBuffer | Uint8Array): Promise<SheetData[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(data instanceof Uint8Array ? data : new Uint8Array(data), { type: "array", cellDates: true });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "", blankrows: true });
    return { name, rows: trimGrid(raw.map((r) => r.map((c) => (c == null ? "" : String(c))))) };
  });
}

export function trimGrid(rows: string[][]): string[][] {
  let last = rows.length - 1;
  while (last >= 0 && rows[last].every((c) => !c.trim())) last--;
  const kept = rows.slice(0, last + 1);
  let width = 0;
  for (const r of kept) for (let i = r.length - 1; i >= 0; i--) if (r[i].trim()) { width = Math.max(width, i + 1); break; }
  return kept.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
}

export interface SheetPdfOptions {
  pageSize: keyof typeof PAGE_SIZES;
  orientation: "portrait" | "landscape";
  gridlines: boolean;
  repeatHeader: boolean;
  /** Shrink the font so all columns fit the page width; otherwise extra columns continue on following pages. */
  fitWidth: boolean;
  fontSize: number;
  sheetTitles: boolean;
}

export const defaultSheetPdfOptions: SheetPdfOptions = {
  pageSize: "a4",
  orientation: "landscape",
  gridlines: true,
  repeatHeader: true,
  fitWidth: true,
  fontSize: 9,
  sheetTitles: true,
};

const NUM = /^[-+]?[$€£¥₹]?\s?[\d,]*\.?\d+%?$/;

/** Splits column indices into chunks that each fit `avail` points. */
export function chunkColumns(widths: number[], avail: number): number[][] {
  const chunks: number[][] = [];
  let cur: number[] = [];
  let w = 0;
  widths.forEach((cw, i) => {
    if (cur.length && w + cw > avail) {
      chunks.push(cur);
      cur = [];
      w = 0;
    }
    cur.push(i);
    w += cw;
  });
  if (cur.length) chunks.push(cur);
  return chunks;
}

export async function sheetsToPdf(sheets: SheetData[], opts: SheetPdfOptions): Promise<{ bytes: Uint8Array; pages: number; replacedChars: number }> {
  const { PDFDocument, StandardFonts, rgb } = await pdfLib();
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const san = makeSanitizer(new Set(font.getCharacterSet()));
  const [a, b] = PAGE_SIZES[opts.pageSize] ?? PAGE_SIZES.a4;
  const [pw, ph] = opts.orientation === "landscape" ? [Math.max(a, b), Math.min(a, b)] : [Math.min(a, b), Math.max(a, b)];
  const margin = 36;
  const contentW = pw - margin * 2;
  const footerH = 16;
  const grey = rgb(0.75, 0.75, 0.75);
  const text = rgb(0.1, 0.1, 0.1);

  const fit = (f: PDFFont, s: string, size: number, maxW: number) => {
    if (f.widthOfTextAtSize(s, size) <= maxW) return s;
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (f.widthOfTextAtSize(s.slice(0, mid) + "…", size) <= maxW) lo = mid;
      else hi = mid - 1;
    }
    return lo ? s.slice(0, lo) + "…" : "";
  };

  const pagesBySheet: { page: PDFPage; sheet: string }[] = [];

  for (const sheet of sheets) {
    const rows = sheet.rows.map((r) => r.map((c) => san.sanitize(c).replace(/\s*\n\s*/g, " ")));
    if (!rows.length) continue;
    const cols = rows[0].length;
    const pad = 3;
    const natural = Array.from({ length: cols }, (_, c) =>
      Math.min(260, Math.max(18, ...rows.map((r, i) => (i === 0 && opts.repeatHeader ? bold : font).widthOfTextAtSize(r[c] ?? "", opts.fontSize) + pad * 2))),
    );
    const total = natural.reduce((s, w) => s + w, 0);
    let size = opts.fontSize;
    let widths = natural;
    let chunks: number[][];
    if (opts.fitWidth && total > contentW) {
      const scale = contentW / total;
      size = Math.max(4, opts.fontSize * scale);
      widths = natural.map((w) => w * scale);
      chunks = [widths.map((_, i) => i)];
    } else chunks = chunkColumns(widths, contentW);
    const rowH = size * 1.55;
    const usableTop = ph - margin;

    for (const chunk of chunks) {
      let page: PDFPage | null = null;
      let y = 0;
      const startPage = () => {
        page = doc.addPage([pw, ph]);
        pagesBySheet.push({ page, sheet: sheet.name });
        y = usableTop;
        if (opts.sheetTitles) {
          const title = sheets.length > 1 || chunks.length > 1 ? `${san.sanitize(sheet.name)}${chunks.length > 1 ? ` (columns ${chunk[0] + 1}–${chunk[chunk.length - 1] + 1})` : ""}` : san.sanitize(sheet.name);
          page.drawText(fit(bold, title, 11, contentW), { x: margin, y: y - 11, size: 11, font: bold, color: text });
          y -= 20;
        }
      };
      const drawRow = (r: string[], isHeader: boolean) => {
        if (!page || y - rowH < margin + footerH) {
          startPage();
          if (opts.repeatHeader && !isHeader && rows.length > 1) drawRow(rows[0], true);
        }
        const p = page as unknown as PDFPage;
        let x = margin;
        for (const c of chunk) {
          const w = widths[c];
          if (isHeader) p.drawRectangle({ x, y: y - rowH, width: w, height: rowH, color: rgb(0.92, 0.92, 0.92) });
          if (opts.gridlines) p.drawRectangle({ x, y: y - rowH, width: w, height: rowH, borderColor: grey, borderWidth: 0.4 });
          const f = isHeader ? bold : font;
          const s = fit(f, r[c] ?? "", size, w - pad * 2);
          if (s) {
            const tw = f.widthOfTextAtSize(s, size);
            const tx = !isHeader && NUM.test(s.trim()) ? x + w - pad - tw : x + pad;
            p.drawText(s, { x: tx, y: y - rowH + (rowH - size) / 2 + size * 0.22, size, font: f, color: text });
          }
          x += w;
        }
        y -= rowH;
      };
      rows.forEach((r, i) => drawRow(r, opts.repeatHeader && i === 0));
    }
  }

  if (!pagesBySheet.length) throw new Error("The selected sheets are empty.");
  const counts = new Map<string, number>();
  for (const { sheet } of pagesBySheet) counts.set(sheet, (counts.get(sheet) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (const { page, sheet } of pagesBySheet) {
    const n = (seen.get(sheet) ?? 0) + 1;
    seen.set(sheet, n);
    const label = `${san.sanitize(sheet)} · page ${n} of ${counts.get(sheet)}`;
    page.drawText(label, { x: margin, y: margin - 4, size: 7.5, font, color: rgb(0.45, 0.45, 0.45) });
  }
  doc.setCreator("UtilityHub");
  doc.setProducer("UtilityHub");
  return { bytes: await doc.save(), pages: doc.getPageCount(), replacedChars: san.count() };
}
