import { inflateSync, gzipSync } from "fflate";
import { crc32 } from "./crc32";

export interface GzipHeader {
  /** Original file name stored in the header (FNAME), if any. */
  name: string | null;
  comment: string | null;
  /** Milliseconds since epoch, or null when unset (0). */
  mtime: number | null;
  os: number;
  headerLength: number;
}

export interface GzipMember {
  header: GzipHeader;
  data: Uint8Array;
  crcOk: boolean;
  sizeOk: boolean;
  storedCrc: number;
  computedCrc: number;
}

const FTEXT = 1,
  FHCRC = 2,
  FEXTRA = 4,
  FNAME = 8,
  FCOMMENT = 16;
void FTEXT;

function readZString(b: Uint8Array, off: number): [string, number] {
  let end = off;
  while (end < b.length && b[end] !== 0) end++;
  // FNAME is ISO-8859-1 per RFC 1952, but UTF-8 is common in practice.
  const s = new TextDecoder("utf-8", { fatal: false }).decode(b.subarray(off, end));
  return [s, end + 1];
}

export function parseGzipHeader(b: Uint8Array, off = 0): GzipHeader {
  if (b.length < off + 10 || b[off] !== 0x1f || b[off + 1] !== 0x8b) throw new Error("Not a GZIP stream (missing 1F 8B signature).");
  if (b[off + 2] !== 8) throw new Error(`Unsupported GZIP compression method ${b[off + 2]} (only DEFLATE is defined).`);
  const flags = b[off + 3];
  const mt = b[off + 4] | (b[off + 5] << 8) | (b[off + 6] << 16) | (b[off + 7] << 24);
  let p = off + 10;
  if (flags & FEXTRA) {
    const xlen = b[p] | (b[p + 1] << 8);
    p += 2 + xlen;
  }
  let name: string | null = null;
  let comment: string | null = null;
  if (flags & FNAME) [name, p] = readZString(b, p);
  if (flags & FCOMMENT) [comment, p] = readZString(b, p);
  if (flags & FHCRC) p += 2;
  if (p > b.length) throw new Error("GZIP header is truncated.");
  return { name, comment, mtime: mt ? (mt >>> 0) * 1000 : null, os: b[off + 9], headerLength: p - off };
}

function u32(b: Uint8Array, p: number): number {
  return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
}

/**
 * Decompresses a (possibly multi-member) GZIP stream and verifies every member's CRC-32 and ISIZE.
 * The end of each DEFLATE stream is located by matching the trailer (CRC + size) of the inflated data,
 * which doubles as integrity verification.
 */
export function gunzipMembers(b: Uint8Array): GzipMember[] {
  const members: GzipMember[] = [];
  let off = 0;
  while (off < b.length) {
    // Tolerate trailing zero padding (common on tapes / some tools).
    if (members.length && b.subarray(off).every((x) => x === 0)) break;
    const header = parseGzipHeader(b, off);
    const start = off + header.headerLength;
    let data: Uint8Array;
    try {
      data = inflateSync(b.subarray(start));
    } catch (e) {
      throw new Error(`GZIP data is corrupt: ${e instanceof Error ? e.message : String(e)}`);
    }
    const computedCrc = crc32(data);
    const isize = data.length >>> 0;
    // Find the trailer: either at the end, or right before the next member's 1F 8B 08.
    let trailer = -1;
    for (let p = start; p + 8 <= b.length; p++) {
      const atEnd = p + 8 === b.length;
      const beforeNext = !atEnd && b[p + 8] === 0x1f && b[p + 9] === 0x8b && b[p + 10] === 8;
      if (!atEnd && !beforeNext) continue;
      if (u32(b, p) === computedCrc && u32(b, p + 4) === isize) {
        trailer = p;
        break;
      }
    }
    if (trailer < 0) {
      // Report against the last 8 bytes, which is where a single-member trailer must live.
      const p = b.length - 8;
      members.push({
        header,
        data,
        crcOk: p >= start && u32(b, p) === computedCrc,
        sizeOk: p >= start && u32(b, p + 4) === isize,
        storedCrc: p >= start ? u32(b, p) : 0,
        computedCrc,
      });
      break;
    }
    members.push({ header, data, crcOk: true, sizeOk: true, storedCrc: u32(b, trailer), computedCrc });
    off = trailer + 8;
  }
  return members;
}

/** Decompresses GZIP data, throwing if any CRC/size check fails. */
export function gunzip(b: Uint8Array): { data: Uint8Array; header: GzipHeader } {
  const members = gunzipMembers(b);
  if (!members.length) throw new Error("Empty GZIP stream.");
  const bad = members.find((m) => !m.crcOk || !m.sizeOk);
  if (bad) throw new Error("GZIP CRC-32 check failed: the file is corrupt or truncated.");
  if (members.length === 1) return { data: members[0].data, header: members[0].header };
  const total = members.reduce((s, m) => s + m.data.length, 0);
  const data = new Uint8Array(total);
  let o = 0;
  for (const m of members) {
    data.set(m.data, o);
    o += m.data.length;
  }
  return { data, header: members[0].header };
}

export function gzip(data: Uint8Array, { level = 6, filename, mtime }: { level?: number; filename?: string; mtime?: number } = {}) {
  return gzipSync(data, {
    level: Math.max(0, Math.min(9, level)) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
    filename,
    mtime: mtime ?? Date.now(),
  });
}

/** Name to use for the decompressed output of a .gz file. */
export function gunzipOutputName(fileName: string, header: GzipHeader | null): string {
  if (header?.name) return header.name.split(/[\\/]/).pop() || header.name;
  const n = fileName.replace(/\.tgz$/i, ".tar").replace(/\.gz$/i, "");
  return n === fileName ? `${fileName}.out` : n;
}
