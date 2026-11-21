/**
 * A tolerant PDF content-stream tokenizer, parser and serializer (ISO 32000-1 §7.2, §7.8).
 * Works on raw (already decoded) bytes, handles literal strings with escapes and nesting,
 * hex strings, names, numbers, arrays, dictionaries and inline images (BI … ID … EI).
 * Serialization preserves the original spelling of every token, so an unmodified
 * stream round-trips to equivalent operators.
 */

export type CsValue =
  | { t: "num"; raw: string }
  | { t: "name"; raw: string }
  | { t: "str"; raw: string; bytes: Uint8Array }
  | { t: "hex"; raw: string; bytes: Uint8Array }
  | { t: "kw"; raw: "true" | "false" | "null" }
  | { t: "arr"; items: CsValue[] }
  | { t: "dict"; entries: [string, CsValue][] };

export interface CsOperation {
  op: string;
  operands: CsValue[];
  /** For inline images (op "BI"): the raw bytes from "BI" through "EI", latin1-encoded. */
  inline?: string;
}

/** Bytes → string with one char per byte (not TextDecoder("latin1"), which is windows-1252). */
export function bytesToLatin1(bytes: Uint8Array): string {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return s;
}

export function latin1ToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

const isWs = (c: number) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x0c || c === 0x00;
const isDelim = (c: number) =>
  c === 0x28 || c === 0x29 || c === 0x3c || c === 0x3e || c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d || c === 0x2f || c === 0x25;

export function parseContentStream(input: Uint8Array | string): CsOperation[] {
  const s = typeof input === "string" ? input : bytesToLatin1(input);
  const n = s.length;
  let i = 0;
  const ops: CsOperation[] = [];
  let operands: CsValue[] = [];
  const stack: ({ kind: "arr"; items: CsValue[] } | { kind: "dict"; items: CsValue[] })[] = [];
  const code = (k: number) => s.charCodeAt(k);

  const emit = (v: CsValue) => {
    if (stack.length) stack[stack.length - 1].items.push(v);
    else operands.push(v);
  };

  const readLiteral = (): CsValue => {
    const start = i;
    i++; // (
    let depth = 1;
    const bytes: number[] = [];
    while (i < n && depth > 0) {
      const c = code(i);
      if (c === 0x5c) {
        const d = s[i + 1];
        i += 2;
        if (d === undefined) break;
        const map: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };
        if (d in map) bytes.push(map[d]);
        else if (/[0-7]/.test(d)) {
          let oct = d;
          while (oct.length < 3 && /[0-7]/.test(s[i] ?? "")) oct += s[i++];
          bytes.push(parseInt(oct, 8) & 0xff);
        } else if (d === "\r") {
          if (s[i] === "\n") i++;
        } else if (d !== "\n") bytes.push(d.charCodeAt(0));
        continue;
      }
      if (c === 0x28) depth++;
      else if (c === 0x29) {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
      bytes.push(c);
      i++;
    }
    return { t: "str", raw: s.slice(start, i), bytes: Uint8Array.from(bytes) };
  };

  const readHex = (): CsValue => {
    const start = i;
    const end = s.indexOf(">", i);
    const stop = end < 0 ? n : end;
    const hex = s.slice(i + 1, stop).replace(/[^0-9a-fA-F]/g, "");
    i = stop + 1;
    const padded = hex.length % 2 ? hex + "0" : hex;
    const bytes = new Uint8Array(padded.length / 2);
    for (let k = 0; k < bytes.length; k++) bytes[k] = parseInt(padded.substr(k * 2, 2), 16);
    return { t: "hex", raw: s.slice(start, i), bytes };
  };

  const readRegular = (): string => {
    const start = i;
    while (i < n && !isWs(code(i)) && !isDelim(code(i))) i++;
    return s.slice(start, i);
  };

  while (i < n) {
    const c = code(i);
    if (isWs(c)) {
      i++;
      continue;
    }
    if (c === 0x25) {
      while (i < n && code(i) !== 0x0a && code(i) !== 0x0d) i++;
      continue;
    }
    if (c === 0x28) {
      emit(readLiteral());
      continue;
    }
    if (c === 0x3c) {
      if (code(i + 1) === 0x3c) {
        i += 2;
        stack.push({ kind: "dict", items: [] });
        continue;
      }
      emit(readHex());
      continue;
    }
    if (c === 0x3e && code(i + 1) === 0x3e) {
      i += 2;
      const top = stack.pop();
      if (top) {
        const entries: [string, CsValue][] = [];
        for (let k = 0; k + 1 < top.items.length; k += 2) {
          const key = top.items[k];
          entries.push([key.t === "name" ? key.raw : "/_", top.items[k + 1]]);
        }
        emit({ t: "dict", entries });
      }
      continue;
    }
    if (c === 0x5b) {
      i++;
      stack.push({ kind: "arr", items: [] });
      continue;
    }
    if (c === 0x5d) {
      i++;
      const top = stack.pop();
      if (top) emit({ t: "arr", items: top.items });
      continue;
    }
    if (c === 0x2f) {
      i++;
      emit({ t: "name", raw: "/" + readRegular() });
      continue;
    }
    if (c === 0x7b || c === 0x7d || c === 0x29 || c === 0x3e) {
      i++;
      continue;
    }
    const word = readRegular();
    if (!word) {
      i++;
      continue;
    }
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) {
      emit({ t: "num", raw: word });
      continue;
    }
    if (word === "true" || word === "false" || word === "null") {
      emit({ t: "kw", raw: word });
      continue;
    }
    // Operator. Unclosed arrays/dicts are discarded (malformed input).
    stack.length = 0;
    if (word === "BI") {
      const start = i - 2;
      // Find "ID" followed by one whitespace byte, then the data up to a whitespace-delimited "EI".
      const idMatch = /(^|[\s/\]>)])ID[\s]/g;
      idMatch.lastIndex = i;
      const m = idMatch.exec(s);
      if (!m) {
        i = n;
        break;
      }
      let k = m.index + m[0].length;
      let end = -1;
      while (k < n) {
        const e = s.indexOf("EI", k);
        if (e < 0) break;
        const before = code(e - 1);
        const after = e + 2 >= n ? 0x20 : code(e + 2);
        if (isWs(before) && (isWs(after) || isDelim(after))) {
          end = e + 2;
          break;
        }
        k = e + 2;
      }
      if (end < 0) end = n;
      ops.push({ op: "BI", operands: [], inline: s.slice(start, end) });
      i = end;
      operands = [];
      continue;
    }
    ops.push({ op: word, operands });
    operands = [];
  }
  return ops;
}

export function serializeValue(v: CsValue): string {
  switch (v.t) {
    case "num":
    case "name":
    case "kw":
    case "str":
    case "hex":
      return v.raw;
    case "arr":
      return "[" + v.items.map(serializeValue).join(" ") + "]";
    case "dict":
      return "<<" + v.entries.map(([k, val]) => `${k} ${serializeValue(val)}`).join(" ") + ">>";
  }
}

export function serializeContentStream(ops: CsOperation[]): Uint8Array {
  const parts: string[] = [];
  for (const o of ops) {
    if (o.inline !== undefined) parts.push(o.inline);
    else parts.push(o.operands.length ? `${o.operands.map(serializeValue).join(" ")} ${o.op}` : o.op);
  }
  return latin1ToBytes(parts.join("\n") + "\n");
}

/** Text shown by a text-showing operator (Tj, TJ, ', "), decoded as single-byte and as UTF-16BE. */
export function shownStrings(op: CsOperation): Uint8Array[] {
  const strs = (vals: CsValue[]): Uint8Array[] =>
    vals.flatMap((v) => (v.t === "str" || v.t === "hex" ? [v.bytes] : v.t === "arr" ? strs(v.items) : []));
  if (op.op === "Tj" || op.op === "'" || op.op === "TJ") return strs(op.operands);
  if (op.op === '"') return strs(op.operands.slice(2));
  return [];
}

/** Candidate readings of shown bytes: single-byte (Latin) and two-byte (UTF-16BE / Identity). */
export function decodeShown(bytes: Uint8Array): string[] {
  const single = bytesToLatin1(bytes);
  const out = [single];
  if (bytes.length % 2 === 0 && bytes.length >= 2) {
    let u = "";
    for (let k = 0; k < bytes.length; k += 2) u += String.fromCharCode((bytes[k] << 8) | bytes[k + 1]);
    out.push(u);
  }
  return out;
}

/** Removes BT…ET text objects whose shown text contains `needle` (case-insensitive). Returns removed count. */
export function removeTextObjectsContaining(ops: CsOperation[], needle: string): { ops: CsOperation[]; removed: number } {
  const target = needle.toLowerCase().replace(/\s+/g, "");
  if (!target) return { ops, removed: 0 };
  const out: CsOperation[] = [];
  let removed = 0;
  let i = 0;
  while (i < ops.length) {
    if (ops[i].op !== "BT") {
      out.push(ops[i++]);
      continue;
    }
    let j = i + 1;
    while (j < ops.length && ops[j].op !== "ET") j++;
    const block = ops.slice(i, Math.min(j + 1, ops.length));
    const chunks = block.flatMap(shownStrings);
    const readings = [
      chunks.map((b) => decodeShown(b)[0]).join(""),
      chunks.map((b) => decodeShown(b)[1] ?? "").join(""),
    ].map((r) => r.toLowerCase().replace(/\s+/g, ""));
    if (readings.some((r) => r && r.includes(target))) {
      removed++;
      // Keep marked-content operators inside the block so BDC/EMC nesting stays balanced.
      for (const o of block) if (o.op === "BMC" || o.op === "BDC" || o.op === "EMC") out.push(o);
    } else out.push(...block);
    i = j + 1;
  }
  return { ops: out, removed };
}

/**
 * Removes marked-content sequences (BMC/BDC … matching EMC) for which `match` returns true,
 * plus any operations `dropOp` flags (e.g. `Do` of a watermark XObject).
 */
export function removeMarkedContent(
  ops: CsOperation[],
  match: (tag: string, props: CsValue | undefined) => boolean,
  dropOp?: (op: CsOperation) => boolean,
): { ops: CsOperation[]; removed: number } {
  const out: CsOperation[] = [];
  let removed = 0;
  let skipDepth = 0;
  let depth = 0;
  // Track q/Q balance inside removed regions so the graphics state stack stays valid.
  let qBalance = 0;
  for (const o of ops) {
    const isBegin = o.op === "BMC" || o.op === "BDC";
    if (skipDepth > 0) {
      if (isBegin) depth++;
      else if (o.op === "EMC") {
        depth--;
        if (depth < skipDepth) {
          skipDepth = 0;
          for (; qBalance > 0; qBalance--) out.push({ op: "Q", operands: [] });
          for (; qBalance < 0; qBalance++) out.push({ op: "q", operands: [] });
        }
      } else if (o.op === "q") qBalance++;
      else if (o.op === "Q") qBalance--;
      continue;
    }
    if (isBegin) {
      depth++;
      const tag = o.operands[0]?.t === "name" ? o.operands[0].raw : "";
      if (match(tag, o.op === "BDC" ? o.operands[1] : undefined)) {
        skipDepth = depth;
        qBalance = 0;
        removed++;
        continue;
      }
    } else if (o.op === "EMC") depth = Math.max(0, depth - 1);
    if (dropOp?.(o)) {
      removed++;
      continue;
    }
    out.push(o);
  }
  return { ops: out, removed };
}

/** Looks up a key in an inline dict value. */
export function dictGet(v: CsValue | undefined, key: string): CsValue | undefined {
  if (!v || v.t !== "dict") return undefined;
  return v.entries.find(([k]) => k === key)?.[1];
}
