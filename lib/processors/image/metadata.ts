/**
 * Lossless metadata stripping for JPEG, PNG and WebP, operating directly on file bytes.
 * Pixel data is copied byte-for-byte, so there is no re-compression and no quality loss.
 */

export interface StripOptions {
  /** Keep the embedded ICC colour profile (recommended: removing it can shift colours). */
  keepIcc: boolean;
  /** JPEG only: write a minimal EXIF block containing only the Orientation tag, so rotated photos still display upright. */
  keepOrientation: boolean;
}

export interface StripResult {
  bytes: Uint8Array;
  /** Human-readable list of what was removed (e.g. "EXIF (APP1, 12.3 KB)"). */
  removed: { label: string; bytes: number }[];
  /** Notes such as "Kept ICC profile" or "Re-wrote orientation". */
  notes: string[];
}

export class MetadataError extends Error {}

/* ------------------------------------------------------------------ */
/* JPEG                                                                */
/* ------------------------------------------------------------------ */

const ascii = (b: Uint8Array, off: number, len: number) => {
  let s = "";
  for (let i = off; i < off + len && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

interface JpegSegment {
  marker: number;
  /** Offset of the 0xFF marker byte. */
  start: number;
  /** Offset just past the segment. */
  end: number;
  /** Payload (after the 2-byte length). */
  dataStart: number;
}

/** Lists header segments up to (not including) the first SOS. */
export function jpegSegments(b: Uint8Array): { segments: JpegSegment[]; sosOffset: number } {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new MetadataError("Not a JPEG file (missing SOI marker).");
  const segments: JpegSegment[] = [];
  let p = 2;
  while (p < b.length) {
    if (b[p] !== 0xff) throw new MetadataError(`Corrupt JPEG: expected a marker at byte ${p}.`);
    while (b[p] === 0xff) p++; // fill bytes
    const marker = b[p];
    const start = p - 1;
    p++;
    if (marker === 0xda) return { segments, sosOffset: start };
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (marker === 0xd9) throw new MetadataError("Corrupt JPEG: end of image before any scan data.");
    const len = (b[p] << 8) | b[p + 1];
    if (len < 2 || p + len > b.length) throw new MetadataError("Corrupt JPEG: segment length out of range.");
    segments.push({ marker, start, end: p + len, dataStart: p + 2 });
    p += len;
  }
  throw new MetadataError("Corrupt JPEG: no image data (SOS) found.");
}

/**
 * Returns the offset just past the primary image's EOI, scanning entropy-coded data and any
 * segments between progressive scans. Data after it (MPF secondary images, gain maps, appended
 * payloads) is not part of the displayed image.
 */
export function jpegPrimaryEnd(b: Uint8Array, sosOffset: number): number {
  let p = sosOffset;
  while (p < b.length - 1) {
    if (b[p] !== 0xff) {
      p++;
      continue;
    }
    const m = b[p + 1];
    if (m === 0x00 || m === 0xff || (m >= 0xd0 && m <= 0xd7)) {
      p += m === 0xff ? 1 : 2;
      continue;
    }
    if (m === 0xd9) return p + 2;
    // A real marker segment (SOS, DHT, DQT, DRI, …): skip its payload.
    const len = (b[p + 2] << 8) | b[p + 3];
    if (len < 2) return b.length;
    p += 2 + len;
  }
  return b.length;
}

/** Reads the EXIF Orientation (1–8) from a JPEG, or null if absent. */
export function readJpegOrientation(b: Uint8Array): number | null {
  try {
    const { segments } = jpegSegments(b);
    for (const s of segments) {
      if (s.marker === 0xe1 && ascii(b, s.dataStart, 6) === "Exif\0\0") return readTiffOrientation(b.subarray(s.dataStart + 6, s.end));
    }
  } catch {
    return null;
  }
  return null;
}

/** Reads tag 0x0112 from IFD0 of a TIFF/EXIF block. */
export function readTiffOrientation(t: Uint8Array): number | null {
  if (t.length < 8) return null;
  const le = t[0] === 0x49 && t[1] === 0x49;
  if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) return null;
  const u16 = (o: number) => (le ? t[o] | (t[o + 1] << 8) : (t[o] << 8) | t[o + 1]);
  const u32 = (o: number) => (le ? (t[o] | (t[o + 1] << 8) | (t[o + 2] << 16) | (t[o + 3] << 24)) >>> 0 : ((t[o] << 24) | (t[o + 1] << 16) | (t[o + 2] << 8) | t[o + 3]) >>> 0);
  const ifd = u32(4);
  if (ifd + 2 > t.length) return null;
  const n = u16(ifd);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > t.length) break;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : null;
    }
  }
  return null;
}

/** Builds an APP1 segment containing a big-endian TIFF with a single Orientation tag. */
export function buildOrientationApp1(orientation: number): Uint8Array {
  const tiff = [
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // header, IFD0 at 8
    0x00, 0x01, // 1 entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, (orientation >> 8) & 0xff, orientation & 0xff, 0x00, 0x00, // Orientation SHORT
    0x00, 0x00, 0x00, 0x00, // next IFD
  ];
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]; // "Exif\0\0"
  const len = payload.length + 2;
  return Uint8Array.from([0xff, 0xe1, (len >> 8) & 0xff, len & 0xff, ...payload]);
}

function describeJpegSegment(b: Uint8Array, s: JpegSegment): { remove: boolean; label: string; icc?: boolean } {
  const m = s.marker;
  const id = ascii(b, s.dataStart, Math.min(32, s.end - s.dataStart));
  if (m === 0xe0) {
    if (id.startsWith("JFIF\0")) return { remove: false, label: "JFIF header" };
    if (id.startsWith("JFXX\0")) return { remove: true, label: "JFIF thumbnail (APP0)" };
    return { remove: true, label: "APP0 data" };
  }
  if (m === 0xe1) {
    if (id.startsWith("Exif\0")) return { remove: true, label: "EXIF (camera, date, GPS, thumbnail)" };
    if (id.startsWith("http://ns.adobe.com/xap/1.0/")) return { remove: true, label: "XMP" };
    if (id.startsWith("http://ns.adobe.com/xmp/extension/")) return { remove: true, label: "Extended XMP" };
    return { remove: true, label: "APP1 data" };
  }
  if (m === 0xe2) {
    if (id.startsWith("ICC_PROFILE\0")) return { remove: true, label: "ICC colour profile", icc: true };
    if (id.startsWith("MPF\0")) return { remove: true, label: "Multi-picture index (MPF)" };
    if (id.startsWith("FPXR")) return { remove: true, label: "FlashPix data" };
    return { remove: true, label: "APP2 data" };
  }
  if (m === 0xed) return { remove: true, label: "IPTC / Photoshop (APP13)" };
  if (m === 0xee) return { remove: false, label: "Adobe colour transform (APP14)" };
  if (m === 0xfe) return { remove: true, label: "Comment (COM)" };
  if (m >= 0xe3 && m <= 0xef) return { remove: true, label: `APP${m - 0xe0} data` };
  return { remove: false, label: "image data" };
}

export function stripJpeg(b: Uint8Array, opts: StripOptions): StripResult {
  const { segments, sosOffset } = jpegSegments(b);
  const end = jpegPrimaryEnd(b, sosOffset);
  const orientation = opts.keepOrientation ? readJpegOrientation(b) : null;
  const removed: StripResult["removed"] = [];
  const notes: string[] = [];
  const parts: Uint8Array[] = [Uint8Array.from([0xff, 0xd8])];
  let insertedOrientation = false;
  const insertOrientation = () => {
    if (insertedOrientation || !orientation || orientation === 1) return;
    parts.push(buildOrientationApp1(orientation));
    insertedOrientation = true;
    notes.push(`Kept orientation (${orientation}) in a minimal EXIF block so the photo still displays upright.`);
  };
  let firstNonApp0 = true;
  for (const s of segments) {
    if (s.marker !== 0xe0 && firstNonApp0) {
      insertOrientation();
      firstNonApp0 = false;
    }
    const d = describeJpegSegment(b, s);
    const remove = d.icc ? !opts.keepIcc : d.remove;
    if (remove) removed.push({ label: d.label, bytes: s.end - s.start });
    else {
      parts.push(b.subarray(s.start, s.end));
      if (d.icc) notes.push("Kept the ICC colour profile.");
    }
  }
  insertOrientation();
  parts.push(b.subarray(sosOffset, end));
  if (end < b.length) removed.push({ label: "Trailing data after the image (e.g. embedded previews, depth or gain maps)", bytes: b.length - end });
  return { bytes: concat(parts), removed: mergeRemoved(removed), notes: dedupe(notes) };
}

/* ------------------------------------------------------------------ */
/* PNG                                                                 */
/* ------------------------------------------------------------------ */

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_REMOVE: Record<string, string> = {
  tEXt: "Text chunk (tEXt)",
  zTXt: "Compressed text (zTXt)",
  iTXt: "International text / XMP (iTXt)",
  eXIf: "EXIF (eXIf)",
  tIME: "Modification time (tIME)",
  caBX: "Content credentials (caBX)",
};

export function pngChunks(b: Uint8Array): { type: string; start: number; end: number }[] {
  for (let i = 0; i < 8; i++) if (b[i] !== PNG_SIG[i]) throw new MetadataError("Not a PNG file (bad signature).");
  const out: { type: string; start: number; end: number }[] = [];
  let p = 8;
  while (p + 12 <= b.length) {
    const len = ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
    const type = ascii(b, p + 4, 4);
    const end = p + 12 + len;
    if (end > b.length) throw new MetadataError(`Corrupt PNG: chunk ${type} runs past the end of the file.`);
    out.push({ type, start: p, end });
    p = end;
    if (type === "IEND") break;
  }
  return out;
}

export function stripPng(b: Uint8Array, opts: StripOptions): StripResult {
  const chunks = pngChunks(b);
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  const removed: StripResult["removed"] = [];
  const notes: string[] = [];
  let last = 8;
  for (const c of chunks) {
    let label = PNG_REMOVE[c.type];
    if (c.type === "iCCP") {
      if (opts.keepIcc) notes.push("Kept the ICC colour profile.");
      else label = "ICC colour profile (iCCP)";
    }
    if (label) removed.push({ label, bytes: c.end - c.start });
    else parts.push(b.subarray(c.start, c.end));
    last = c.end;
  }
  if (last < b.length) removed.push({ label: "Trailing data after IEND", bytes: b.length - last });
  return { bytes: concat(parts), removed: mergeRemoved(removed), notes };
}

/* ------------------------------------------------------------------ */
/* WebP                                                                */
/* ------------------------------------------------------------------ */

export function webpChunks(b: Uint8Array): { fourcc: string; start: number; dataStart: number; size: number; end: number }[] {
  if (ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") throw new MetadataError("Not a WebP file.");
  const out = [];
  let p = 12;
  const riffEnd = Math.min(b.length, 8 + (b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24)));
  while (p + 8 <= riffEnd) {
    const fourcc = ascii(b, p, 4);
    const size = (b[p + 4] | (b[p + 5] << 8) | (b[p + 6] << 16) | (b[p + 7] << 24)) >>> 0;
    const end = p + 8 + size + (size & 1);
    if (p + 8 + size > b.length) throw new MetadataError(`Corrupt WebP: chunk ${fourcc} runs past the end of the file.`);
    out.push({ fourcc, start: p, dataStart: p + 8, size, end: Math.min(end, b.length) });
    p = end;
  }
  return out;
}

export function stripWebp(b: Uint8Array, opts: StripOptions): StripResult {
  const chunks = webpChunks(b);
  const removed: StripResult["removed"] = [];
  const notes: string[] = [];
  const kept: Uint8Array[] = [];
  let removedIcc = false;
  for (const c of chunks) {
    const label = c.fourcc === "EXIF" ? "EXIF" : c.fourcc === "XMP " ? "XMP" : c.fourcc === "ICCP" && !opts.keepIcc ? "ICC colour profile" : null;
    if (c.fourcc === "ICCP" && opts.keepIcc) notes.push("Kept the ICC colour profile.");
    if (label) {
      removed.push({ label, bytes: c.end - c.start });
      if (c.fourcc === "ICCP") removedIcc = true;
      continue;
    }
    const chunk = b.slice(c.start, c.end);
    if (c.fourcc === "VP8X" && chunk.length >= 9) {
      // Clear EXIF (0x08) and XMP (0x04) flags, and ICC (0x20) if removed.
      chunk[8] &= ~(0x08 | 0x04 | (removedIcc || !opts.keepIcc ? 0x20 : 0));
    }
    kept.push(chunk);
  }
  const body = concat(kept);
  const out = new Uint8Array(12 + body.length);
  out.set(b.subarray(0, 12));
  const riffSize = 4 + body.length;
  out[4] = riffSize & 0xff;
  out[5] = (riffSize >> 8) & 0xff;
  out[6] = (riffSize >> 16) & 0xff;
  out[7] = (riffSize >>> 24) & 0xff;
  out.set(body, 12);
  return { bytes: out, removed: mergeRemoved(removed), notes };
}

/**
 * Wraps the EXIF and XMP chunks of a WebP file into a minimal JPEG container so EXIF readers
 * that understand JPEG (such as exifr) can parse WebP metadata. Returns null if there is none.
 */
export function webpMetadataAsJpeg(b: Uint8Array): Uint8Array | null {
  const chunks = webpChunks(b);
  const parts: Uint8Array[] = [Uint8Array.from([0xff, 0xd8])];
  let found = false;
  for (const c of chunks) {
    if (c.fourcc !== "EXIF" && c.fourcc !== "XMP ") continue;
    let data = b.subarray(c.dataStart, c.dataStart + c.size);
    let prefix: Uint8Array;
    if (c.fourcc === "EXIF") {
      // Some encoders include the "Exif\0\0" header, most don't.
      if (ascii(data, 0, 6) === "Exif\0\0") data = data.subarray(6);
      prefix = new TextEncoder().encode("Exif\0\0");
    } else prefix = new TextEncoder().encode("http://ns.adobe.com/xap/1.0/\0");
    const len = prefix.length + data.length + 2;
    if (len > 0xffff) continue;
    parts.push(Uint8Array.from([0xff, 0xe1, len >> 8, len & 0xff]), prefix, data);
    found = true;
  }
  if (!found) return null;
  parts.push(Uint8Array.from([0xff, 0xd9]));
  return concat(parts);
}

/* ------------------------------------------------------------------ */

export type LosslessKind = "jpeg" | "png" | "webp";

export function losslessKind(b: Uint8Array): LosslessKind | null {
  if (b[0] === 0xff && b[1] === 0xd8) return "jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  return null;
}

export function stripLossless(b: Uint8Array, opts: StripOptions): (StripResult & { kind: LosslessKind }) | null {
  const kind = losslessKind(b);
  if (!kind) return null;
  const r = kind === "jpeg" ? stripJpeg(b, opts) : kind === "png" ? stripPng(b, opts) : stripWebp(b, opts);
  return { ...r, kind };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function mergeRemoved(list: StripResult["removed"]): StripResult["removed"] {
  const m = new Map<string, number>();
  for (const r of list) m.set(r.label, (m.get(r.label) ?? 0) + r.bytes);
  return [...m].map(([label, bytes]) => ({ label, bytes }));
}

function dedupe(xs: string[]) {
  return [...new Set(xs)];
}
