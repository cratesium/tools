/** Pure table operations: deduplicate, sort, filter, merge, split. */

import { cellText, findColumn, safeFileName, type Cell, type Table } from "./table";

/* ------------------------------------------------------------------ values */

/** Parses numbers such as "1,234.5", "-3", "$12", "45%", "1e3". Returns null when not numeric. */
export function parseNumber(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean" || v == null) return null;
  let s = v.trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/^[$€£¥₹]\s*/, "").replace(/\s*[$€£¥₹%]$/, "");
  if (/^[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?([eE][-+]?\d+)?$/.test(s) && /\d/.test(s)) {
    const n = Number(s.replace(/,/g, ""));
    if (!Number.isFinite(n)) return null;
    return neg ? -n : n;
  }
  return null;
}

/**
 * Parses dates in ISO form (2024-03-05, 2024-03-05T10:00, 2024/03/05) and
 * textual forms that Date.parse understands ("5 Mar 2024", "March 5, 2024").
 * Ambiguous numeric forms like 03/05/2024 are read as month/day/year.
 */
export function parseDate(v: Cell): number | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || !/\d/.test(s) || /^[-+]?\d+(\.\d+)?$/.test(s)) return null;
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (iso) {
    const [, y, m, d, hh = "0", mm = "0", ss = "0"] = iso;
    const t = Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss);
    return Number.isFinite(t) && +m >= 1 && +m <= 12 && +d >= 1 && +d <= 31 ? t : null;
  }
  const mdy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (mdy) {
    const [, a, b, y] = mdy;
    const t = Date.UTC(+y, +a - 1, +b);
    return +a >= 1 && +a <= 12 && +b >= 1 && +b <= 31 ? t : null;
  }
  if (!/[a-z]/i.test(s)) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

export type ColumnType = "number" | "date" | "text";

/** Detects a column's type from its non-empty values. */
export function detectColumnType(t: Table, col: number, sample = 1000): ColumnType {
  let nums = 0;
  let dates = 0;
  let total = 0;
  for (const r of t.rows) {
    const v = r[col];
    if (v == null || cellText(v).trim() === "") continue;
    total++;
    if (parseNumber(v) != null) nums++;
    else if (parseDate(v) != null) dates++;
    else return "text";
    if (total >= sample) break;
  }
  if (!total) return "text";
  if (nums === total) return "number";
  if (dates === total) return "date";
  return "text";
}

/* -------------------------------------------------------------- dedupe */

export interface DedupeOptions {
  /** Column indexes that form the key. Empty = all columns. */
  columns?: number[];
  ignoreCase?: boolean;
  /** Trim and collapse internal whitespace before comparing. */
  normalizeWhitespace?: boolean;
  keep?: "first" | "last";
}

export interface DedupeResult {
  table: Table;
  removed: number;
  /** Number of distinct keys that had more than one row. */
  duplicateGroups: number;
}

export function dedupe(t: Table, opts: DedupeOptions = {}): DedupeResult {
  const cols = opts.columns && opts.columns.length ? opts.columns : t.headers.map((_, i) => i);
  const norm = (v: Cell) => {
    let s = cellText(v);
    if (opts.normalizeWhitespace) s = s.replace(/\s+/g, " ").trim();
    if (opts.ignoreCase) s = s.toLowerCase();
    return s;
  };
  const keyOf = (r: Cell[]) => JSON.stringify(cols.map((c) => norm(r[c] ?? null)));
  const counts = new Map<string, number>();
  const keepIndex = new Map<string, number>();
  t.rows.forEach((r, i) => {
    const k = keyOf(r);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (opts.keep === "last" || !keepIndex.has(k)) keepIndex.set(k, i);
  });
  const rows = t.rows.filter((r, i) => keepIndex.get(keyOf(r)) === i);
  let groups = 0;
  for (const n of counts.values()) if (n > 1) groups++;
  return { table: { headers: t.headers, rows }, removed: t.rows.length - rows.length, duplicateGroups: groups };
}

/* ---------------------------------------------------------------- sort */

export interface SortKey {
  column: number;
  direction: "asc" | "desc";
  type?: ColumnType | "auto";
}

export function sortTable(t: Table, keys: SortKey[], opts: { caseSensitive?: boolean } = {}): Table {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: opts.caseSensitive ? "variant" : "accent" });
  const resolved = keys
    .filter((k) => k.column >= 0 && k.column < t.headers.length)
    .map((k) => ({ ...k, type: !k.type || k.type === "auto" ? detectColumnType(t, k.column) : k.type }));
  // Pre-compute sort values once per row.
  const decorated = t.rows.map((row, idx) => ({
    row,
    idx,
    vals: resolved.map((k) => {
      const v = row[k.column] ?? null;
      if (cellText(v).trim() === "") return null;
      if (k.type === "number") return parseNumber(v);
      if (k.type === "date") return parseDate(v);
      return cellText(v);
    }),
  }));
  decorated.sort((a, b) => {
    for (let i = 0; i < resolved.length; i++) {
      const x = a.vals[i];
      const y = b.vals[i];
      // Empty / unparseable values always sort last, regardless of direction.
      if (x == null && y == null) continue;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : collator.compare(String(x), String(y));
      if (c !== 0) return resolved[i].direction === "desc" ? -c : c;
    }
    return a.idx - b.idx;
  });
  return { headers: t.headers, rows: decorated.map((d) => d.row) };
}

/* -------------------------------------------------------------- filter */

export type FilterOp =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "regex"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "empty"
  | "not_empty";

export const FILTER_OPS: { value: FilterOp; label: string; args: 0 | 1 | 2 }[] = [
  { value: "equals", label: "equals", args: 1 },
  { value: "not_equals", label: "does not equal", args: 1 },
  { value: "contains", label: "contains", args: 1 },
  { value: "not_contains", label: "does not contain", args: 1 },
  { value: "starts_with", label: "starts with", args: 1 },
  { value: "ends_with", label: "ends with", args: 1 },
  { value: "regex", label: "matches regex", args: 1 },
  { value: "gt", label: "greater than", args: 1 },
  { value: "gte", label: "greater than or equal", args: 1 },
  { value: "lt", label: "less than", args: 1 },
  { value: "lte", label: "less than or equal", args: 1 },
  { value: "between", label: "between (inclusive)", args: 2 },
  { value: "empty", label: "is empty", args: 0 },
  { value: "not_empty", label: "is not empty", args: 0 },
];

export interface FilterCondition {
  /** Column index, or -1 for "any column". */
  column: number;
  op: FilterOp;
  value?: string;
  value2?: string;
}

export interface FilterOptions {
  match?: "all" | "any";
  caseSensitive?: boolean;
}

/** Compares numerically when both sides are numbers, by date when both are dates, else as text. */
export function compareValues(a: Cell, b: string, caseSensitive = false): number {
  const na = parseNumber(a);
  const nb = parseNumber(b);
  if (na != null && nb != null) return na - nb;
  const da = parseDate(a);
  const db = parseDate(b);
  if (da != null && db != null) return da - db;
  const x = caseSensitive ? cellText(a) : cellText(a).toLowerCase();
  const y = caseSensitive ? b : b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

type Predicate = (v: Cell) => boolean;

export function buildPredicate(c: FilterCondition, caseSensitive = false): Predicate {
  const fold = (s: string) => (caseSensitive ? s : s.toLowerCase());
  const val = c.value ?? "";
  const target = fold(val);
  switch (c.op) {
    case "equals":
      return (v) => {
        const na = parseNumber(v);
        const nb = parseNumber(val);
        if (na != null && nb != null) return na === nb;
        return fold(cellText(v).trim()) === target.trim();
      };
    case "not_equals": {
      const eq = buildPredicate({ ...c, op: "equals" }, caseSensitive);
      return (v) => !eq(v);
    }
    case "contains":
      return (v) => fold(cellText(v)).includes(target);
    case "not_contains":
      return (v) => !fold(cellText(v)).includes(target);
    case "starts_with":
      return (v) => fold(cellText(v)).startsWith(target);
    case "ends_with":
      return (v) => fold(cellText(v)).endsWith(target);
    case "regex": {
      let re: RegExp;
      try {
        re = new RegExp(val, caseSensitive ? "" : "i");
      } catch (e) {
        throw new Error(`Invalid regular expression: ${(e as Error).message}`);
      }
      return (v) => re.test(cellText(v));
    }
    case "gt":
      return (v) => cellText(v).trim() !== "" && compareValues(v, val, caseSensitive) > 0;
    case "gte":
      return (v) => cellText(v).trim() !== "" && compareValues(v, val, caseSensitive) >= 0;
    case "lt":
      return (v) => cellText(v).trim() !== "" && compareValues(v, val, caseSensitive) < 0;
    case "lte":
      return (v) => cellText(v).trim() !== "" && compareValues(v, val, caseSensitive) <= 0;
    case "between": {
      const hi = c.value2 ?? "";
      return (v) =>
        cellText(v).trim() !== "" && compareValues(v, val, caseSensitive) >= 0 && compareValues(v, hi, caseSensitive) <= 0;
    }
    case "empty":
      return (v) => cellText(v).trim() === "";
    case "not_empty":
      return (v) => cellText(v).trim() !== "";
    default:
      return () => true;
  }
}

export function filterTable(t: Table, conditions: FilterCondition[], opts: FilterOptions = {}): Table {
  const active = conditions.filter((c) => c.column < t.headers.length);
  if (!active.length) return t;
  const preds = active.map((c) => ({ col: c.column, test: buildPredicate(c, opts.caseSensitive) }));
  const rowMatches = (r: Cell[], p: { col: number; test: Predicate }) =>
    p.col < 0 ? r.some((v) => p.test(v)) : p.test(r[p.col] ?? null);
  const any = opts.match === "any";
  const rows = t.rows.filter((r) => (any ? preds.some((p) => rowMatches(r, p)) : preds.every((p) => rowMatches(r, p))));
  return { headers: t.headers, rows };
}

/* --------------------------------------------------------------- merge */

export interface NamedTable {
  name: string;
  table: Table;
}

export interface StackOptions {
  /** Match headers ignoring case and surrounding whitespace. */
  looseHeaders?: boolean;
  /** Add a column with the source file name. */
  sourceColumn?: string | null;
}

/** Appends tables vertically, aligning columns by header name (union of all headers). */
export function stackTables(tables: NamedTable[], opts: StackOptions = {}): Table {
  const key = (h: string) => (opts.looseHeaders ? h.trim().toLowerCase() : h);
  const headers: string[] = [];
  const index = new Map<string, number>();
  for (const { table } of tables)
    for (const h of table.headers)
      if (!index.has(key(h))) {
        index.set(key(h), headers.length);
        headers.push(h);
      }
  const rows: Cell[][] = [];
  for (const { name, table } of tables) {
    const map = table.headers.map((h) => index.get(key(h))!);
    for (const r of table.rows) {
      const out: Cell[] = new Array(headers.length).fill("");
      r.forEach((v, i) => {
        if (map[i] != null) out[map[i]] = v;
      });
      if (opts.sourceColumn) out.push(name);
      rows.push(out);
    }
  }
  return { headers: opts.sourceColumn ? [...headers, opts.sourceColumn] : headers, rows };
}

export type JoinType = "inner" | "left" | "outer";

export interface JoinOptions {
  /** Key column name per table (same order as tables). */
  keys: string[];
  type?: JoinType;
  ignoreCase?: boolean;
}

/** Joins tables on key columns, left to right (like SQL; duplicate keys produce every combination). */
export function joinTables(tables: NamedTable[], opts: JoinOptions): Table {
  if (tables.length < 2) throw new Error("Choose at least two files to join.");
  const type = opts.type ?? "inner";
  const norm = (v: Cell) => {
    const s = cellText(v).trim();
    return opts.ignoreCase ? s.toLowerCase() : s;
  };
  const keyIdx = tables.map(({ name, table }, i) => {
    const k = findColumn(table.headers, opts.keys[i] ?? "");
    if (k < 0) throw new Error(`Key column "${opts.keys[i] ?? ""}" was not found in ${name}.`);
    return k;
  });

  let headers = [...tables[0].table.headers];
  let rows = tables[0].table.rows.map((r) => [...r]);
  const leftKey = keyIdx[0];
  const usedNames = new Set(headers.map((h) => h.toLowerCase()));

  for (let t = 1; t < tables.length; t++) {
    const { name, table } = tables[t];
    const rk = keyIdx[t];
    const otherCols = table.headers.map((_, i) => i).filter((i) => i !== rk);
    const newHeaders = otherCols.map((i) => {
      let h = table.headers[i];
      if (usedNames.has(h.toLowerCase())) h = `${h} (${name})`;
      let k = 2;
      const base = h;
      while (usedNames.has(h.toLowerCase())) h = `${base} ${k++}`;
      usedNames.add(h.toLowerCase());
      return h;
    });
    const right = new Map<string, Cell[][]>();
    for (const r of table.rows) {
      const k = norm(r[rk] ?? null);
      const list = right.get(k);
      if (list) list.push(r);
      else right.set(k, [r]);
    }
    const matched = new Set<string>();
    const out: Cell[][] = [];
    const leftWidth = headers.length;
    for (const l of rows) {
      const k = norm(l[leftKey] ?? null);
      const rs = right.get(k);
      if (rs) {
        matched.add(k);
        for (const r of rs) out.push([...l, ...otherCols.map((i) => r[i] ?? "")]);
      } else if (type !== "inner") out.push([...l, ...otherCols.map(() => "")]);
    }
    if (type === "outer") {
      for (const r of table.rows) {
        const k = norm(r[rk] ?? null);
        if (matched.has(k)) continue;
        const l: Cell[] = new Array(leftWidth).fill("");
        l[leftKey] = r[rk] ?? "";
        out.push([...l, ...otherCols.map((i) => r[i] ?? "")]);
      }
    }
    headers = [...headers, ...newHeaders];
    rows = out;
  }
  return { headers, rows };
}

/* --------------------------------------------------------------- split */

export interface SplitPart {
  name: string;
  table: Table;
}

export function splitByRows(t: Table, rowsPerFile: number): SplitPart[] {
  const size = Math.max(1, Math.floor(rowsPerFile));
  const parts: SplitPart[] = [];
  const total = Math.max(1, Math.ceil(t.rows.length / size));
  const width = String(total).length;
  for (let i = 0; i < total; i++) {
    parts.push({
      name: `part-${String(i + 1).padStart(width, "0")}`,
      table: { headers: t.headers, rows: t.rows.slice(i * size, (i + 1) * size) },
    });
  }
  return parts;
}

export function splitByColumn(t: Table, column: number): SplitPart[] {
  const groups = new Map<string, Cell[][]>();
  for (const r of t.rows) {
    const k = cellText(r[column] ?? null).trim();
    const list = groups.get(k);
    if (list) list.push(r);
    else groups.set(k, [r]);
  }
  const used = new Set<string>();
  return Array.from(groups, ([k, rows]) => {
    const base = safeFileName(k, "(empty)");
    let name = base;
    let n = 2;
    while (used.has(name.toLowerCase())) name = `${base}-${n++}`;
    used.add(name.toLowerCase());
    return { name, table: { headers: t.headers, rows } };
  });
}
