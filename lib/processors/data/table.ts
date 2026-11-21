/** In-memory table model shared by every data tool. */

export type Cell = string | number | boolean | null;

export interface Table {
  headers: string[];
  rows: Cell[][];
}

export function cellText(v: Cell | undefined): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  return String(v);
}

/** Makes header names non-empty and unique ("Name", "Name_2", …). */
export function uniqueHeaders(raw: Cell[], width: number): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < width; i++) {
    const base = cellText(raw[i]).trim() || `Column ${i + 1}`;
    let h = base;
    let k = 2;
    while (used.has(h.toLowerCase())) h = `${base}_${k++}`;
    used.add(h.toLowerCase());
    out.push(h);
  }
  return out;
}

/** Builds a rectangular Table from raw rows. */
export function toTable(raw: Cell[][], hasHeader = true): Table {
  const width = raw.reduce((m, r) => Math.max(m, r.length), 0);
  const body = hasHeader ? raw.slice(1) : raw;
  const headers = hasHeader ? uniqueHeaders(raw[0] ?? [], width) : uniqueHeaders([], width);
  const rows = body.map((r) => {
    if (r.length === width) return r;
    const c = r.slice();
    while (c.length < width) c.push("");
    return c;
  });
  return { headers, rows };
}

/** Header row + body rows, ready for CSV/XLSX serialization. */
export function tableToRows(t: Table): Cell[][] {
  return [t.headers, ...t.rows];
}

/** Converts numeric-looking text to numbers, preserving leading zeros, long ids and booleans as text. */
export function inferCell(v: Cell): Cell {
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (s === "") return v;
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(s)) {
    const digits = s.replace(/^-/, "").replace(/\.\d*$/, "");
    if (digits.length > 15) return v; // would lose precision (card numbers, ids)
    return Number(s);
  }
  if (/^-?\.\d+$/.test(s)) return Number(s);
  return v;
}

export function inferTable(t: Table): Table {
  return { headers: t.headers, rows: t.rows.map((r) => r.map(inferCell)) };
}

/** Case-sensitive, then case-insensitive header lookup. */
export function findColumn(headers: string[], name: string): number {
  const i = headers.indexOf(name);
  if (i >= 0) return i;
  const lower = name.trim().toLowerCase();
  return headers.findIndex((h) => h.trim().toLowerCase() === lower);
}

/** Filename-safe version of an arbitrary value. */
export function safeFileName(s: string, fallback = "file"): string {
  const cleaned = s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 80);
  return cleaned || fallback;
}
