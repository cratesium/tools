/** Base64 encode/decode for text and bytes. Pure, no DOM. Works with UTF-8 and URL-safe (RFC 4648 §5). */

const STD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const URL_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export interface Base64EncodeOptions {
  urlSafe?: boolean;
  padding?: boolean;
  /** Wrap lines at this many characters (76 = MIME, 64 = PEM). 0 = no wrapping. */
  lineLength?: number;
}

export function bytesToBase64(bytes: Uint8Array, opts: Base64EncodeOptions = {}): string {
  const { urlSafe = false, padding = true, lineLength = 0 } = opts;
  const abc = urlSafe ? URL_SAFE : STD;
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63] + abc[(n >> 6) & 63] + abc[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63] + (padding ? "==" : "");
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63] + abc[(n >> 6) & 63] + (padding ? "=" : "");
  }
  if (lineLength > 0) {
    const lines: string[] = [];
    for (let j = 0; j < out.length; j += lineLength) lines.push(out.slice(j, j + lineLength));
    return lines.join("\r\n");
  }
  return out;
}

export function encodeBase64(text: string, opts: Base64EncodeOptions = {}): string {
  return bytesToBase64(new TextEncoder().encode(text), opts);
}

export class Base64Error extends Error {}

/**
 * Decodes standard or URL-safe Base64. Whitespace is ignored, padding is optional,
 * and a data: URL prefix is stripped. Throws Base64Error with the offending position.
 */
export function base64ToBytes(input: string): Uint8Array {
  let s = input.trim();
  const dataUrl = /^data:[^,]*;base64,/i.exec(s);
  if (dataUrl) s = s.slice(dataUrl[0].length);
  s = s.replace(/\s+/g, "");
  const padIdx = s.indexOf("=");
  if (padIdx !== -1) {
    if (!/^=+$/.test(s.slice(padIdx)) || s.length - padIdx > 2) {
      throw new Base64Error(`Unexpected "=" padding at character ${padIdx + 1}.`);
    }
    s = s.slice(0, padIdx);
  }
  const vals = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let v: number;
    if (c >= 65 && c <= 90) v = c - 65;
    else if (c >= 97 && c <= 122) v = c - 71;
    else if (c >= 48 && c <= 57) v = c + 4;
    else if (c === 43 || c === 45) v = 62; // + or -
    else if (c === 47 || c === 95) v = 63; // / or _
    else throw new Base64Error(`Invalid Base64 character "${s[i]}" at position ${i + 1} (whitespace ignored).`);
    vals[i] = v;
  }
  if (s.length % 4 === 1) throw new Base64Error("Invalid Base64 length: one character too many or missing data.");
  const outLen = Math.floor((s.length * 3) / 4);
  const out = new Uint8Array(outLen);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = vals[i], b = vals[i + 1] ?? 0, c = vals[i + 2] ?? 0, d = vals[i + 3] ?? 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < outLen) out[o++] = (n >> 16) & 255;
    if (o < outLen) out[o++] = (n >> 8) & 255;
    if (o < outLen) out[o++] = n & 255;
  }
  return out;
}

/** Returns the UTF-8 text, or null when the bytes are not valid UTF-8. */
export function bytesToUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function decodeBase64(input: string): string {
  const text = bytesToUtf8(base64ToBytes(input));
  if (text == null) throw new Base64Error("The decoded bytes are not valid UTF-8 text.");
  return text;
}

export function bytesToHex(bytes: Uint8Array, sep = ""): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(sep);
}

/** Heuristic: does the decoded text look like readable text (few control chars)? */
export function looksBinary(text: string): boolean {
  if (!text) return false;
  let ctrl = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if ((c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 0x7f) ctrl++;
  }
  return ctrl / text.length > 0.1;
}

/** Guess a file type from magic bytes so binary downloads get a sensible extension. */
export function sniffType(bytes: Uint8Array): { ext: string; mime: string } {
  const h = (n: number) => bytes[n];
  if (h(0) === 0x89 && h(1) === 0x50 && h(2) === 0x4e && h(3) === 0x47) return { ext: "png", mime: "image/png" };
  if (h(0) === 0xff && h(1) === 0xd8 && h(2) === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (h(0) === 0x47 && h(1) === 0x49 && h(2) === 0x46) return { ext: "gif", mime: "image/gif" };
  if (h(0) === 0x25 && h(1) === 0x50 && h(2) === 0x44 && h(3) === 0x46) return { ext: "pdf", mime: "application/pdf" };
  if (h(0) === 0x50 && h(1) === 0x4b && h(2) === 0x03 && h(3) === 0x04) return { ext: "zip", mime: "application/zip" };
  if (h(0) === 0x1f && h(1) === 0x8b) return { ext: "gz", mime: "application/gzip" };
  if (h(0) === 0x52 && h(1) === 0x49 && h(2) === 0x46 && h(3) === 0x46 && h(8) === 0x57 && h(9) === 0x45)
    return { ext: "webp", mime: "image/webp" };
  return { ext: "bin", mime: "application/octet-stream" };
}
