/**
 * A small flow-layout engine that turns structured blocks (headings, paragraphs, lists, tables,
 * images, code) into PDF pages with pdf-lib. Used by Word/HTML/EPUB/PowerPoint → PDF.
 *
 * Limitation (documented on those tools): text is set with the 14 standard PDF fonts
 * (Helvetica/Courier), which only cover Windows-1252 (Western European) characters. Other
 * characters are transliterated where possible and otherwise replaced with "?" and counted.
 */
import type { PDFDocument, PDFFont, PDFPage, RGB } from "@cantoo/pdf-lib";
import { pdfLib } from "./load";

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  link?: string;
}

export type Align = "left" | "center" | "right";

export type Block =
  | { type: "heading"; level: number; runs: Run[]; align?: Align }
  | { type: "paragraph"; runs: Run[]; align?: Align; size?: number }
  | { type: "list"; ordered: boolean; items: { runs: Run[]; depth: number }[]; start?: number }
  | { type: "pre"; text: string }
  | { type: "quote"; runs: Run[] }
  | { type: "image"; data: Uint8Array; mime: "image/png" | "image/jpeg"; width?: number; height?: number; alt?: string }
  | { type: "table"; rows: string[][]; header?: boolean }
  | { type: "hr" }
  | { type: "pagebreak" };

export interface LayoutOptions {
  /** Page size in points. Default A4 portrait. */
  pageSize?: [number, number];
  margin?: number;
  fontSize?: number;
  title?: string;
  author?: string;
  subject?: string;
}

export interface LayoutResult {
  bytes: Uint8Array;
  pages: number;
  /** Characters that could not be represented with the standard fonts. */
  replacedChars: number;
  skippedImages: number;
}

export const PAGE_SIZES: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
  a3: [841.89, 1190.55],
  a5: [419.53, 595.28],
};

const TRANSLIT: Record<string, string> = {
  " ": " ",
  " ": " ",
  " ": " ",
  " ": " ",
  "​": "",
  "‌": "",
  "‍": "",
  "﻿": "",
  "‐": "-",
  "‑": "-",
  "‒": "-",
  "−": "-",
  "′": "'",
  "″": '"',
  "●": "•",
  "▪": "•",
  "◦": "•",
  "‣": "•",
  "→": "->",
  "←": "<-",
  "≤": "<=",
  "≥": ">=",
  "≠": "!=",
  "✓": "v",
  "✔": "v",
  "­": "",
};

/** Builds a sanitizer that maps text into a font's character set, counting replacements. */
export function makeSanitizer(charset: Set<number>) {
  let replaced = 0;
  const fn = (text: string): string => {
    let out = "";
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (ch === "\n") {
        out += ch;
        continue;
      }
      if (ch === "\t") {
        out += "    ";
        continue;
      }
      if (charset.has(cp)) {
        out += ch;
        continue;
      }
      if (TRANSLIT[ch] !== undefined) {
        out += TRANSLIT[ch];
        continue;
      }
      if (cp < 32) continue;
      const base = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
      if (base && [...base].every((c) => charset.has(c.codePointAt(0)!))) {
        out += base;
        continue;
      }
      replaced++;
      out += "?";
    }
    return out;
  };
  return { sanitize: fn, count: () => replaced };
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
  monoBold: PDFFont;
}

interface Token {
  text: string;
  font: PDFFont;
  size: number;
  color: RGB;
  space: boolean;
  newline: boolean;
  underline: boolean;
}

export async function layoutBlocks(blocks: Block[], opts: LayoutOptions = {}): Promise<LayoutResult> {
  const lib = await pdfLib();
  const { PDFDocument, StandardFonts, rgb } = lib;
  const doc: PDFDocument = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
    mono: await doc.embedFont(StandardFonts.Courier),
    monoBold: await doc.embedFont(StandardFonts.CourierBold),
  };
  const charset = new Set(fonts.regular.getCharacterSet());
  const san = makeSanitizer(charset);
  const [pw, ph] = opts.pageSize ?? PAGE_SIZES.a4;
  const margin = opts.margin ?? 56;
  const base = opts.fontSize ?? 11;
  const contentW = pw - margin * 2;
  const black = rgb(0.1, 0.1, 0.1);
  const linkBlue = rgb(0.1, 0.3, 0.7);
  const grey = rgb(0.45, 0.45, 0.45);
  let skippedImages = 0;

  let page: PDFPage = doc.addPage([pw, ph]);
  let y = ph - margin;
  let pageHasContent = false;
  const newPage = () => {
    page = doc.addPage([pw, ph]);
    y = ph - margin;
    pageHasContent = false;
  };
  const ensure = (h: number) => {
    if (y - h < margin && pageHasContent) newPage();
  };

  const pickFont = (r: Run, forceBold = false): PDFFont => {
    const bold = forceBold || !!r.bold;
    if (r.code) return bold ? fonts.monoBold : fonts.mono;
    if (bold && r.italic) return fonts.boldItalic;
    if (bold) return fonts.bold;
    if (r.italic) return fonts.italic;
    return fonts.regular;
  };

  const tokenize = (runs: Run[], size: number, forceBold = false, forceItalic = false): Token[] => {
    const tokens: Token[] = [];
    for (const r of runs) {
      const font = pickFont(forceItalic ? { ...r, italic: true } : r, forceBold);
      const color = r.link ? linkBlue : black;
      const text = san.sanitize(r.text);
      for (const part of text.split(/(\n|[ ]+)/)) {
        if (!part) continue;
        if (part === "\n") tokens.push({ text: "", font, size, color, space: false, newline: true, underline: false });
        else if (/^ +$/.test(part)) tokens.push({ text: " ", font, size, color, space: true, newline: false, underline: false });
        else tokens.push({ text: part, font, size, color, space: false, newline: false, underline: !!r.link });
      }
    }
    return tokens;
  };

  const width = (t: Token) => t.font.widthOfTextAtSize(t.text, t.size);

  /** Breaks tokens into lines no wider than maxW. Over-long words are split by characters. */
  const breakLines = (tokens: Token[], maxW: number): Token[][] => {
    const lines: Token[][] = [];
    let line: Token[] = [];
    let w = 0;
    const push = () => {
      while (line.length && line[line.length - 1].space) line.pop();
      lines.push(line);
      line = [];
      w = 0;
    };
    for (let t of tokens) {
      if (t.newline) {
        push();
        continue;
      }
      if (t.space) {
        if (line.length) {
          line.push(t);
          w += width(t);
        }
        continue;
      }
      let tw = width(t);
      if (w + tw > maxW && line.length) push();
      if (tw > maxW) {
        let chunk = "";
        for (const ch of t.text) {
          const next = chunk + ch;
          if (t.font.widthOfTextAtSize(next, t.size) > maxW && chunk) {
            line.push({ ...t, text: chunk });
            push();
            chunk = ch;
          } else chunk = next;
        }
        t = { ...t, text: chunk };
        tw = width(t);
      }
      line.push(t);
      w += tw;
    }
    if (line.length) push();
    return lines;
  };

  const drawLine = (line: Token[], x: number, baseline: number, maxW: number, align: Align) => {
    const lw = line.reduce((s, t) => s + width(t), 0);
    let cx = align === "center" ? x + (maxW - lw) / 2 : align === "right" ? x + maxW - lw : x;
    let i = 0;
    while (i < line.length) {
      const t = line[i];
      let text = t.text;
      let j = i + 1;
      while (j < line.length && line[j].font === t.font && line[j].color === t.color && line[j].underline === t.underline) {
        text += line[j].text;
        j++;
      }
      const w = t.font.widthOfTextAtSize(text, t.size);
      if (text.trim()) page.drawText(text, { x: cx, y: baseline, size: t.size, font: t.font, color: t.color });
      if (t.underline && text.trim())
        page.drawLine({ start: { x: cx, y: baseline - 1.5 }, end: { x: cx + w, y: baseline - 1.5 }, thickness: 0.5, color: t.color });
      cx += w;
      i = j;
    }
  };

  const flow = (
    tokens: Token[],
    { x = margin, maxW = contentW, size = base, lead = 1.38, align = "left" as Align, before, decorate }: {
      x?: number;
      maxW?: number;
      size?: number;
      lead?: number;
      align?: Align;
      before?: (firstLineBaseline: number) => void;
      decorate?: (top: number, bottom: number) => void;
    } = {},
  ) => {
    const lines = breakLines(tokens, maxW);
    const lh = size * lead;
    lines.forEach((line, idx) => {
      ensure(lh);
      const top = y;
      const baseline = y - size * 1.0;
      if (idx === 0) before?.(baseline);
      drawLine(line, x, baseline, maxW, align);
      y -= lh;
      decorate?.(top, y);
      pageHasContent = true;
    });
  };

  const gap = (h: number) => {
    if (!pageHasContent) return;
    y -= h;
    if (y < margin) newPage();
  };

  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        const scale = [2, 1.6, 1.3, 1.15, 1.05, 1][Math.min(5, Math.max(0, block.level - 1))];
        const size = base * scale;
        gap(size * 0.8);
        ensure(size * 3);
        flow(tokenize(block.runs, size, true), { size, lead: 1.25, align: block.align });
        y -= size * 0.35;
        break;
      }
      case "paragraph": {
        const size = block.size ?? base;
        flow(tokenize(block.runs, size), { size, align: block.align });
        y -= size * 0.6;
        break;
      }
      case "quote": {
        const tokens = tokenize(block.runs, base, false, true);
        flow(tokens, {
          x: margin + 16,
          maxW: contentW - 16,
          decorate: (top, bottom) =>
            page.drawLine({ start: { x: margin + 4, y: top }, end: { x: margin + 4, y: bottom }, thickness: 2, color: rgb(0.8, 0.8, 0.8) }),
        });
        y -= base * 0.6;
        break;
      }
      case "list": {
        let n = block.start ?? 1;
        for (const item of block.items) {
          const indent = 18 + item.depth * 18;
          const marker = block.ordered ? `${n++}.` : item.depth % 2 ? "-" : "•";
          flow(tokenize(item.runs, base), {
            x: margin + indent,
            maxW: contentW - indent,
            before: (baseline) => {
              const mw = fonts.regular.widthOfTextAtSize(marker, base);
              page.drawText(marker, { x: margin + indent - mw - 5, y: baseline, size: base, font: fonts.regular, color: black });
            },
          });
          y -= base * 0.2;
        }
        y -= base * 0.4;
        break;
      }
      case "pre": {
        const size = base * 0.85;
        const tokens: Token[] = [];
        for (const [i, raw] of san.sanitize(block.text.replace(/\n$/, "")).split("\n").entries()) {
          if (i > 0) tokens.push({ text: "", font: fonts.mono, size, color: black, space: false, newline: true, underline: false });
          tokens.push({ text: raw.replace(/ /g, " ") || " ", font: fonts.mono, size, color: black, space: false, newline: false, underline: false });
        }
        //   keeps indentation; Courier maps it to a space glyph in WinAnsi.
        flow(tokens, {
          x: margin + 8,
          maxW: contentW - 16,
          size,
          lead: 1.3,
          decorate: (top, bottom) =>
            page.drawRectangle({ x: margin, y: bottom, width: 3, height: top - bottom, color: rgb(0.85, 0.85, 0.85) }),
        });
        y -= base * 0.6;
        break;
      }
      case "hr": {
        gap(base * 0.4);
        ensure(base);
        page.drawLine({ start: { x: margin, y }, end: { x: pw - margin, y }, thickness: 0.75, color: rgb(0.75, 0.75, 0.75) });
        y -= base;
        pageHasContent = true;
        break;
      }
      case "pagebreak": {
        if (pageHasContent) newPage();
        break;
      }
      case "image": {
        let img;
        try {
          img = block.mime === "image/png" ? await doc.embedPng(block.data) : await doc.embedJpg(block.data);
        } catch {
          skippedImages++;
          break;
        }
        const natW = block.width ?? img.width * 0.75;
        const natH = block.height ?? img.height * 0.75;
        const maxH = ph - margin * 2;
        const s = Math.min(1, contentW / natW, maxH / natH);
        const w = natW * s;
        const h = natH * s;
        ensure(h + 4);
        page.drawImage(img, { x: margin, y: y - h, width: w, height: h });
        y -= h + base * 0.6;
        pageHasContent = true;
        break;
      }
      case "table": {
        const rows = block.rows.filter((r) => r.length);
        if (!rows.length) break;
        const cols = Math.max(...rows.map((r) => r.length));
        const size = base * 0.9;
        const pad = 4;
        const clean = rows.map((r) => Array.from({ length: cols }, (_, i) => san.sanitize(r[i] ?? "").replace(/\n/g, " ")));
        const natural = Array.from({ length: cols }, (_, c) =>
          Math.min(220, Math.max(24, ...clean.map((r) => fonts.regular.widthOfTextAtSize(r[c], size) + pad * 2))),
        );
        const total = natural.reduce((a, b) => a + b, 0);
        const widths = natural.map((w) => (w / total) * contentW);
        const lh = size * 1.3;
        const renderRow = (cells: string[], isHeader: boolean) => {
          const font = isHeader ? fonts.bold : fonts.regular;
          const wrapped = cells.map((cell, c) =>
            breakLines(
              tokenize([{ text: cell, bold: isHeader }], size).map((t) => ({ ...t, font: t.space ? t.font : font })),
              widths[c] - pad * 2,
            ),
          );
          const height = Math.max(1, ...wrapped.map((l) => l.length)) * lh + pad * 2;
          if (y - height < margin && pageHasContent) {
            newPage();
            if (block.header && !isHeader) renderRow(clean[0], true);
          }
          let x = margin;
          for (let c = 0; c < cols; c++) {
            page.drawRectangle({
              x,
              y: y - height,
              width: widths[c],
              height,
              borderColor: rgb(0.7, 0.7, 0.7),
              borderWidth: 0.5,
              color: isHeader ? rgb(0.93, 0.93, 0.93) : undefined,
            });
            wrapped[c].forEach((line, i) => drawLine(line, x + pad, y - pad - size - i * lh + size * 0.15, widths[c] - pad * 2, "left"));
            x += widths[c];
          }
          y -= height;
          pageHasContent = true;
        };
        clean.forEach((r, i) => renderRow(r, !!block.header && i === 0));
        y -= base * 0.8;
        break;
      }
    }
  }
  void grey;
  if (opts.title) doc.setTitle(san.sanitize(opts.title));
  if (opts.author) doc.setAuthor(opts.author);
  if (opts.subject) doc.setSubject(opts.subject);
  doc.setProducer("UtilityHub");
  doc.setCreator("UtilityHub");
  const bytes = await doc.save();
  return { bytes, pages: doc.getPageCount(), replacedChars: san.count(), skippedImages };
}

/** Plain text → blocks: blank lines separate paragraphs. */
export function textToBlocks(text: string): Block[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ type: "paragraph" as const, runs: [{ text: p }] }));
}
