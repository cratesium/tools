/**
 * Page-range parsing shared by every PDF tool that lets the user pick pages.
 * Accepts "1-3, 5, 8-", "-4", "10-7" (descending), "last", "odd", "even" and "all".
 * Page numbers are 1-based in the input and in the output.
 */
export function parsePageRanges(input: string, total: number, { dedupe = true }: { dedupe?: boolean } = {}): number[] {
  if (!Number.isInteger(total) || total < 1) throw new RangeError("The document has no pages.");
  const text = input.trim().toLowerCase();
  if (!text || text === "all" || text === "*") return Array.from({ length: total }, (_, i) => i + 1);
  const out: number[] = [];
  const num = (s: string, part: string): number => {
    if (s === "last" || s === "end" || s === "z") return total;
    if (!/^\d+$/.test(s)) throw new RangeError(`"${part}" is not a valid page or range.`);
    const n = Number(s);
    if (n < 1 || n > total) throw new RangeError(`Page ${n} does not exist (the document has ${total} page${total === 1 ? "" : "s"}).`);
    return n;
  };
  for (const raw of text.split(/[,;]+/)) {
    const part = raw.trim();
    if (!part) continue;
    if (part === "odd" || part === "even") {
      for (let p = part === "odd" ? 1 : 2; p <= total; p += 2) out.push(p);
      continue;
    }
    const m = part.match(/^([^-\s]*)\s*-\s*([^-\s]*)$/);
    if (m) {
      const a = m[1] ? num(m[1], part) : 1;
      const b = m[2] ? num(m[2], part) : total;
      if (a <= b) for (let p = a; p <= b; p++) out.push(p);
      else for (let p = a; p >= b; p--) out.push(p);
    } else {
      out.push(num(part, part));
    }
  }
  if (!out.length) throw new RangeError("No pages selected.");
  return dedupe ? [...new Set(out)] : out;
}

/** Compresses a list of 1-based page numbers into a readable range string, e.g. [1,2,3,5] → "1-3, 5". */
export function formatPageRanges(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    let end = start;
    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) end = sorted[++i];
    parts.push(start === end ? String(start) : `${start}-${end}`);
  }
  return parts.join(", ");
}
