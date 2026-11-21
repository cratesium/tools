/**
 * Minimal, dependency-free TAR reader/writer.
 *
 * Reads: POSIX ustar (with the 155-byte name prefix), GNU long names/links ("L"/"K"),
 * PAX extended headers ("x", per-entry path/size/mtime/linkpath) and global headers ("g", ignored),
 * old v7 headers. Every header checksum is verified.
 * Writes: ustar, with a PAX "x" header for names that do not fit ustar's name/prefix fields.
 */

export type TarEntryType = "file" | "directory" | "symlink" | "hardlink" | "other";

export interface TarEntry {
  name: string;
  size: number;
  type: TarEntryType;
  /** Milliseconds since epoch. */
  mtime: number;
  mode: number;
  linkName?: string;
  /** Payload (empty for directories/links). A view into the source buffer. */
  data: Uint8Array;
  /** Whether the stored header checksum matched. */
  checksumOk: boolean;
}

export interface TarWriteEntry {
  name: string;
  data?: Uint8Array;
  directory?: boolean;
  mtime?: number;
  mode?: number;
}

const BLOCK = 512;
const dec = new TextDecoder();
const enc = new TextEncoder();

function readString(buf: Uint8Array, off: number, len: number): string {
  let end = off;
  const max = off + len;
  while (end < max && buf[end] !== 0) end++;
  return dec.decode(buf.subarray(off, end));
}

function readOctal(buf: Uint8Array, off: number, len: number): number {
  // GNU base-256 encoding for large values: high bit of first byte set.
  if (buf[off] & 0x80) {
    let v = buf[off] & 0x7f;
    for (let i = 1; i < len; i++) v = v * 256 + buf[off + i];
    return v;
  }
  const s = readString(buf, off, len).trim();
  if (!s) return 0;
  const n = parseInt(s, 8);
  return Number.isFinite(n) ? n : 0;
}

function headerChecksum(buf: Uint8Array, off: number): number {
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : buf[off + i];
  return sum;
}

function isZeroBlock(buf: Uint8Array, off: number): boolean {
  for (let i = 0; i < BLOCK; i++) if (buf[off + i] !== 0) return false;
  return true;
}

/** True if the buffer starts with a plausible TAR header (ustar magic or valid checksum). */
export function looksLikeTar(buf: Uint8Array): boolean {
  if (buf.length < BLOCK) return false;
  const magic = readString(buf, 257, 6);
  if (magic.startsWith("ustar")) return true;
  if (isZeroBlock(buf, 0)) return false;
  const stored = readOctal(buf, 148, 8);
  return stored > 0 && stored === headerChecksum(buf, 0);
}

function parsePax(data: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < data.length) {
    let sp = i;
    while (sp < data.length && data[sp] !== 0x20) sp++;
    const len = parseInt(dec.decode(data.subarray(i, sp)), 10);
    if (!Number.isFinite(len) || len <= 0) break;
    const record = dec.decode(data.subarray(sp + 1, i + len - 1)); // strip trailing \n
    const eq = record.indexOf("=");
    if (eq > 0) out[record.slice(0, eq)] = record.slice(eq + 1);
    i += len;
  }
  return out;
}

/**
 * Parses a TAR archive. Throws on a corrupt header (bad checksum on a non-final block)
 * when `strict` is true; otherwise records `checksumOk: false` and continues.
 */
export function parseTar(buf: Uint8Array, { strict = false }: { strict?: boolean } = {}): TarEntry[] {
  const entries: TarEntry[] = [];
  let off = 0;
  let longName: string | null = null;
  let longLink: string | null = null;
  let pax: Record<string, string> = {};

  while (off + BLOCK <= buf.length) {
    if (isZeroBlock(buf, off)) break;
    const stored = readOctal(buf, off + 148, 8);
    const checksumOk = stored === headerChecksum(buf, off);
    if (!checksumOk && strict) throw new Error(`Corrupt TAR header at offset ${off} (checksum mismatch).`);
    if (!checksumOk && entries.length === 0 && !readString(buf, off + 257, 6).startsWith("ustar"))
      throw new Error("Not a valid TAR archive (header checksum mismatch).");

    const typeflag = String.fromCharCode(buf[off + 156] || 0x30);
    let size = readOctal(buf, off + 124, 12);
    if (pax.size) size = Number(pax.size);
    const dataStart = off + BLOCK;
    if (dataStart + size > buf.length) throw new Error(`TAR archive is truncated (entry at offset ${off} needs ${size} bytes).`);
    const data = buf.subarray(dataStart, dataStart + size);
    const next = dataStart + Math.ceil(size / BLOCK) * BLOCK;

    if (typeflag === "L") {
      longName = readString(data, 0, data.length);
      off = next;
      continue;
    }
    if (typeflag === "K") {
      longLink = readString(data, 0, data.length);
      off = next;
      continue;
    }
    if (typeflag === "x") {
      pax = parsePax(data);
      off = next;
      continue;
    }
    if (typeflag === "g") {
      off = next;
      continue;
    }

    let name = readString(buf, off, 100);
    const magic = readString(buf, off + 257, 6);
    if (magic.startsWith("ustar")) {
      const prefix = readString(buf, off + 345, 155);
      if (prefix && magic === "ustar") name = `${prefix}/${name}`;
    }
    if (longName) name = longName;
    if (pax.path) name = pax.path;
    let linkName = readString(buf, off + 157, 100) || undefined;
    if (longLink) linkName = longLink;
    if (pax.linkpath) linkName = pax.linkpath;

    let mtime = readOctal(buf, off + 136, 12) * 1000;
    if (pax.mtime) mtime = Math.round(Number(pax.mtime) * 1000);

    let type: TarEntryType = "other";
    if (typeflag === "0" || typeflag === "\0" || typeflag === "7") type = name.endsWith("/") ? "directory" : "file";
    else if (typeflag === "5") type = "directory";
    else if (typeflag === "2") type = "symlink";
    else if (typeflag === "1") type = "hardlink";

    entries.push({
      name: name.replace(/^\.\//, ""),
      size: type === "file" ? size : 0,
      type,
      mtime,
      mode: readOctal(buf, off + 100, 8),
      linkName,
      data: type === "file" ? data : new Uint8Array(0),
      checksumOk,
    });
    longName = null;
    longLink = null;
    pax = {};
    off = next;
  }
  return entries.filter((e) => e.name !== "" && e.name !== ".");
}

function writeString(buf: Uint8Array, off: number, len: number, s: string) {
  const b = enc.encode(s);
  buf.set(b.subarray(0, len), off);
}

function writeOctal(buf: Uint8Array, off: number, len: number, n: number) {
  const s = Math.max(0, Math.floor(n)).toString(8).padStart(len - 1, "0");
  if (s.length > len - 1) {
    // base-256 for values that don't fit (e.g. >8 GiB sizes)
    buf[off] = 0x80;
    let v = Math.floor(n);
    for (let i = len - 1; i > 0; i--) {
      buf[off + i] = v % 256;
      v = Math.floor(v / 256);
    }
    return;
  }
  writeString(buf, off, len - 1, s);
  buf[off + len - 1] = 0;
}

function splitUstarName(name: string): { name: string; prefix: string } | null {
  if (enc.encode(name).length <= 100) return { name, prefix: "" };
  for (let i = name.length - 1; i > 0; i--) {
    if (name[i] !== "/") continue;
    const prefix = name.slice(0, i);
    const rest = name.slice(i + 1);
    if (enc.encode(prefix).length <= 155 && enc.encode(rest).length <= 100 && rest) return { name: rest, prefix };
  }
  return null;
}

function header(name: string, size: number, typeflag: string, mtime: number, mode: number, prefix = ""): Uint8Array {
  const h = new Uint8Array(BLOCK);
  writeString(h, 0, 100, name);
  writeOctal(h, 100, 8, mode);
  writeOctal(h, 108, 8, 0);
  writeOctal(h, 116, 8, 0);
  writeOctal(h, 124, 12, size);
  writeOctal(h, 136, 12, Math.floor(mtime / 1000));
  h[156] = typeflag.charCodeAt(0);
  writeString(h, 257, 6, "ustar");
  h[262] = 0;
  writeString(h, 263, 2, "00");
  writeString(h, 345, 155, prefix);
  const sum = headerChecksum(h, 0);
  writeString(h, 148, 6, sum.toString(8).padStart(6, "0"));
  h[154] = 0;
  h[155] = 0x20;
  return h;
}

function paxRecord(key: string, value: string): string {
  const body = ` ${key}=${value}\n`;
  const base = enc.encode(body).length;
  let len = base + 1;
  while (base + String(len).length !== len) len = base + String(len).length;
  return `${len}${body}`;
}

/** Creates a ustar archive. Directories should end with "/" or set `directory: true`. */
export function createTar(entries: TarWriteEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const e of entries) {
    const dir = e.directory || e.name.endsWith("/");
    const name = dir && !e.name.endsWith("/") ? `${e.name}/` : e.name;
    const data = dir ? new Uint8Array(0) : (e.data ?? new Uint8Array(0));
    const mtime = e.mtime ?? Date.now();
    const mode = e.mode ?? (dir ? 0o755 : 0o644);
    const split = splitUstarName(name);
    if (!split) {
      const paxData = enc.encode(paxRecord("path", name));
      parts.push(header("PaxHeader", paxData.length, "x", mtime, 0o644));
      parts.push(padBlock(paxData));
      parts.push(header(name.slice(-100).replace(/^\/+/, ""), data.length, dir ? "5" : "0", mtime, mode));
    } else {
      parts.push(header(split.name, data.length, dir ? "5" : "0", mtime, mode, split.prefix));
    }
    if (data.length) parts.push(padBlock(data));
  }
  parts.push(new Uint8Array(BLOCK * 2));
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function padBlock(data: Uint8Array): Uint8Array {
  const padded = Math.ceil(data.length / BLOCK) * BLOCK;
  if (padded === data.length) return data;
  const out = new Uint8Array(padded);
  out.set(data);
  return out;
}
