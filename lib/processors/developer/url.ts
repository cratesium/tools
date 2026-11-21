/** URL percent-encoding helpers and URL parsing. Pure. */

export type UrlEncodeMode = "component" | "uri" | "form" | "all";

/**
 * component – encodeURIComponent (query values, path segments)
 * uri       – encodeURI (whole URL, keeps :/?#[]@!$&'()*+,;=)
 * form      – application/x-www-form-urlencoded (space → +, also encodes !'()*)
 * all       – percent-encode every byte except unreserved A–Z a–z 0–9 - . _ ~ (RFC 3986)
 */
export function urlEncode(text: string, mode: UrlEncodeMode = "component"): string {
  switch (mode) {
    case "uri":
      return encodeURI(text);
    case "form":
      return encodeURIComponent(text)
        .replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
        .replace(/%20/g, "+");
    case "all":
      return encodeURIComponent(text).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
    default:
      return encodeURIComponent(text);
  }
}

export class UrlDecodeError extends Error {}

/** Decodes percent-escapes. With plusAsSpace, '+' is treated as a space (form encoding). */
export function urlDecode(text: string, plusAsSpace = false): string {
  const s = plusAsSpace ? text.replace(/\+/g, " ") : text;
  try {
    return decodeURIComponent(s);
  } catch {
    const bad = /%(?![0-9a-fA-F]{2})/.exec(s);
    if (bad) throw new UrlDecodeError(`Malformed escape "${s.slice(bad.index, bad.index + 3)}" at position ${bad.index + 1}.`);
    throw new UrlDecodeError("The percent-escapes do not form valid UTF-8.");
  }
}

/** Decode repeatedly until stable (for double-encoded strings); returns the result and the number of passes. */
export function urlDecodeFully(text: string, plusAsSpace = false, max = 5): { value: string; passes: number } {
  let cur = text;
  let passes = 0;
  for (; passes < max; passes++) {
    const next = urlDecode(cur, plusAsSpace && passes === 0);
    if (next === cur) break;
    cur = next;
  }
  return { value: cur, passes };
}

export interface UrlParts {
  href: string;
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  origin: string;
  params: [string, string][];
}

/** Parses an absolute URL; returns null when the input is not a URL. */
export function parseUrl(input: string): UrlParts | null {
  const t = input.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) return null;
  try {
    const u = new URL(t);
    return {
      href: u.href,
      protocol: u.protocol,
      username: decodeSafe(u.username),
      password: decodeSafe(u.password),
      hostname: u.hostname,
      port: u.port,
      pathname: decodeSafe(u.pathname),
      search: u.search,
      hash: decodeSafe(u.hash),
      origin: u.origin,
      params: [...u.searchParams.entries()],
    };
  } catch {
    return null;
  }
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
