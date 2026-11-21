/**
 * Quick JSON → CSV for pasted API responses: nested objects are flattened into
 * dot-path columns (user.address.city), arrays are either joined or indexed.
 * Pure, no dependencies.
 */

export type ArrayMode = "join" | "index" | "json";

export interface JsonToCsvOptions {
  delimiter?: string;
  arrayMode?: ArrayMode;
  /** Separator used when arrayMode = "join". */
  joinWith?: string;
  header?: boolean;
  /** Use CRLF line endings (RFC 4180). */
  crlf?: boolean;
  /** Path to the array of records inside the input, e.g. "data.items". Empty = auto. */
  path?: string;
}

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function scalar(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function flattenRecord(rec: unknown, arrayMode: ArrayMode = "join", joinWith = "; "): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (v: unknown, prefix: string) => {
    if (Array.isArray(v)) {
      if (arrayMode === "index") {
        if (!v.length) out[prefix] = "";
        v.forEach((x, i) => walk(x, prefix ? `${prefix}.${i}` : String(i)));
      } else if (arrayMode === "json") out[prefix] = JSON.stringify(v);
      else out[prefix] = v.every((x) => x === null || typeof x !== "object") ? v.map(scalar).join(joinWith) : JSON.stringify(v);
      return;
    }
    if (isPlainObject(v)) {
      const ks = Object.keys(v);
      if (!ks.length && prefix) out[prefix] = "";
      for (const k of ks) walk(v[k], prefix ? `${prefix}.${k}` : k);
      return;
    }
    out[prefix || "value"] = scalar(v);
  };
  walk(rec, "");
  return out;
}

function getPath(v: unknown, path: string): unknown {
  let cur = v;
  for (const part of path.split(".").filter(Boolean)) {
    if (cur && typeof cur === "object" && part in (cur as object)) cur = (cur as Record<string, unknown>)[part];
    else throw new Error(`Path "${path}" was not found in the JSON (stopped at "${part}")`);
  }
  return cur;
}

/** Finds the records: the value itself if it is an array, else the first array-of-objects property, else [value]. */
export function locateRecords(value: unknown, path?: string): { records: unknown[]; foundAt: string } {
  if (path && path.trim()) {
    const v = getPath(value, path.trim());
    return { records: Array.isArray(v) ? v : [v], foundAt: path.trim() };
  }
  if (Array.isArray(value)) return { records: value, foundAt: "" };
  if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (Array.isArray(v) && v.length && v.every(isPlainObject)) return { records: v, foundAt: k };
    }
    return { records: [value], foundAt: "" };
  }
  return { records: [value], foundAt: "" };
}

export function jsonToTable(value: unknown, opts: JsonToCsvOptions = {}): CsvTable & { foundAt: string } {
  const { records, foundAt } = locateRecords(value, opts.path);
  const flat = records.map((r) => flattenRecord(r, opts.arrayMode ?? "join", opts.joinWith ?? "; "));
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const f of flat)
    for (const k of Object.keys(f))
      if (!seen.has(k)) {
        seen.add(k);
        headers.push(k);
      }
  return { headers, rows: flat.map((f) => headers.map((h) => f[h] ?? "")), foundAt };
}

export function csvCell(v: string, delimiter: string): string {
  if (v === "") return "";
  if (v.includes(delimiter) || /["\r\n]/.test(v) || /^\s|\s$/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function tableToCsv(t: CsvTable, opts: JsonToCsvOptions = {}): string {
  const d = opts.delimiter ?? ",";
  const nl = opts.crlf ? "\r\n" : "\n";
  const lines: string[] = [];
  if (opts.header !== false) lines.push(t.headers.map((h) => csvCell(h, d)).join(d));
  for (const r of t.rows) lines.push(r.map((c) => csvCell(c, d)).join(d));
  return lines.join(nl);
}

export function jsonToCsv(value: unknown, opts: JsonToCsvOptions = {}): { csv: string; table: CsvTable; foundAt: string } {
  const t = jsonToTable(value, opts);
  return { csv: tableToCsv(t, opts), table: t, foundAt: t.foundAt };
}
