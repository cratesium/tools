/**
 * Text extraction primitives built on PDF.js text content. The pure functions (line grouping,
 * paragraphs, table clustering) take plain items so they can be unit-tested without PDF.js.
 * Coordinates are PDF user space: origin bottom-left, y grows upwards, y = baseline.
 */

export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName?: string;
  /** PDF.js marks the last item of a visual line. */
  hasEOL?: boolean;
}

export interface PageText {
  page: number;
  width: number;
  height: number;
  items: TextItem[];
}

export interface TextLine {
  text: string;
  x: number;
  xEnd: number;
  y: number;
  fontSize: number;
  items: TextItem[];
}

export interface Paragraph {
  text: string;
  fontSize: number;
  x: number;
  y: number;
  lines: TextLine[];
  /** 1–3 when the paragraph looks like a heading (larger than body text), else 0. */
  headingLevel: number;
}

/** Minimal structural type for a PDF.js document so node tests can pass the legacy build. */
export interface PdfjsDocLike {
  numPages: number;
  getPage(n: number): Promise<{
    getViewport(o: { scale: number }): { width: number; height: number; transform?: number[] };
    getTextContent(o?: Record<string, unknown>): Promise<{ items: unknown[] }>;
  }>;
}

/** Reads one page's text items in PDF coordinates. */
export async function getPageText(doc: PdfjsDocLike, pageNumber: number): Promise<PageText> {
  const page = await doc.getPage(pageNumber);
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items: TextItem[] = [];
  for (const raw of content.items) {
    const it = raw as { str?: string; transform?: number[]; width?: number; height?: number; fontName?: string; hasEOL?: boolean };
    if (typeof it.str !== "string" || !it.transform) continue;
    const [a, b, c, d, e, f] = it.transform;
    const fontSize = Math.hypot(c, d) || Math.hypot(a, b) || it.height || 10;
    if (!it.str && !it.hasEOL) continue;
    items.push({
      str: it.str,
      x: e,
      y: f,
      width: it.width ?? 0,
      height: it.height || fontSize,
      fontSize,
      fontName: it.fontName,
      hasEOL: it.hasEOL,
    });
  }
  return { page: pageNumber, width: vp.width, height: vp.height, items };
}

export async function getAllPageText(
  doc: PdfjsDocLike,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<PageText[]> {
  const pages: PageText[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    pages.push(await getPageText(doc, p));
    onProgress?.(p, doc.numPages);
  }
  return pages;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Groups items into visual lines (top to bottom), joining words with spaces where there is a gap. */
export function groupLines(items: TextItem[]): TextLine[] {
  const visible = items.filter((i) => i.str.length > 0);
  const sorted = [...visible].sort((p, q) => q.y - p.y || p.x - q.x);
  const lines: TextItem[][] = [];
  for (const it of sorted) {
    const tol = Math.max(1.5, it.fontSize * 0.45);
    const line = lines.find((l) => Math.abs(l[0].y - it.y) <= tol);
    if (line) line.push(it);
    else lines.push([it]);
  }
  const out = lines.map((l) => {
    l.sort((p, q) => p.x - q.x);
    let text = "";
    let prevEnd = -Infinity;
    for (const it of l) {
      const gap = it.x - prevEnd;
      const needsSpace =
        text.length > 0 && gap > it.fontSize * 0.18 && !/\s$/.test(text) && !/^\s/.test(it.str);
      text += (needsSpace ? " " : "") + it.str;
      prevEnd = Math.max(prevEnd, it.x + it.width);
    }
    const fontSize = median(l.map((i) => i.fontSize));
    return {
      text: text.replace(/\s+/g, " ").trim(),
      x: l[0].x,
      xEnd: Math.max(...l.map((i) => i.x + i.width)),
      y: median(l.map((i) => i.y)),
      fontSize,
      items: l,
    };
  });
  return out.filter((l) => l.text.length > 0).sort((p, q) => q.y - p.y || p.x - q.x);
}

/** Plain text of a page, one visual line per text line. */
export function pageToText(page: PageText): string {
  return groupLines(page.items)
    .map((l) => l.text)
    .join("\n");
}

/** Body font size of a set of lines (the size covering the most characters). */
export function bodyFontSize(lines: TextLine[]): number {
  const weight = new Map<number, number>();
  for (const l of lines) {
    const k = Math.round(l.fontSize * 2) / 2;
    weight.set(k, (weight.get(k) ?? 0) + l.text.length);
  }
  let best = 0;
  let bestW = -1;
  for (const [k, w] of weight) if (w > bestW) [best, bestW] = [k, w];
  return best || 11;
}

/**
 * Merges lines into paragraphs: a new paragraph starts on a larger vertical gap, a font size
 * change, or a line that ends well before the right margin (end of a paragraph).
 */
export function linesToParagraphs(lines: TextLine[], body = bodyFontSize(lines)): Paragraph[] {
  const paras: Paragraph[] = [];
  const rightEdge = lines.length ? Math.max(...lines.map((l) => l.xEnd)) : 0;
  let cur: TextLine[] = [];
  const flush = () => {
    if (!cur.length) return;
    const fontSize = median(cur.map((l) => l.fontSize));
    let text = "";
    for (const l of cur) {
      if (text.endsWith("-") && /^[a-z]/.test(l.text)) text = text.slice(0, -1) + l.text;
      else text += (text ? " " : "") + l.text;
    }
    const ratio = fontSize / body;
    const headingLevel = ratio >= 1.6 ? 1 : ratio >= 1.3 ? 2 : ratio >= 1.12 && text.length < 120 ? 3 : 0;
    paras.push({ text, fontSize, x: cur[0].x, y: cur[0].y, lines: cur, headingLevel });
    cur = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const prev = cur[cur.length - 1];
    if (prev) {
      const gap = prev.y - l.y;
      const lineHeight = Math.max(prev.fontSize, l.fontSize) * 1.25;
      const sizeChange = Math.abs(prev.fontSize - l.fontSize) > Math.max(0.8, body * 0.1);
      const bigGap = gap > lineHeight * 1.45 || gap < 0;
      const prevShort = prev.xEnd < rightEdge - body * 6;
      const bullet = /^([•▪◦‣·\-–*]|\d{1,3}[.)])\s/.test(l.text);
      if (sizeChange || bigGap || prevShort || bullet) flush();
    }
    cur.push(l);
  }
  flush();
  return paras;
}

export type Grid = string[][];

/**
 * Splits each line into cells at large horizontal gaps, then aligns cells to columns by
 * clustering their left edges across the page. Heuristic: works for ruled and whitespace-aligned
 * tables with consistent column starts.
 */
export function extractTableGrid(items: TextItem[], { minColumns = 2 }: { minColumns?: number } = {}): Grid {
  const lines = groupLines(items);
  type Cell = { x: number; xEnd: number; text: string };
  const rows: Cell[][] = lines.map((line) => {
    const cells: Cell[] = [];
    let cur: Cell | null = null;
    for (const it of line.items) {
      if (!it.str.trim()) {
        if (cur) cur.text += it.str;
        continue;
      }
      const gapLimit = it.fontSize * 1.1;
      if (cur && it.x - cur.xEnd <= gapLimit) {
        const space = it.x - cur.xEnd > it.fontSize * 0.18 && !/\s$/.test(cur.text) ? " " : "";
        cur.text += space + it.str;
        cur.xEnd = Math.max(cur.xEnd, it.x + it.width);
      } else {
        cur = { x: it.x, xEnd: it.x + it.width, text: it.str };
        cells.push(cur);
      }
    }
    return cells.map((c) => ({ ...c, text: c.text.replace(/\s+/g, " ").trim() })).filter((c) => c.text);
  });
  const tableRows = rows.filter((r) => r.length >= 1);
  if (!tableRows.length) return [];
  const multi = tableRows.filter((r) => r.length >= minColumns);
  const source = multi.length ? multi : tableRows;
  const fontSize = median(lines.map((l) => l.fontSize)) || 10;
  const starts = source.flatMap((r) => r.map((c) => c.x)).sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const x of starts) {
    const last = clusters[clusters.length - 1];
    if (last && x - last[last.length - 1] <= fontSize * 1.5) last.push(x);
    else clusters.push([x]);
  }
  const cols = clusters.map((c) => median(c));
  const colOf = (x: number) => {
    let best = 0;
    for (let i = 0; i < cols.length; i++) if (cols[i] <= x + fontSize * 0.75) best = i;
    return best;
  };
  return tableRows.map((r) => {
    const row: string[] = new Array(cols.length).fill("");
    for (const c of r) {
      const i = colOf(c.x);
      row[i] = row[i] ? `${row[i]} ${c.text}` : c.text;
    }
    return row;
  });
}

/** Drops columns that are empty in every row. */
export function compactGrid(grid: Grid): Grid {
  if (!grid.length) return grid;
  const width = Math.max(...grid.map((r) => r.length));
  const keep = Array.from({ length: width }, (_, i) => grid.some((r) => (r[i] ?? "").trim() !== ""));
  return grid.map((r) => r.filter((_, i) => keep[i]));
}

export function gridToCsv(grid: Grid, delimiter = ","): string {
  const esc = (v: string) => (/[",\n\r]/.test(v) || v.includes(delimiter) ? `"${v.replace(/"/g, '""')}"` : v);
  return grid.map((r) => r.map(esc).join(delimiter)).join("\r\n");
}
