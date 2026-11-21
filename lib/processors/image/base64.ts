/** Pure Base64 / data URI helpers for the Image ↔ Base64 tools. */

import { detectImageMime } from "./formats";

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toDataUri(mime: string, base64: string): string {
  return `data:${mime};base64,${base64}`;
}

export interface ParsedBase64 {
  bytes: Uint8Array;
  /** MIME declared in a data URI, if any. */
  declaredMime: string | null;
  /** MIME detected from the decoded bytes. */
  detectedMime: string | null;
  /** Best guess: detected, else declared. */
  mime: string | null;
  /** Whether the input was a data URI (vs raw Base64). */
  wasDataUri: boolean;
}

export class Base64Error extends Error {}

/**
 * Accepts raw Base64 (standard or URL-safe, with or without padding/line breaks), a data URI,
 * or a data URI wrapped in CSS url(...)/quotes/an <img src="..."> attribute.
 */
export function parseBase64Image(input: string): ParsedBase64 {
  let s = input.trim();
  if (!s) throw new Base64Error("Paste a Base64 string or data URI.");
  // Unwrap common containers.
  const attr = s.match(/src\s*=\s*["']([^"']+)["']/i);
  if (attr) s = attr[1];
  const css = s.match(/url\(\s*["']?([^"')]+)["']?\s*\)/i);
  if (css) s = css[1];
  s = s.replace(/^["'`]+|["'`;,]+$/g, "").trim();

  let declaredMime: string | null = null;
  let wasDataUri = false;
  let bytes: Uint8Array;
  if (/^data:/i.test(s)) {
    wasDataUri = true;
    const comma = s.indexOf(",");
    if (comma < 0) throw new Base64Error("The data URI has no comma separating the header from the data.");
    const header = s.slice(5, comma);
    const payload = s.slice(comma + 1);
    const parts = header.split(";").map((p) => p.trim());
    declaredMime = parts[0] ? parts[0].toLowerCase() : null;
    const isB64 = parts.slice(1).some((p) => p.toLowerCase() === "base64");
    if (isB64) bytes = decodeLenient(payload);
    else {
      try {
        bytes = new TextEncoder().encode(decodeURIComponent(payload));
      } catch {
        throw new Base64Error("The data URI payload is not valid percent-encoded text.");
      }
    }
  } else {
    bytes = decodeLenient(s);
  }
  if (!bytes.length) throw new Base64Error("The input decodes to zero bytes.");
  const detectedMime = detectImageMime(bytes);
  return { bytes, declaredMime, detectedMime, mime: detectedMime ?? declaredMime, wasDataUri };
}

/** Decodes Base64 tolerating whitespace, URL-safe characters and missing padding. */
export function decodeLenient(s: string): Uint8Array {
  let t = s.replace(/%2B/gi, "+").replace(/%2F/gi, "/").replace(/%3D/gi, "=");
  t = t.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  t = t.replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]*$/.test(t)) {
    const bad = t.match(/[^A-Za-z0-9+/]/)?.[0];
    throw new Base64Error(`Invalid Base64 character "${bad}".`);
  }
  if (t.length % 4 === 1) throw new Base64Error("The Base64 string has an invalid length (it may be truncated).");
  t += "=".repeat((4 - (t.length % 4)) % 4);
  return base64ToBytes(t);
}

/** Wraps Base64 output in common snippet formats. */
export function base64Snippets(mime: string, b64: string, name = "image"): Record<"dataUri" | "base64" | "css" | "html" | "markdown" | "json", string> {
  const uri = toDataUri(mime, b64);
  return {
    dataUri: uri,
    base64: b64,
    css: `background-image: url("${uri}");`,
    html: `<img src="${uri}" alt="${name.replace(/"/g, "&quot;")}" />`,
    markdown: `![${name.replace(/[[\]]/g, "")}](${uri})`,
    json: JSON.stringify({ name, mime, data: b64 }),
  };
}

/** Exact Base64 length for n bytes (with padding). */
export function base64Length(n: number): number {
  return Math.ceil(n / 3) * 4;
}
