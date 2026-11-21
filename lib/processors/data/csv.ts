/**
 * RFC 4180 CSV parser and serializer.
 *
 * - Quoted fields may contain delimiters, quotes (escaped as "") and line breaks.
 * - Accepts CRLF, LF and lone CR line endings.
 * - Strips a leading UTF-8 byte order mark.
 * - Auto-detects the delimiter among comma, semicolon, tab and pipe.
 * - Lenient where real-world files deviate (text after a closing quote is kept,
 *   a quote inside an unquoted field is literal, an unterminated quote is reported).
 */

export type Delimiter = "," | ";" | "\t" | "|";

export const DELIMITERS: readonly Delimiter[] = [",", ";", "\t", "|"];

export const DELIMITER_LABELS: Record<Delimiter, string> = {
  ",": "Comma (,)",
  ";": "Semicolon (;)",
  "\t": "Tab",
  "|": "Pipe (|)",
};

export interface ParseOptions {
  /** Field delimiter. Omit (or "auto") to detect it. */
  delimiter?: Delimiter | "auto";
  /** Drop records that consist of a single empty field (blank lines). Default true. */
  skipEmptyLines?: boolean;
  /** Stop after this many records (used for sniffing and previews). */
  maxRows?: number;
}

export interface ParseResult {
  rows: string[][];
  delimiter: Delimiter;
  /** Non-fatal problems, e.g. an unterminated quoted field. */
  warnings: string[];
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const QUOTE = 34; // "
const CR = 13;
const LF = 10;

function parseWith(text: string, delimiter: string, skipEmpty: boolean, maxRows: number): { rows: string[][]; warnings: string[] } {
  const rows: string[][] = [];
  const warnings: string[] = [];
  const n = text.length;
  const d = delimiter.charCodeAt(0);
  let row: string[] = [];
  let i = 0;
  let line = 1;
  let quotedSeen = false;

  const pushRow = () => {
    if (!(skipEmpty && !quotedSeen && row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
    quotedSeen = false;
  };

  while (i <= n) {
    if (rows.length >= maxRows) break;
    if (i === n) {
      // End of input: a trailing delimiter means one more empty field; a trailing newline adds nothing.
      if (row.length) {
        row.push("");
        pushRow();
      }
      break;
    }
    let field: string;
    if (text.charCodeAt(i) === QUOTE) {
      // Quoted field.
      quotedSeen = true;
      const startLine = line;
      let j = i + 1;
      let buf = "";
      let closed = false;
      while (j < n) {
        const q = text.indexOf('"', j);
        if (q === -1) {
          buf += text.slice(j);
          j = n;
          break;
        }
        const chunk = text.slice(j, q);
        buf += chunk;
        for (let k = 0; k < chunk.length; k++) if (chunk.charCodeAt(k) === LF) line++;
        if (text.charCodeAt(q + 1) === QUOTE) {
          buf += '"';
          j = q + 2;
        } else {
          j = q + 1;
          closed = true;
          break;
        }
      }
      if (!closed) warnings.push(`Unterminated quoted field starting on line ${startLine}.`);
      // Lenient: keep any characters between the closing quote and the next delimiter/newline.
      let k = j;
      while (k < n) {
        const c = text.charCodeAt(k);
        if (c === d || c === CR || c === LF) break;
        k++;
      }
      field = k > j ? buf + text.slice(j, k) : buf;
      i = k;
    } else {
      let k = i;
      while (k < n) {
        const c = text.charCodeAt(k);
        if (c === d || c === CR || c === LF) break;
        k++;
      }
      field = text.slice(i, k);
      i = k;
    }
    row.push(field);
    if (i >= n) {
      pushRow();
      break;
    }
    const c = text.charCodeAt(i);
    if (c === d) {
      i++;
      if (i === n) {
        row.push("");
        pushRow();
        break;
      }
    } else if (c === CR || c === LF) {
      i += c === CR && text.charCodeAt(i + 1) === LF ? 2 : 1;
      line++;
      pushRow();
    }
  }
  return { rows, warnings };
}

/** Picks the delimiter that yields the most consistent multi-column records in the first lines. */
export function detectDelimiter(text: string): Delimiter {
  const sample = stripBom(text).slice(0, 64 * 1024);
  let best: Delimiter = ",";
  let bestScore = -1;
  for (const d of DELIMITERS) {
    const { rows } = parseWith(sample, d, true, 30);
    // Drop the last sampled record when the sample was truncated mid-record.
    const recs = sample.length < text.length && rows.length > 1 ? rows.slice(0, -1) : rows;
    if (!recs.length) continue;
    const counts = new Map<number, number>();
    for (const r of recs) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
    let mode = 1;
    let modeFreq = 0;
    for (const [len, f] of counts) if (f > modeFreq || (f === modeFreq && len > mode)) [mode, modeFreq] = [len, f];
    if (mode < 2) continue;
    const score = (modeFreq / recs.length) * 1000 + Math.min(mode, 100);
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

export function parseCsv(input: string, opts: ParseOptions = {}): ParseResult {
  const text = stripBom(input);
  const delimiter = !opts.delimiter || opts.delimiter === "auto" ? detectDelimiter(text) : opts.delimiter;
  const { rows, warnings } = parseWith(text, delimiter, opts.skipEmptyLines ?? true, opts.maxRows ?? Infinity);
  return { rows, delimiter, warnings };
}

export interface StringifyOptions {
  delimiter?: Delimiter;
  /** Line ending. RFC 4180 uses CRLF (default). */
  eol?: "\r\n" | "\n";
  /** Quote every field, not only those that need it. */
  quoteAll?: boolean;
  /** Prepend a UTF-8 BOM so Excel detects the encoding. */
  bom?: boolean;
}

export type CellLike = string | number | boolean | null | undefined;

export function cellToString(v: CellLike): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  return String(v);
}

export function escapeField(value: CellLike, delimiter: string = ",", quoteAll = false): string {
  const s = cellToString(value);
  const needs =
    quoteAll ||
    s.includes(delimiter) ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r") ||
    (s.length > 0 && (s[0] === " " || s[s.length - 1] === " "));
  return needs ? `"${s.replace(/"/g, '""')}"` : s;
}

export function stringifyCsv(rows: CellLike[][], opts: StringifyOptions = {}): string {
  const d = opts.delimiter ?? ",";
  const eol = opts.eol ?? "\r\n";
  const out = rows.map((r) => r.map((v) => escapeField(v, d, opts.quoteAll)).join(d)).join(eol);
  return (opts.bom ? "﻿" : "") + out;
}

/** Decodes file bytes as UTF-8, falling back to Windows-1252 for legacy exports. */
export function decodeText(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // UTF-16 BOMs.
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8.subarray(2));
  try {
    return stripBom(new TextDecoder("utf-8", { fatal: true }).decode(u8));
  } catch {
    return new TextDecoder("windows-1252").decode(u8);
  }
}
