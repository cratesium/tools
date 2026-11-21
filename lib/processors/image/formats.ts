/** Image format metadata shared by converters, compressors and base64 tools. */

export type OutputFormat = "jpeg" | "png" | "webp" | "bmp";

export interface FormatInfo {
  id: OutputFormat;
  label: string;
  mime: string;
  ext: string;
  lossy: boolean;
  alpha: boolean;
}

export const outputFormats: Record<OutputFormat, FormatInfo> = {
  jpeg: { id: "jpeg", label: "JPG", mime: "image/jpeg", ext: "jpg", lossy: true, alpha: false },
  png: { id: "png", label: "PNG", mime: "image/png", ext: "png", lossy: false, alpha: true },
  webp: { id: "webp", label: "WebP", mime: "image/webp", ext: "webp", lossy: true, alpha: true },
  bmp: { id: "bmp", label: "BMP", mime: "image/bmp", ext: "bmp", lossy: false, alpha: true },
};

/** Normalises user/option spellings ("jpg", "JPEG", "image/jpeg") to an OutputFormat. */
export function normalizeFormat(v: string | undefined | null): OutputFormat | null {
  if (!v) return null;
  const s = v.toLowerCase().replace(/^image\//, "").replace(/^\./, "");
  if (s === "jpg" || s === "jpeg" || s === "pjpeg") return "jpeg";
  if (s === "png" || s === "apng") return "png";
  if (s === "webp") return "webp";
  if (s === "bmp" || s === "x-ms-bmp") return "bmp";
  return null;
}

const extMime: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  png: "image/png",
  apng: "image/apng",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  tif: "image/tiff",
  tiff: "image/tiff",
};

export function mimeFromName(name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return extMime[ext] ?? null;
}

export function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  for (const [ext, v] of Object.entries(extMime)) if (v === m && ext !== "jpeg" && ext !== "jfif" && ext !== "tif") return ext;
  return "bin";
}

/** Detects an image type from its first bytes. Returns a MIME type or null. */
export function detectImageMime(b: Uint8Array): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp";
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
  if (b.length >= 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return "image/x-icon";
  if (b.length >= 4 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a)))
    return "image/tiff";
  if (b.length >= 12 && ascii(b, 4, 4) === "ftyp") {
    const brand = ascii(b, 8, 4);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (["heic", "heix", "hevc", "hevx", "heim", "heis"].includes(brand)) return "image/heic";
    if (brand === "mif1" || brand === "msf1") return "image/heif";
  }
  // SVG: text starting (after BOM/whitespace/XML prolog/comments) with an <svg element.
  const head = new TextDecoder().decode(b.subarray(0, Math.min(b.length, 1024))).replace(/^﻿/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return "image/svg+xml";
  return null;
}

function ascii(b: Uint8Array, off: number, len: number): string {
  let s = "";
  for (let i = off; i < off + len && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

export function isHeic(file: { name: string; type: string }): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

export function isSvg(file: { name: string; type: string }): boolean {
  return file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
}
