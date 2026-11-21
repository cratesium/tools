/**
 * Shared, hardened helpers for UtilityHub's Cloudflare Pages Functions.
 *
 * This file exports no `onRequest*` handler, so Pages does not create a route for it.
 * Everything here is pure TypeScript with no Node or Next.js imports (and no "@/"
 * path aliases), so it bundles with wrangler and runs in vitest unchanged.
 *
 * Security model for outbound fetches (SSRF):
 *  - Only http/https URLs, max 2048 chars, no embedded credentials.
 *  - Hostnames that are IP literals are rejected when they fall in loopback, private,
 *    link-local, CGNAT, multicast, reserved, documentation, NAT64-embedded-private or
 *    cloud-metadata ranges (IPv4 and IPv6, including IPv4-mapped IPv6).
 *  - Names such as localhost, *.local, *.internal, *.localhost, *.lan, *.home.arpa and
 *    single-label hosts are rejected.
 *  - Only default and common web ports are allowed.
 *  - Redirects are followed manually and every hop is re-validated (max 10 hops).
 *  - Defence in depth: fetch() inside Cloudflare Workers runs on Cloudflare's edge and
 *    cannot reach private networks, RFC 1918 space or the origin's LAN at all, so even a
 *    DNS-rebinding name that resolves to 10.x.x.x cannot be reached. The checks above
 *    stop the obvious abuse early and keep behaviour identical under `wrangler pages dev`,
 *    where fetch() runs on the developer's machine.
 */

/* ------------------------------------------------------------------ */
/* Minimal Cloudflare types (@cloudflare/workers-types is not installed) */
/* ------------------------------------------------------------------ */

export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: unknown }): Promise<void>;
}

export interface Env {
  /** KV namespace for the URL shortener (optional). */
  SHORT_LINKS?: KVNamespaceLike;
  /** Cloudflare account id for the Browser Rendering REST API (optional). */
  CF_ACCOUNT_ID?: string;
  /** API token with "Browser Rendering - Edit" permission (secret, optional). */
  CF_API_TOKEN?: string;
}

export interface PagesContext<E = Env, P extends string = string> {
  request: Request;
  env: E;
  params: Record<P, string | string[]>;
  waitUntil(promise: Promise<unknown>): void;
  next(): Promise<Response>;
  data: Record<string, unknown>;
}

export type PagesFunction<E = Env, P extends string = string> = (
  context: PagesContext<E, P>,
) => Response | Promise<Response>;

/** Subset of Cloudflare's `request.cf` object that /api/myip reads. */
export interface CfProperties {
  country?: string;
  city?: string;
  region?: string;
  regionCode?: string;
  postalCode?: string;
  latitude?: string;
  longitude?: string;
  timezone?: string;
  continent?: string;
  isEUCountry?: string;
  asn?: number;
  asOrganization?: string;
  colo?: string;
  httpProtocol?: string;
  tlsVersion?: string;
  tlsCipher?: string;
  clientTcpRtt?: number;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** Dependencies injected into every pure handler (all optional; production defaults apply). */
export interface HandlerDeps {
  env?: Env;
  fetch?: FetchLike;
  now?: () => number;
  /** Pass null to disable rate limiting (tests). */
  limiter?: RateLimiter | null;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

export const USER_AGENT = "UtilityHubBot/1.0 (+https://utilityhub.pages.dev)";
export const MAX_URL_LENGTH = 2048;
export const MAX_REDIRECTS = 10;
export const DEFAULT_TIMEOUT_MS = 10_000;
/** Max bytes read from any upstream body (HTML for analysis tools). */
export const MAX_BODY_BYTES = 3 * 1024 * 1024;
/** Ports that may be fetched. Empty string = scheme default (80/443). */
export const ALLOWED_PORTS = new Set(["", "80", "443", "8000", "8008", "8080", "8443", "8888"]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/* ------------------------------------------------------------------ */
/* Errors and responses                                                */
/* ------------------------------------------------------------------ */

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const BASE_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function jsonError(status: number, code: string, message: string, headers: Record<string, string> = {}): Response {
  return json({ error: code, message }, status, headers);
}

/** Converts any thrown value into a JSON error response. */
export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return jsonError(e.status, e.code, e.message);
  const err = e as { name?: string; message?: string };
  if (err?.name === "TimeoutError" || err?.name === "AbortError")
    return jsonError(504, "timeout", "The remote server did not respond in time.");
  return jsonError(502, "fetch_failed", `Could not reach the remote server${err?.message ? `: ${err.message}` : "."}`);
}

/* ------------------------------------------------------------------ */
/* Same-origin enforcement ("CORS for same-origin only")               */
/* ------------------------------------------------------------------ */

/**
 * No Access-Control-Allow-Origin header is ever sent, so browsers block cross-origin
 * reads. In addition, requests that a browser marks as cross-site (Sec-Fetch-Site) or
 * that carry a foreign Origin header are refused outright so other sites cannot use the
 * endpoints as an open proxy through visitors' browsers.
 */
export function checkSameOrigin(request: Request): Response | null {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none")
    return jsonError(403, "forbidden_origin", "This endpoint only accepts requests from the UtilityHub site.");
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    let self: string;
    try {
      self = new URL(request.url).origin;
    } catch {
      return jsonError(400, "bad_request", "Invalid request URL.");
    }
    if (origin !== self) return jsonError(403, "forbidden_origin", "This endpoint only accepts requests from the UtilityHub site.");
  }
  return null;
}

/** Preflight / unsupported method handling. Cross-origin preflights get no CORS headers. */
export function methodNotAllowed(allowed: string[]): Response {
  return jsonError(405, "method_not_allowed", `Use ${allowed.join(" or ")}.`, { allow: allowed.join(", ") });
}

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

/**
 * Best-effort fixed-window limiter, in memory per Worker isolate. Cloudflare runs many
 * isolates, so this only damps bursts from one client hitting one isolate; configure a
 * Cloudflare WAF Rate Limiting rule on /api/* for a hard global limit (see docs/FUNCTIONS.md).
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; reset: number }>();
  constructor(
    public readonly limit: number,
    public readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  check(key: string, now = Date.now()): { ok: boolean; remaining: number; retryAfterSec: number } {
    if (this.hits.size > this.maxKeys) {
      for (const [k, v] of this.hits) if (v.reset <= now) this.hits.delete(k);
      if (this.hits.size > this.maxKeys) this.hits.clear();
    }
    let entry = this.hits.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + this.windowMs };
      this.hits.set(key, entry);
    }
    entry.count++;
    const ok = entry.count <= this.limit;
    return {
      ok,
      remaining: Math.max(0, this.limit - entry.count),
      retryAfterSec: ok ? 0 : Math.max(1, Math.ceil((entry.reset - now) / 1000)),
    };
  }
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

/** Runs the origin check and rate limit. Returns a Response to short-circuit, or null to continue. */
export function guardRequest(request: Request, limiter: RateLimiter | null | undefined, now: number): Response | null {
  const origin = checkSameOrigin(request);
  if (origin) return origin;
  if (limiter) {
    const r = limiter.check(clientIp(request), now);
    if (!r.ok)
      return jsonError(429, "rate_limited", `Too many requests. Try again in ${r.retryAfterSec} s.`, {
        "retry-after": String(r.retryAfterSec),
      });
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* IP address parsing and classification                               */
/* ------------------------------------------------------------------ */

/** Strict dotted-quad IPv4 → 4 octets, or null. */
export function parseIPv4(s: string): number[] | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    if (p.length > 1 && p[0] === "0") return null; // ambiguous octal form
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

/** IPv6 (optionally with embedded IPv4 tail, no zone id) → 8 hextets, or null. */
export function parseIPv6(input: string): number[] | null {
  let s = input.trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  if (!s.includes(":") || s.includes("%")) return null;
  let tail: number[] = [];
  const lastColon = s.lastIndexOf(":");
  const maybeV4 = s.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    const v4 = parseIPv4(maybeV4);
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    s = s.slice(0, lastColon + 1) + "0"; // placeholder, removed below
  }
  const dbl = s.split("::");
  if (dbl.length > 2) return null;
  const parseGroups = (str: string): number[] | null => {
    if (str === "") return [];
    const out: number[] = [];
    for (const g of str.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  let head = parseGroups(dbl[0]);
  let rest = dbl.length === 2 ? parseGroups(dbl[1]) : [];
  if (!head || !rest) return null;
  if (tail.length) {
    // drop the "0" placeholder that stood in for the IPv4 tail
    if (dbl.length === 2) rest = rest.slice(0, -1);
    else head = head.slice(0, -1);
  }
  const total = head.length + rest.length + tail.length;
  if (dbl.length === 2) {
    if (total > 7) return null;
    return [...head, ...new Array(8 - total).fill(0), ...rest, ...tail];
  }
  if (total !== 8) return null;
  return [...head, ...tail];
}

function inV4(ip: number[], base: number[], bits: number): boolean {
  const a = ((ip[0] << 24) | (ip[1] << 16) | (ip[2] << 8) | ip[3]) >>> 0;
  const b = ((base[0] << 24) | (base[1] << 16) | (base[2] << 8) | base[3]) >>> 0;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~0 << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

const V4_BLOCKED: [number[], number, string][] = [
  [[0, 0, 0, 0], 8, "this network"],
  [[10, 0, 0, 0], 8, "private"],
  [[100, 64, 0, 0], 10, "carrier-grade NAT"],
  [[127, 0, 0, 0], 8, "loopback"],
  [[169, 254, 0, 0], 16, "link-local / cloud metadata"],
  [[172, 16, 0, 0], 12, "private"],
  [[192, 0, 0, 0], 24, "IETF protocol assignments"],
  [[192, 0, 2, 0], 24, "documentation"],
  [[192, 88, 99, 0], 24, "6to4 relay"],
  [[192, 168, 0, 0], 16, "private"],
  [[198, 18, 0, 0], 15, "benchmarking"],
  [[198, 51, 100, 0], 24, "documentation"],
  [[203, 0, 113, 0], 24, "documentation"],
  [[224, 0, 0, 0], 4, "multicast"],
  [[240, 0, 0, 0], 4, "reserved"],
];

/** Returns a reason string when an IPv4 address is not publicly routable, else null. */
export function blockedIPv4Reason(ip: number[]): string | null {
  for (const [base, bits, why] of V4_BLOCKED) if (inV4(ip, base, bits)) return why;
  return null;
}

/** Returns a reason string when an IPv6 address is not publicly routable, else null. */
export function blockedIPv6Reason(h: number[]): string | null {
  const allZeroUpTo = (n: number) => h.slice(0, n).every((x) => x === 0);
  if (h.every((x) => x === 0)) return "unspecified";
  if (allZeroUpTo(7) && h[7] === 1) return "loopback";
  const embedded = (): number[] => [h[6] >> 8, h[6] & 0xff, h[7] >> 8, h[7] & 0xff];
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d
  if (allZeroUpTo(5) && h[5] === 0xffff) return blockedIPv4Reason(embedded()) ?? null;
  if (allZeroUpTo(6)) return "IPv4-compatible (deprecated)";
  // NAT64 64:ff9b::/96 → check embedded IPv4
  if (h[0] === 0x64 && h[1] === 0xff9b && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0)
    return blockedIPv4Reason(embedded()) ? "NAT64 to non-public IPv4" : null;
  if (h[0] === 0x64 && h[1] === 0xff9b && h[2] === 1) return "local NAT64";
  if ((h[0] & 0xfe00) === 0xfc00) return "unique local (private)";
  if ((h[0] & 0xffc0) === 0xfe80) return "link-local";
  if ((h[0] & 0xffc0) === 0xfec0) return "site-local (deprecated)";
  if ((h[0] & 0xff00) === 0xff00) return "multicast";
  if (h[0] === 0x2001 && h[1] === 0x0db8) return "documentation";
  if (h[0] === 0x0100 && h[1] === 0 && h[2] === 0 && h[3] === 0) return "discard-only";
  if (h[0] === 0x2002) {
    // 6to4: embedded IPv4 in hextets 1-2
    const v4 = [h[1] >> 8, h[1] & 0xff, h[2] >> 8, h[2] & 0xff];
    if (blockedIPv4Reason(v4)) return "6to4 to non-public IPv4";
  }
  if (h[0] === 0x2001 && h[1] === 0) return "Teredo";
  return null;
}

export type IpInfo = { version: 4 | 6; normalized: string; blockedReason: string | null };

/** Classifies an IP literal (with or without IPv6 brackets). Returns null if not an IP. */
export function classifyIp(s: string): IpInfo | null {
  const v4 = parseIPv4(s);
  if (v4) return { version: 4, normalized: v4.join("."), blockedReason: blockedIPv4Reason(v4) };
  const v6 = parseIPv6(s);
  if (v6) return { version: 6, normalized: formatIPv6(v6), blockedReason: blockedIPv6Reason(v6) };
  return null;
}

/** RFC 5952 canonical text form. */
export function formatIPv6(h: number[]): string {
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (h[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && h[j] === 0) j++;
    if (j - i > bestLen && j - i >= 2) {
      bestStart = i;
      bestLen = j - i;
    }
    i = j;
  }
  const hex = h.map((x) => x.toString(16));
  if (bestStart < 0) return hex.join(":");
  return `${hex.slice(0, bestStart).join(":")}::${hex.slice(bestStart + bestLen).join(":")}`;
}

/* ------------------------------------------------------------------ */
/* Hostname and URL validation                                         */
/* ------------------------------------------------------------------ */

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa", ".intranet", ".corp", ".private", ".test", ".invalid", ".example"];
const BLOCKED_NAMES = new Set(["localhost", "metadata", "metadata.google.internal", "instance-data", "broadcasthost"]);

/** Returns a reason when a hostname must not be fetched, else null. */
export function blockedHostnameReason(hostname: string): string | null {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (!h) return "empty hostname";
  const ip = classifyIp(h);
  if (ip) return ip.blockedReason ? `${ip.blockedReason} address` : null;
  if (BLOCKED_NAMES.has(h)) return "local hostname";
  if (BLOCKED_SUFFIXES.some((s) => h.endsWith(s))) return "non-public hostname";
  if (!h.includes(".")) return "single-label hostname";
  // Looks numeric but did not parse as a normal IPv4 (e.g. 127.1 variants that slipped through)
  if (/^[0-9.]+$/.test(h)) return "malformed IP address";
  if (!/^[a-z0-9.-]+$/.test(h)) return "invalid characters in hostname";
  if (h.split(".").some((l) => l.length === 0 || l.length > 63 || l.startsWith("-") || l.endsWith("-"))) return "invalid hostname label";
  return null;
}

/**
 * Parses and validates a user-supplied URL for outbound fetching.
 * Bare domains ("example.com/path") get https:// prepended.
 * Throws HttpError(400) with a specific code on failure.
 */
export function validateTargetUrl(raw: string | null | undefined, opts: { addScheme?: boolean } = {}): URL {
  const input = (raw ?? "").trim();
  if (!input) throw new HttpError(400, "missing_url", "Enter a URL.");
  if (input.length > MAX_URL_LENGTH) throw new HttpError(400, "url_too_long", `URLs are limited to ${MAX_URL_LENGTH} characters.`);
  let candidate = input;
  if (opts.addScheme !== false && !/^[a-z][a-z0-9+.-]*:/i.test(candidate)) candidate = `https://${candidate}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new HttpError(400, "invalid_url", "That is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new HttpError(400, "unsupported_scheme", "Only http:// and https:// URLs are supported.");
  if (url.username || url.password) throw new HttpError(400, "credentials_in_url", "URLs containing a username or password are not allowed.");
  if (!ALLOWED_PORTS.has(url.port)) throw new HttpError(400, "blocked_port", `Port ${url.port} is not allowed.`);
  const reason = blockedHostnameReason(url.hostname);
  if (reason) throw new HttpError(400, "blocked_host", `This host cannot be fetched (${reason}).`);
  if (url.href.length > MAX_URL_LENGTH) throw new HttpError(400, "url_too_long", `URLs are limited to ${MAX_URL_LENGTH} characters.`);
  return url;
}

/** Normalises a domain/hostname input ("https://Example.com/x" → "example.com"). Throws HttpError(400). */
export function normalizeHostname(raw: string | null | undefined): string {
  const input = (raw ?? "").trim();
  if (!input) throw new HttpError(400, "missing_host", "Enter a domain name.");
  if (input.length > 253 + 16) throw new HttpError(400, "invalid_host", "That domain name is too long.");
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`).hostname;
  } catch {
    throw new HttpError(400, "invalid_host", "That is not a valid domain name.");
  }
  host = host.toLowerCase().replace(/\.$/, "");
  if (host.length > 253) throw new HttpError(400, "invalid_host", "That domain name is too long.");
  return host;
}

/* ------------------------------------------------------------------ */
/* Outbound fetching                                                   */
/* ------------------------------------------------------------------ */

export interface RedirectHop {
  url: string;
  status: number;
  location: string | null;
}

export interface FollowResult {
  response: Response;
  finalUrl: string;
  redirects: RedirectHop[];
  timingMs: number;
}

export interface FollowOptions {
  fetch?: FetchLike;
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
  maxRedirects?: number;
  timeoutMs?: number;
  now?: () => number;
  /** Pre-built signal (otherwise AbortSignal.timeout(timeoutMs) for the whole chain). */
  signal?: AbortSignal;
}

/**
 * Fetches a URL, following redirects manually so every hop is validated against the
 * SSRF guard. The returned response body has not been consumed.
 */
export async function fetchFollowingRedirects(start: string | URL, opts: FollowOptions = {}): Promise<FollowResult> {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const max = opts.maxRedirects ?? MAX_REDIRECTS;
  const signal = opts.signal ?? AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let method = opts.method ?? "GET";
  let url = validateTargetUrl(String(start));
  const redirects: RedirectHop[] = [];
  const t0 = now();
  for (;;) {
    const res = await doFetch(url.href, {
      method,
      redirect: "manual",
      signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en;q=0.9,*;q=0.5",
        ...opts.headers,
      },
    });
    const location = res.headers.get("location");
    if (REDIRECT_STATUSES.has(res.status) && location) {
      await res.body?.cancel().catch(() => undefined);
      redirects.push({ url: url.href, status: res.status, location });
      if (redirects.length > max) throw new HttpError(508, "too_many_redirects", `Stopped after ${max} redirects (possible redirect loop).`);
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        throw new HttpError(502, "bad_redirect", `The server sent an invalid redirect location: ${location.slice(0, 200)}`);
      }
      try {
        url = validateTargetUrl(next.href, { addScheme: false });
      } catch (e) {
        if (e instanceof HttpError) throw new HttpError(400, "blocked_redirect", `Redirect to ${next.href.slice(0, 200)} was blocked: ${e.message}`);
        throw e;
      }
      if (res.status === 303 && method !== "HEAD") method = "GET";
      continue;
    }
    return { response: res, finalUrl: url.href, redirects, timingMs: Math.max(0, Math.round(now() - t0)) };
  }
}

/** Reads at most maxBytes of a body. Cancels the rest. */
export async function readBodyCapped(res: Response, maxBytes = MAX_BODY_BYTES): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!res.body) return { bytes: new Uint8Array(0), truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.byteLength > maxBytes) {
      chunks.push(value.subarray(0, maxBytes - size));
      size = maxBytes;
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  const out = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return { bytes: out, truncated };
}

/** Decodes bytes using the charset from a Content-Type header (falls back to <meta charset>, then UTF-8). */
export function decodeText(bytes: Uint8Array, contentType: string | null): string {
  let charset = /charset=["']?([\w.:-]+)/i.exec(contentType ?? "")?.[1];
  if (!charset) {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
    charset = /<meta[^>]+charset=["']?([\w.:-]+)/i.exec(head)?.[1];
  }
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Response headers as an ordered list; Set-Cookie values are kept separate. */
export function headersToList(h: Headers): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  const getSetCookie = (h as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const cookies = typeof getSetCookie === "function" ? getSetCookie.call(h) : null;
  h.forEach((value, name) => {
    if (name === "set-cookie" && cookies) return;
    out.push({ name, value });
  });
  if (cookies) for (const c of cookies) out.push({ name: "set-cookie", value: c });
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}

/** Runs async tasks with a concurrency limit, preserving order. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
