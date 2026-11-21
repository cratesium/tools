/** JSON ⇄ table conversion with dot-path flattening. */

import { cellText, inferCell, type Cell, type Table } from "./table";

export type ArrayMode = "index" | "json";

export interface FlattenOptions {
  /** "index": tags.0, tags.1 … (default). "json": keep arrays as a JSON string in one cell. */
  arrays?: ArrayMode;
  separator?: string;
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Flattens nested objects into dot paths: {a:{b:1}} → {"a.b": 1}. */
export function flattenObject(value: unknown, opts: FlattenOptions = {}): Record<string, Cell> {
  const sep = opts.separator ?? ".";
  const arrays = opts.arrays ?? "index";
  const out: Record<string, Cell> = {};
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) {
      if (arrays === "json" || v.length === 0) {
        if (path) out[path] = v.length ? JSON.stringify(v) : "";
        else v.forEach((x, i) => walk(x, String(i)));
        return;
      }
      v.forEach((x, i) => walk(x, path ? `${path}${sep}${i}` : String(i)));
      return;
    }
    if (isPlainObject(v)) {
      const keys = Object.keys(v);
      if (!keys.length) {
        if (path) out[path] = "";
        return;
      }
      for (const k of keys) walk(v[k], path ? `${path}${sep}${k}` : k);
      return;
    }
    const key = path || "value";
    if (v === undefined) out[key] = null;
    else if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[key] = v;
    else out[key] = String(v);
  };
  walk(value, "");
  return out;
}

/** Finds the array of records inside common wrappers such as {"data": [...]} or {"items": [...]}. */
export function findRecords(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isPlainObject(value)) {
    const arrays = Object.entries(value).filter(([, v]) => Array.isArray(v) && v.length > 0);
    if (arrays.length === 1) return arrays[0][1] as unknown[];
    return [value];
  }
  return [value];
}

export function jsonToTable(value: unknown, opts: FlattenOptions = {}): Table {
  const records = findRecords(value);
  if (records.length && records.every((r) => Array.isArray(r))) {
    // Array of arrays: first row is treated as the header when it is all strings.
    const arr = records as unknown[][];
    const first = arr[0];
    const headerLike = first.length > 0 && first.every((x) => typeof x === "string");
    const width = arr.reduce((m, r) => Math.max(m, r.length), 0);
    const headers = headerLike
      ? Array.from({ length: width }, (_, i) => (first[i] as string) || `Column ${i + 1}`)
      : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
    const body = (headerLike ? arr.slice(1) : arr).map((r) =>
      Array.from({ length: width }, (_, i) => toCell(r[i])),
    );
    return { headers, rows: body };
  }
  const flat = records.map((r) => (isPlainObject(r) || Array.isArray(r) ? flattenObject(r, opts) : { value: toCell(r) }));
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const f of flat)
    for (const k of Object.keys(f))
      if (!seen.has(k)) {
        seen.add(k);
        headers.push(k);
      }
  const rows = flat.map((f) => headers.map((h) => (h in f ? f[h] : null)));
  return { headers, rows };
}

function toCell(v: unknown): Cell {
  if (v === undefined || v === null) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  return JSON.stringify(v);
}

export function parseJsonInput(text: string): unknown {
  const t = text.replace(/^﻿/, "").trim();
  if (!t) throw new Error("The JSON input is empty.");
  try {
    return JSON.parse(t);
  } catch (e) {
    // Newline-delimited JSON (one object per line).
    const lines = t.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length > 1) {
      try {
        return lines.map((l) => JSON.parse(l));
      } catch {
        /* fall through to the original error */
      }
    }
    throw new Error(`Invalid JSON: ${(e as Error).message}`);
  }
}

export interface ToJsonOptions {
  /** Convert "12" → 12, "true" → true, "" → null. */
  inferTypes?: boolean;
  /** Rebuild nesting from dot paths ("a.b" → {a:{b}}; numeric segments → arrays). */
  unflatten?: boolean;
  separator?: string;
  /** "objects": array of records (default). "arrays": header row + value rows. */
  shape?: "objects" | "arrays";
}

function convertValue(v: Cell, infer: boolean): Json {
  if (!infer) return v == null ? "" : typeof v === "string" ? v : v;
  if (v == null) return null;
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (s === "") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  const n = inferCell(v);
  return typeof n === "number" ? n : v;
}

function setPath(target: Record<string, Json>, parts: string[], value: Json) {
  let cur: Json = target;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const last = i === parts.length - 1;
    const nextIsIndex = !last && /^\d+$/.test(parts[i + 1]);
    if (Array.isArray(cur)) {
      const idx = Number(p);
      if (last) cur[idx] = value;
      else {
        if (cur[idx] == null || typeof cur[idx] !== "object") cur[idx] = nextIsIndex ? [] : {};
        cur = cur[idx];
      }
    } else if (cur && typeof cur === "object") {
      const obj = cur as Record<string, Json>;
      if (last) obj[p] = value;
      else {
        if (obj[p] == null || typeof obj[p] !== "object") obj[p] = nextIsIndex ? [] : {};
        cur = obj[p];
      }
    }
  }
}

export function tableToJson(t: Table, opts: ToJsonOptions = {}): Json {
  const infer = opts.inferTypes ?? true;
  if (opts.shape === "arrays") return [t.headers, ...t.rows.map((r) => r.map((v) => convertValue(v, infer)))];
  const sep = opts.separator ?? ".";
  return t.rows.map((r) => {
    const obj: Record<string, Json> = {};
    t.headers.forEach((h, i) => {
      const v = convertValue(r[i] ?? null, infer);
      if (opts.unflatten && h.includes(sep)) {
        // Skip empty trailing cells so unflattened arrays stay compact.
        if (v === null && infer) return;
        setPath(obj, h.split(sep), v);
      } else obj[h] = v;
    });
    return obj;
  });
}

export function cellsToStrings(t: Table): string[][] {
  return t.rows.map((r) => r.map(cellText));
}
