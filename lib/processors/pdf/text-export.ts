/** Plain-text export of extracted PDF text (Extract Text from PDF). */
import { bodyFontSize, groupLines, linesToParagraphs, type PageText } from "./text";

export type TextMode = "layout" | "lines" | "paragraphs";

/**
 * Visual layout: each line is rebuilt on a character grid so column alignment (tables, indents)
 * survives in a monospaced view.
 */
export function pageToLayoutText(page: PageText): string {
  const lines = groupLines(page.items);
  if (!lines.length) return "";
  const minX = Math.min(...lines.map((l) => l.x));
  const charW = (bodyFontSize(lines) || 10) * 0.5;
  const out: string[] = [];
  let prevY: number | null = null;
  for (const line of lines) {
    if (prevY !== null && prevY - line.y > line.fontSize * 2.2) out.push("");
    let s = "";
    let prevEnd = -Infinity;
    for (const it of line.items) {
      if (!it.str) continue;
      const col = Math.max(0, Math.round((it.x - minX) / charW));
      if (col > s.length) s += " ".repeat(col - s.length);
      else if (s.length && it.x - prevEnd > it.fontSize * 0.18 && !/\s$/.test(s) && !/^\s/.test(it.str)) s += " ";
      s += it.str;
      prevEnd = it.x + it.width;
    }
    out.push(s.replace(/\s+$/, ""));
    prevY = line.y;
  }
  return out.join("\n");
}

export function pageToParagraphText(page: PageText): string {
  return linesToParagraphs(groupLines(page.items))
    .map((p) => p.text)
    .join("\n\n");
}

export function pageToLinesText(page: PageText): string {
  return groupLines(page.items)
    .map((l) => l.text)
    .join("\n");
}

export function pagesToText(pages: PageText[], { mode = "lines", separators = true }: { mode?: TextMode; separators?: boolean } = {}): string {
  const fn = mode === "layout" ? pageToLayoutText : mode === "paragraphs" ? pageToParagraphText : pageToLinesText;
  return pages
    .map((p) => {
      const body = fn(p);
      return separators ? `--- Page ${p.page} ---\n${body}` : body;
    })
    .join(separators ? "\n\n" : "\n\n")
    .trim()
    .concat("\n");
}

/** Pages whose text layer is empty: usually scans that need OCR. */
export function emptyPages(pages: PageText[]): number[] {
  return pages.filter((p) => !p.items.some((i) => i.str.trim())).map((p) => p.page);
}
