/**
 * Minimal ID3 implementation for MP3 files:
 * - reads ID3v2.2/2.3/2.4 (text frames, comments, TXXX, attached pictures) and ID3v1;
 * - writes ID3v2.3 (UTF-16 text where needed, COMM, APIC), preserving unknown v2.3 frames;
 * - strips ID3v2 (leading, repeated, and v2.4 appended), ID3v1, APEv2 and Lyrics3v2 tags.
 * Pure and node-testable; audio frames are never touched.
 */

export interface Id3Picture {
  mime: string;
  /** ID3 picture type; 3 = front cover. */
  type: number;
  description: string;
  data: Uint8Array;
}

export interface Id3Tags {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  year?: string;
  track?: string;
  genre?: string;
  comment?: string;
  composer?: string;
  picture?: Id3Picture | null;
}

export interface Id3ReadResult {
  version: string | null;
  tags: Id3Tags;
  /** All frames as id → display text (pictures shown as "image/jpeg, 34 KB"). */
  frames: { id: string; value: string }[];
  hasV1: boolean;
  hasApe: boolean;
  /** Byte length of the leading ID3v2 tag (0 if none). */
  v2Size: number;
  /** Raw v2.3 frames not mapped to Id3Tags (preserved when writing). */
  unknownFrames: { id: string; flags: number; data: Uint8Array }[];
}

const FIELD_FRAMES: Record<string, keyof Id3Tags> = {
  TIT2: "title",
  TPE1: "artist",
  TALB: "album",
  TPE2: "albumArtist",
  TYER: "year",
  TDRC: "year",
  TRCK: "track",
  TCON: "genre",
  TCOM: "composer",
};

const V22_MAP: Record<string, string> = {
  TT2: "TIT2",
  TP1: "TPE1",
  TAL: "TALB",
  TP2: "TPE2",
  TYE: "TYER",
  TRK: "TRCK",
  TCO: "TCON",
  TCM: "TCOM",
  COM: "COMM",
  PIC: "APIC",
  TXX: "TXXX",
};

export const ID3V1_GENRES = [
  "Blues", "Classic Rock", "Country", "Dance", "Disco", "Funk", "Grunge", "Hip-Hop", "Jazz", "Metal", "New Age", "Oldies", "Other", "Pop", "R&B", "Rap", "Reggae", "Rock", "Techno", "Industrial", "Alternative", "Ska", "Death Metal", "Pranks", "Soundtrack", "Euro-Techno", "Ambient", "Trip-Hop", "Vocal", "Jazz+Funk", "Fusion", "Trance", "Classical", "Instrumental", "Acid", "House", "Game", "Sound Clip", "Gospel", "Noise", "Alternative Rock", "Bass", "Soul", "Punk", "Space", "Meditative", "Instrumental Pop", "Instrumental Rock", "Ethnic", "Gothic", "Darkwave", "Techno-Industrial", "Electronic", "Pop-Folk", "Eurodance", "Dream", "Southern Rock", "Comedy", "Cult", "Gangsta", "Top 40", "Christian Rap", "Pop/Funk", "Jungle", "Native American", "Cabaret", "New Wave", "Psychedelic", "Rave", "Showtunes", "Trailer", "Lo-Fi", "Tribal", "Acid Punk", "Acid Jazz", "Polka", "Retro", "Musical", "Rock & Roll", "Hard Rock",
];

export function syncsafeDecode(b: Uint8Array, o: number): number {
  return ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
}

export function syncsafeEncode(n: number): Uint8Array {
  if (n < 0 || n > 0x0fffffff) throw new Error("ID3 tag too large.");
  return new Uint8Array([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
}

/** Length of an ID3v2 tag starting at `o`, including header and footer, or 0. */
export function id3v2Length(b: Uint8Array, o = 0): number {
  if (b.length < o + 10 || b[o] !== 0x49 || b[o + 1] !== 0x44 || b[o + 2] !== 0x33) return 0;
  if (b[o + 3] === 0xff || b[o + 4] === 0xff) return 0;
  const footer = b[o + 5] & 0x10 ? 10 : 0;
  return 10 + syncsafeDecode(b, o + 6) + footer;
}

function removeUnsync(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(b.length);
  let j = 0;
  for (let i = 0; i < b.length; i++) {
    out[j++] = b[i];
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return out.subarray(0, j);
}

function decodeText(b: Uint8Array, enc: number): string {
  if (!b.length) return "";
  let s: string;
  if (enc === 0) s = Array.from(b, (c) => String.fromCharCode(c)).join("");
  else if (enc === 3) s = new TextDecoder("utf-8").decode(b);
  else if (enc === 2) s = new TextDecoder("utf-16be").decode(b);
  else {
    // UTF-16 with BOM
    if (b[0] === 0xfe && b[1] === 0xff) s = new TextDecoder("utf-16be").decode(b.subarray(2));
    else if (b[0] === 0xff && b[1] === 0xfe) s = new TextDecoder("utf-16le").decode(b.subarray(2));
    else s = new TextDecoder("utf-16le").decode(b);
  }
  return s.replace(/\u0000+$/, "");
}

/** Finds the end of a null-terminated string in the given encoding; returns [stringEnd, nextStart]. */
function findTerminator(b: Uint8Array, start: number, enc: number): [number, number] {
  if (enc === 1 || enc === 2) {
    for (let i = start; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return [i, i + 2];
    return [b.length, b.length];
  }
  for (let i = start; i < b.length; i++) if (b[i] === 0) return [i, i + 1];
  return [b.length, b.length];
}

function genreText(raw: string): string {
  // "(17)", "(17)Rock", "17" → "Rock"
  const m = /^\((\d+)\)(.*)$/.exec(raw) ?? /^(\d+)$/.exec(raw);
  if (m) return m[2] || ID3V1_GENRES[Number(m[1])] || raw;
  return raw;
}

export function readId3(bytes: Uint8Array): Id3ReadResult {
  const res: Id3ReadResult = { version: null, tags: {}, frames: [], hasV1: false, hasApe: false, v2Size: 0, unknownFrames: [] };
  const len = id3v2Length(bytes);
  if (len) {
    res.v2Size = len;
    const major = bytes[3];
    res.version = `ID3v2.${major}.${bytes[4]}`;
    const flags = bytes[5];
    let body = bytes.subarray(10, Math.min(bytes.length, len - (flags & 0x10 ? 10 : 0)));
    if (flags & 0x80 && major < 4) body = removeUnsync(body);
    let p = 0;
    if (flags & 0x40) {
      // Extended header
      p = major === 3 ? 4 + ((body[0] << 24) | (body[1] << 16) | (body[2] << 8) | body[3]) : syncsafeDecode(body, 0);
    }
    const idLen = major === 2 ? 3 : 4;
    const hdrLen = major === 2 ? 6 : 10;
    while (p + hdrLen <= body.length) {
      if (body[p] === 0) break; // padding
      let id = String.fromCharCode(...body.subarray(p, p + idLen));
      if (!/^[A-Z0-9]+$/.test(id)) break;
      let size: number;
      let fflags = 0;
      if (major === 2) size = (body[p + 3] << 16) | (body[p + 4] << 8) | body[p + 5];
      else if (major === 4) size = syncsafeDecode(body, p + 4);
      else size = ((body[p + 4] << 24) >>> 0) + (body[p + 5] << 16) + (body[p + 6] << 8) + body[p + 7];
      if (major > 2) fflags = (body[p + 8] << 8) | body[p + 9];
      let data = body.subarray(p + hdrLen, Math.min(body.length, p + hdrLen + size));
      p += hdrLen + size;
      if (major === 2) id = V22_MAP[id] ?? id;
      if (major === 4 && fflags & 0x0002) data = removeUnsync(data);
      if (major === 4 && fflags & 0x0001) data = data.subarray(4); // data length indicator
      const compressedOrEncrypted = major === 3 ? fflags & 0x00c0 : major === 4 ? fflags & 0x000c : 0;
      if (compressedOrEncrypted) {
        res.frames.push({ id, value: "(compressed or encrypted frame)" });
        if (major === 3) res.unknownFrames.push({ id, flags: fflags, data });
        continue;
      }
      parseFrame(id, data, major, res, fflags);
    }
  }
  // Trailing tags
  const v1 = bytes.length >= 128 ? bytes.length - 128 : -1;
  if (v1 >= 0 && bytes[v1] === 0x54 && bytes[v1 + 1] === 0x41 && bytes[v1 + 2] === 0x47) {
    res.hasV1 = true;
    const str = (a: number, n: number) => decodeText(trimNull(bytes.subarray(v1 + a, v1 + a + n)), 0).trim();
    const v1tags: Id3Tags = { title: str(3, 30), artist: str(33, 30), album: str(63, 30), year: str(93, 4), comment: str(97, 30) };
    if (bytes[v1 + 125] === 0 && bytes[v1 + 126] !== 0) {
      v1tags.comment = str(97, 28);
      v1tags.track = String(bytes[v1 + 126]);
    }
    const g = bytes[v1 + 127];
    if (g < ID3V1_GENRES.length) v1tags.genre = ID3V1_GENRES[g];
    for (const [k, v] of Object.entries(v1tags) as [keyof Id3Tags, string][]) {
      if (v && !res.tags[k]) (res.tags as Record<string, unknown>)[k] = v;
    }
    if (!res.version) res.version = "ID3v1";
  }
  res.hasApe = findApe(bytes) != null;
  return res;
}

function trimNull(b: Uint8Array): Uint8Array {
  const i = b.indexOf(0);
  return i >= 0 ? b.subarray(0, i) : b;
}

function parseFrame(id: string, data: Uint8Array, major: number, res: Id3ReadResult, flags: number) {
  if (!data.length) return;
  const enc = data[0];
  if (id[0] === "T" && id !== "TXXX") {
    const text = decodeText(data.subarray(1), enc).split("\u0000").filter(Boolean).join(" / ");
    const value = id === "TCON" ? genreText(text) : text;
    res.frames.push({ id, value });
    const field = FIELD_FRAMES[id];
    if (field && field !== "picture") (res.tags as Record<string, string>)[field] = id === "TDRC" ? value.slice(0, 4) : value;
    else if (major === 3) res.unknownFrames.push({ id, flags, data });
    return;
  }
  if (id === "TXXX") {
    const [e, n] = findTerminator(data, 1, enc);
    res.frames.push({ id: `TXXX:${decodeText(data.subarray(1, e), enc)}`, value: decodeText(data.subarray(n), enc) });
    if (major === 3) res.unknownFrames.push({ id, flags, data });
    return;
  }
  if (id === "COMM" || id === "USLT") {
    const [e, n] = findTerminator(data, 4, enc);
    const desc = decodeText(data.subarray(4, e), enc);
    const text = decodeText(data.subarray(n), enc);
    res.frames.push({ id: desc ? `${id}:${desc}` : id, value: text });
    if (id === "COMM" && !res.tags.comment && !desc.startsWith("iTun")) res.tags.comment = text;
    else if (major === 3) res.unknownFrames.push({ id, flags, data });
    return;
  }
  if (id === "APIC") {
    let mime: string;
    let p: number;
    if (major === 2) {
      const fmt = String.fromCharCode(data[1], data[2], data[3]).toUpperCase();
      mime = fmt === "PNG" ? "image/png" : "image/jpeg";
      p = 4;
    } else {
      const [e, n] = findTerminator(data, 1, 0);
      mime = decodeText(data.subarray(1, e), 0) || "image/jpeg";
      if (!mime.includes("/")) mime = `image/${mime.toLowerCase()}`;
      p = n;
    }
    const type = data[p];
    const [e2, n2] = findTerminator(data, p + 1, enc);
    const pic: Id3Picture = { mime, type, description: decodeText(data.subarray(p + 1, e2), enc), data: data.slice(n2) };
    res.frames.push({ id, value: `${mime}, ${Math.round(pic.data.length / 1024)} KB` });
    if (!res.tags.picture || type === 3) res.tags.picture = pic;
    else if (major === 3) res.unknownFrames.push({ id, flags, data });
    return;
  }
  res.frames.push({ id, value: `${data.length} bytes` });
  if (major === 3) res.unknownFrames.push({ id, flags, data });
}

function isLatin1(s: string): boolean {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 0xff) return false;
  return true;
}

function encodeText(s: string, enc: 0 | 1): Uint8Array {
  if (enc === 0) return Uint8Array.from(s, (c) => c.charCodeAt(0));
  const out = new Uint8Array(2 + s.length * 2);
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[2 + i * 2] = c & 0xff;
    out[3 + i * 2] = c >> 8;
  }
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function frame(id: string, body: Uint8Array, flags = 0): Uint8Array {
  const h = new Uint8Array(10);
  for (let i = 0; i < 4; i++) h[i] = id.charCodeAt(i);
  const n = body.length;
  h[4] = (n >>> 24) & 0xff;
  h[5] = (n >>> 16) & 0xff;
  h[6] = (n >>> 8) & 0xff;
  h[7] = n & 0xff;
  h[8] = (flags >> 8) & 0xff;
  h[9] = flags & 0xff;
  return concatBytes([h, body]);
}

function textFrame(id: string, value: string): Uint8Array {
  const enc = isLatin1(value) ? 0 : 1;
  return frame(id, concatBytes([new Uint8Array([enc]), encodeText(value, enc)]));
}

/** Builds an ID3v2.3 tag. */
export function buildId3v23(tags: Id3Tags, extra: { id: string; flags: number; data: Uint8Array }[] = [], padding = 512): Uint8Array {
  const frames: Uint8Array[] = [];
  const order: [keyof Id3Tags, string][] = [
    ["title", "TIT2"],
    ["artist", "TPE1"],
    ["album", "TALB"],
    ["albumArtist", "TPE2"],
    ["year", "TYER"],
    ["track", "TRCK"],
    ["genre", "TCON"],
    ["composer", "TCOM"],
  ];
  for (const [k, id] of order) {
    const v = (tags[k] as string | undefined)?.trim();
    if (v) frames.push(textFrame(id, v));
  }
  if (tags.comment?.trim()) {
    const v = tags.comment.trim();
    const enc = isLatin1(v) ? 0 : 1;
    const term = enc === 1 ? new Uint8Array([0xff, 0xfe, 0, 0]) : new Uint8Array([0]);
    frames.push(frame("COMM", concatBytes([new Uint8Array([enc]), Uint8Array.from("eng", (c) => c.charCodeAt(0)), term, encodeText(v, enc)])));
  }
  if (tags.picture?.data.length) {
    const p = tags.picture;
    frames.push(frame("APIC", concatBytes([new Uint8Array([0]), Uint8Array.from(p.mime, (c) => c.charCodeAt(0) & 0xff), new Uint8Array([0, p.type & 0xff, 0]), p.data])));
  }
  for (const f of extra) if (/^[A-Z0-9]{4}$/.test(f.id)) frames.push(frame(f.id, f.data, f.flags));
  const body = concatBytes([...frames, new Uint8Array(padding)]);
  const header = concatBytes([new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0]), syncsafeEncode(body.length)]);
  return concatBytes([header, body]);
}

/** Byte range of an APEv2 tag (with optional header) at the end of the file, before ID3v1. */
function findApe(b: Uint8Array): [number, number] | null {
  let end = b.length;
  if (end >= 128 && b[end - 128] === 0x54 && b[end - 127] === 0x41 && b[end - 126] === 0x47) end -= 128;
  const f = end - 32;
  if (f < 0) return null;
  if (String.fromCharCode(...b.subarray(f, f + 8)) !== "APETAGEX") return null;
  const size = b[f + 12] | (b[f + 13] << 8) | (b[f + 14] << 16) | (b[f + 15] << 24);
  const flags = b[f + 20] | (b[f + 21] << 8) | (b[f + 22] << 16) | (b[f + 23] << 24);
  const hasHeader = (flags & 0x80000000) !== 0;
  const start = end - size - (hasHeader ? 32 : 0);
  return start >= 0 ? [start, end] : null;
}

export interface StripResult {
  bytes: Uint8Array;
  removed: string[];
}

/** Removes every tag from an MP3, returning only the audio frames. */
export function stripId3(input: Uint8Array): StripResult {
  const removed: string[] = [];
  let start = 0;
  let end = input.length;
  // Leading ID3v2 tags (some files carry several).
  for (let l = id3v2Length(input, start); l; l = id3v2Length(input, start)) {
    removed.push(`ID3v2.${input[start + 3]} (${l} bytes)`);
    start += l;
  }
  // Loop over trailing tags in any order.
  for (let changed = true; changed; ) {
    changed = false;
    if (end - start >= 128 && input[end - 128] === 0x54 && input[end - 127] === 0x41 && input[end - 126] === 0x47) {
      end -= 128;
      removed.push("ID3v1 (128 bytes)");
      changed = true;
      continue;
    }
    const ape = findApe(input.subarray(start, end));
    if (ape) {
      removed.push(`APEv2 (${ape[1] - ape[0]} bytes)`);
      end = start + ape[0];
      changed = true;
      continue;
    }
    if (end - start >= 15 && String.fromCharCode(...input.subarray(end - 9, end)) === "LYRICS200") {
      const size = Number(String.fromCharCode(...input.subarray(end - 15, end - 9)));
      if (Number.isFinite(size) && size + 15 <= end - start) {
        removed.push(`Lyrics3v2 (${size + 15} bytes)`);
        end -= size + 15;
        changed = true;
        continue;
      }
    }
    // ID3v2.4 footer appended at the end ("3DI").
    if (end - start >= 10 && input[end - 10] === 0x33 && input[end - 9] === 0x44 && input[end - 8] === 0x49) {
      const l = syncsafeDecode(input, end - 4) + 20;
      if (l <= end - start) {
        removed.push(`ID3v2.4 appended (${l} bytes)`);
        end -= l;
        changed = true;
      }
    }
  }
  return { bytes: input.slice(start, end), removed };
}

/** Replaces all tags with a fresh ID3v2.3 tag built from `tags`. */
export function writeId3(input: Uint8Array, tags: Id3Tags, preserve: { id: string; flags: number; data: Uint8Array }[] = []): Uint8Array {
  const audio = stripId3(input).bytes;
  return concatBytes([buildId3v23(tags, preserve), audio]);
}

/** True if the bytes look like an MP3 (ID3 tag or MPEG audio frame sync). */
export function looksLikeMp3(b: Uint8Array): boolean {
  if (id3v2Length(b)) return true;
  return b.length > 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && ((b[1] >> 1) & 3) !== 0;
}
