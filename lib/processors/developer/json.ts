/**
 * JSON parsing, formatting and analysis. Pure functions, no DOM.
 *
 * `parseJson` uses the native parser on the happy path and falls back to a
 * hand-written recursive-descent parser to produce a precise, browser-independent
 * error location (line/column). The same parser powers the relaxed mode used by
 * the JSON Beautifier, which accepts comments, trailing commas, single-quoted
 * strings and unquoted keys and reports every repair it made.
 */

export class JsonParseError extends Error {
  constructor(
    message: string,
    public readonly position: number,
    public readonly line: number,
    public readonly column: number,
  ) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = "JsonParseError";
  }
  /** Message without the location suffix. */
  get reason(): string {
    return this.message.replace(/ \(line \d+, column \d+\)$/, "");
  }
}

export interface RelaxedRepairs {
  comments: number;
  trailingCommas: number;
  singleQuotedStrings: number;
  unquotedKeys: number;
  otherNumbers: number;
}

export function emptyRepairs(): RelaxedRepairs {
  return { comments: 0, trailingCommas: 0, singleQuotedStrings: 0, unquotedKeys: 0, otherNumbers: 0 };
}

export function lineColumnAt(text: string, pos: number): { line: number; column: number } {
  let line = 1;
  let last = -1;
  const end = Math.min(pos, text.length);
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      last = i;
    }
  }
  return { line, column: end - last };
}

function setKey(obj: Record<string, unknown>, key: string, value: unknown) {
  if (key === "__proto__") Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
  else obj[key] = value;
}

class Parser {
  i = 0;
  repairs = emptyRepairs();
  duplicateKeys: string[] = [];
  constructor(
    private s: string,
    private relaxed: boolean,
  ) {}

  fail(msg: string, pos = this.i): never {
    const { line, column } = lineColumnAt(this.s, pos);
    throw new JsonParseError(msg, pos, line, column);
  }

  describe(pos = this.i): string {
    if (pos >= this.s.length) return "end of input";
    const ch = this.s[pos];
    return ch === "\n" ? "a line break" : `'${ch}'`;
  }

  ws() {
    const s = this.s;
    for (;;) {
      const c = s.charCodeAt(this.i);
      if (c === 32 || c === 9 || c === 10 || c === 13 || (this.relaxed && (c === 0xfeff || c === 0xa0))) {
        this.i++;
        continue;
      }
      if (c === 47 /* / */ && (s[this.i + 1] === "/" || s[this.i + 1] === "*")) {
        if (!this.relaxed) this.fail("Comments are not allowed in JSON");
        this.repairs.comments++;
        if (s[this.i + 1] === "/") {
          const nl = s.indexOf("\n", this.i);
          this.i = nl < 0 ? s.length : nl + 1;
        } else {
          const end = s.indexOf("*/", this.i + 2);
          if (end < 0) this.fail("Unterminated block comment");
          this.i = end + 2;
        }
        continue;
      }
      if (this.relaxed && c === 35 /* # */) {
        this.repairs.comments++;
        const nl = s.indexOf("\n", this.i);
        this.i = nl < 0 ? s.length : nl + 1;
        continue;
      }
      break;
    }
  }

  parseDocument(): unknown {
    if (this.s.charCodeAt(0) === 0xfeff) this.i = 1;
    this.ws();
    if (this.i >= this.s.length) this.fail("Input is empty");
    const v = this.value();
    this.ws();
    if (this.i < this.s.length) this.fail(`Unexpected ${this.describe()} after the end of the JSON value`);
    return v;
  }

  value(): unknown {
    const ch = this.s[this.i];
    if (ch === "{") return this.object();
    if (ch === "[") return this.array();
    if (ch === '"') return this.string('"');
    if (ch === "'") {
      if (!this.relaxed) this.fail("Strings must use double quotes");
      this.repairs.singleQuotedStrings++;
      return this.string("'");
    }
    if (ch === "-" || ch === "+" || ch === "." || (ch >= "0" && ch <= "9")) return this.number();
    if (this.s.startsWith("true", this.i)) return this.literal("true", true);
    if (this.s.startsWith("false", this.i)) return this.literal("false", false);
    if (this.s.startsWith("null", this.i)) return this.literal("null", null);
    if (this.relaxed && /^(?:NaN|-?Infinity|undefined)\b/.test(this.s.slice(this.i, this.i + 10)))
      this.fail("NaN, Infinity and undefined have no JSON representation");
    if (this.i >= this.s.length) this.fail("Unexpected end of input, expected a value");
    this.fail(`Unexpected ${this.describe()}, expected a value`);
  }

  literal(word: string, v: unknown) {
    const after = this.s[this.i + word.length];
    if (after && /[\w$]/.test(after)) this.fail(`Unexpected ${this.describe(this.i + word.length)}`, this.i + word.length);
    this.i += word.length;
    return v;
  }

  object(): Record<string, unknown> {
    const start = this.i;
    this.i++;
    const obj: Record<string, unknown> = {};
    const seen = new Set<string>();
    this.ws();
    if (this.s[this.i] === "}") {
      this.i++;
      return obj;
    }
    for (;;) {
      this.ws();
      let key: string;
      const ch = this.s[this.i];
      if (ch === '"') key = this.string('"');
      else if (ch === "'" && this.relaxed) {
        this.repairs.singleQuotedStrings++;
        key = this.string("'");
      } else if (this.relaxed && ch && /[A-Za-z_$\d]/.test(ch)) {
        const m = /^[A-Za-z_$\d][\w$-]*/.exec(this.s.slice(this.i, this.i + 256));
        key = m![0];
        this.i += key.length;
        this.repairs.unquotedKeys++;
      } else if (ch === "}" && this.relaxed) {
        // only reachable after a trailing comma
        this.i++;
        return obj;
      } else if (this.i >= this.s.length) this.fail(`Unterminated object (opened at ${posText(this.s, start)})`);
      else if (ch === "}") this.fail("Trailing comma before '}' is not allowed in JSON");
      else this.fail(`Expected a double-quoted property name but found ${this.describe()}`);
      if (seen.has(key)) this.duplicateKeys.push(key);
      seen.add(key);
      this.ws();
      if (this.s[this.i] !== ":") this.fail(`Expected ':' after property name "${key}" but found ${this.describe()}`);
      this.i++;
      this.ws();
      setKey(obj, key, this.value());
      this.ws();
      const sep = this.s[this.i];
      if (sep === ",") {
        this.i++;
        this.ws();
        if (this.s[this.i] === "}") {
          if (!this.relaxed) this.fail("Trailing comma before '}' is not allowed in JSON");
          this.repairs.trailingCommas++;
          this.i++;
          return obj;
        }
        continue;
      }
      if (sep === "}") {
        this.i++;
        return obj;
      }
      if (this.i >= this.s.length) this.fail(`Unterminated object (opened at ${posText(this.s, start)})`);
      this.fail(`Expected ',' or '}' after property value but found ${this.describe()}`);
    }
  }

  array(): unknown[] {
    const start = this.i;
    this.i++;
    const arr: unknown[] = [];
    this.ws();
    if (this.s[this.i] === "]") {
      this.i++;
      return arr;
    }
    for (;;) {
      this.ws();
      arr.push(this.value());
      this.ws();
      const sep = this.s[this.i];
      if (sep === ",") {
        this.i++;
        this.ws();
        if (this.s[this.i] === "]") {
          if (!this.relaxed) this.fail("Trailing comma before ']' is not allowed in JSON");
          this.repairs.trailingCommas++;
          this.i++;
          return arr;
        }
        continue;
      }
      if (sep === "]") {
        this.i++;
        return arr;
      }
      if (this.i >= this.s.length) this.fail(`Unterminated array (opened at ${posText(this.s, start)})`);
      this.fail(`Expected ',' or ']' after array element but found ${this.describe()}`);
    }
  }

  string(q: string): string {
    const start = this.i;
    this.i++;
    let out = "";
    const s = this.s;
    for (;;) {
      if (this.i >= s.length) this.fail(`Unterminated string (started at ${posText(s, start)})`, start);
      const ch = s[this.i];
      if (ch === q) {
        this.i++;
        return out;
      }
      if (ch === "\\") {
        const e = s[this.i + 1];
        this.i += 2;
        switch (e) {
          case '"':
            out += '"';
            break;
          case "\\":
            out += "\\";
            break;
          case "/":
            out += "/";
            break;
          case "b":
            out += "\b";
            break;
          case "f":
            out += "\f";
            break;
          case "n":
            out += "\n";
            break;
          case "r":
            out += "\r";
            break;
          case "t":
            out += "\t";
            break;
          case "u": {
            const hex = s.slice(this.i, this.i + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail("Invalid \\u escape, expected 4 hex digits", this.i - 2);
            out += String.fromCharCode(parseInt(hex, 16));
            this.i += 4;
            break;
          }
          case "'":
            if (this.relaxed) {
              out += "'";
              break;
            }
            this.fail("Invalid escape \\' (single quotes need no escaping in JSON)", this.i - 2);
            break;
          case "\n":
            if (this.relaxed) break; // line continuation
            this.fail("Invalid escape sequence", this.i - 2);
            break;
          default:
            this.fail(`Invalid escape sequence \\${e ?? ""}`, this.i - 2);
        }
        continue;
      }
      const c = ch.charCodeAt(0);
      if (c < 0x20 && !this.relaxed) {
        this.fail(ch === "\n" ? "Unescaped line break inside a string" : "Unescaped control character inside a string");
      }
      out += ch;
      this.i++;
    }
  }

  number(): number {
    const s = this.s;
    const start = this.i;
    if (this.relaxed) {
      const m = /^[+-]?(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(s.slice(this.i, this.i + 400));
      if (!m) this.fail("Invalid number");
      const raw = m[0];
      const strict = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw);
      if (!strict) this.repairs.otherNumbers++;
      this.i += raw.length;
      const body = raw.replace(/^[+-]/, "");
      const n = /^0[xX]/.test(body) ? parseInt(body, 16) : Number(body);
      return raw.startsWith("-") ? -n : n;
    }
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(s.slice(this.i, this.i + 400));
    if (!m) this.fail(`Invalid number starting with ${this.describe()}`);
    const next = s[this.i + m[0].length];
    if (next && /[\d.eE]/.test(next)) this.fail("Invalid number format (leading zeros and bare decimal points are not allowed)", start);
    this.i += m[0].length;
    return Number(m[0]);
  }
}

function posText(s: string, pos: number): string {
  const { line, column } = lineColumnAt(s, pos);
  return `line ${line}, column ${column}`;
}

export interface ParseResult {
  value: unknown;
  repairs: RelaxedRepairs;
  duplicateKeys: string[];
}

/** Strict JSON (RFC 8259). Throws JsonParseError with line/column. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Re-parse to get an exact, browser-independent location.
    new Parser(text, false).parseDocument();
    // Should be unreachable: if our parser accepts what JSON.parse rejected, report generically.
    throw new JsonParseError("Invalid JSON", 0, 1, 1);
  }
}

/** Strict parse that also reports duplicate keys (which JSON.parse silently overwrites). */
export function parseJsonDetailed(text: string): ParseResult {
  const p = new Parser(text, false);
  const value = p.parseDocument();
  return { value, repairs: p.repairs, duplicateKeys: [...new Set(p.duplicateKeys)] };
}

/** Relaxed JSON (JSONC / JSON5-like subset) → value plus a list of repairs. */
export function parseRelaxedJson(text: string): ParseResult {
  const p = new Parser(text, true);
  const value = p.parseDocument();
  return { value, repairs: p.repairs, duplicateKeys: [...new Set(p.duplicateKeys)] };
}

export type Indent = 2 | 4 | 8 | "tab";

export function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
      setKey(out, k, sortKeysDeep((v as Record<string, unknown>)[k]));
    return out;
  }
  return v;
}

export function stringifyJson(value: unknown, opts: { indent?: Indent | 0; sortKeys?: boolean; escapeUnicode?: boolean } = {}): string {
  const v = opts.sortKeys ? sortKeysDeep(value) : value;
  const ind = opts.indent === "tab" ? "\t" : opts.indent ?? 2;
  let out = JSON.stringify(v, null, ind || undefined);
  if (out === undefined) out = "null";
  if (opts.escapeUnicode) out = out.replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
  return out;
}

export function formatJson(text: string, opts: { indent?: Indent; sortKeys?: boolean; escapeUnicode?: boolean } = {}): string {
  return stringifyJson(parseJson(text), { indent: opts.indent ?? 2, sortKeys: opts.sortKeys, escapeUnicode: opts.escapeUnicode });
}

export function minifyJson(text: string, opts: { sortKeys?: boolean } = {}): string {
  return stringifyJson(parseJson(text), { indent: 0, sortKeys: opts.sortKeys });
}

export function beautifyRelaxedJson(text: string, opts: { indent?: Indent; sortKeys?: boolean } = {}) {
  const r = parseRelaxedJson(text);
  return { output: stringifyJson(r.value, { indent: opts.indent ?? 2, sortKeys: opts.sortKeys }), repairs: r.repairs };
}

export interface JsonStats {
  type: string;
  depth: number;
  objects: number;
  arrays: number;
  keys: number;
  strings: number;
  numbers: number;
  booleans: number;
  nulls: number;
  unsafeIntegers: number;
}

export function jsonStats(value: unknown): JsonStats {
  const s: JsonStats = { type: typeName(value), depth: 0, objects: 0, arrays: 0, keys: 0, strings: 0, numbers: 0, booleans: 0, nulls: 0, unsafeIntegers: 0 };
  const stack: [unknown, number][] = [[value, 1]];
  while (stack.length) {
    const [v, d] = stack.pop()!;
    if (d > s.depth) s.depth = d;
    if (Array.isArray(v)) {
      s.arrays++;
      for (const x of v) stack.push([x, d + 1]);
    } else if (v === null) s.nulls++;
    else if (typeof v === "object") {
      s.objects++;
      const ks = Object.keys(v as object);
      s.keys += ks.length;
      for (const k of ks) stack.push([(v as Record<string, unknown>)[k], d + 1]);
    } else if (typeof v === "string") s.strings++;
    else if (typeof v === "number") {
      s.numbers++;
      if (Number.isInteger(v) && !Number.isSafeInteger(v)) s.unsafeIntegers++;
    } else if (typeof v === "boolean") s.booleans++;
  }
  return s;
}

function typeName(v: unknown): string {
  if (Array.isArray(v)) return "array";
  if (v === null) return "null";
  return typeof v;
}

/** Integer literals in the source that exceed Number.MAX_SAFE_INTEGER (precision is lost on parse). */
export function findUnsafeIntegerLiterals(text: string): string[] {
  const out: string[] = [];
  const re = /"(?:[^"\\]|\\.)*"|(-?\d{16,})(?![\d.eE])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1] && !Number.isSafeInteger(Number(m[1]))) out.push(m[1]);
  }
  return out;
}
