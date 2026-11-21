/**
 * GET /api/ssl?host=<hostname>
 *
 * Cloudflare Workers cannot read a peer's TLS certificate, so this endpoint combines:
 *  1. Certificate Transparency: certificates logged for the host (and its covering wildcard)
 *     from crt.sh, with issuer, validity window and SANs.
 *  2. A live HTTPS reachability probe (status, timing, HSTS) from Cloudflare's edge.
 * It does not inspect the certificate actually served during a raw TLS handshake.
 */
import {
  decodeText,
  errorResponse,
  guardRequest,
  HttpError,
  json,
  methodNotAllowed,
  normalizeHostname,
  RateLimiter,
  readBodyCapped,
  USER_AGENT,
  validateTargetUrl,
  type FetchLike,
  type HandlerDeps,
  type PagesFunction,
} from "./_lib";

const limiter = new RateLimiter(10, 60_000);
const CRT_TIMEOUT_MS = 25_000;
const CRT_MAX_BYTES = 5 * 1024 * 1024;
const MAX_CERTS = 60;

export const SSL_STATUS_NOTE =
  "Certificate details come from public Certificate Transparency logs (crt.sh), which list every publicly trusted certificate issued for the name. The live check confirms the site answers over HTTPS from Cloudflare's edge; it is not a raw inspection of the certificate served in the TLS handshake.";

export interface CtCertificate {
  id: number;
  serial: string;
  issuer: string;
  issuerOrg: string | null;
  commonName: string;
  sans: string[];
  notBefore: string;
  notAfter: string;
  loggedAt: string | null;
  daysRemaining: number;
  validNow: boolean;
  coversHost: boolean;
}

interface CrtShRow {
  id?: number;
  issuer_name?: string;
  common_name?: string;
  name_value?: string;
  not_before?: string;
  not_after?: string;
  serial_number?: string;
  entry_timestamp?: string;
}

/** crt.sh timestamps have no zone; they are UTC. */
const utc = (s: string | undefined) => (s ? (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`) : "");

/** Whether a certificate name (possibly a wildcard) covers the host. */
export function nameCoversHost(name: string, host: string): boolean {
  const n = name.toLowerCase().trim();
  const h = host.toLowerCase();
  if (n === h) return true;
  if (n.startsWith("*.")) {
    const suffix = n.slice(1); // ".example.com"
    return h.endsWith(suffix) && !h.slice(0, -suffix.length).includes(".") && h.length > suffix.length;
  }
  return false;
}

/** Parses crt.sh JSON (tolerating a truncated array), de-duplicates precert/leaf pairs. */
export function parseCrtSh(text: string, host: string, nowMs: number): CtCertificate[] {
  let rows: CrtShRow[];
  try {
    rows = JSON.parse(text);
  } catch {
    const cut = text.lastIndexOf("}");
    if (cut < 0) return [];
    try {
      rows = JSON.parse(`${text.slice(0, cut + 1)}]`);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(rows)) return [];
  const bySerial = new Map<string, CtCertificate>();
  for (const r of rows) {
    if (!r || !r.not_before || !r.not_after) continue;
    const serial = (r.serial_number ?? String(r.id ?? "")).toLowerCase();
    const sans = [...new Set(String(r.name_value ?? "").split(/\s+/).map((s) => s.toLowerCase()).filter(Boolean))];
    const notBefore = utc(r.not_before);
    const notAfter = utc(r.not_after);
    const nb = Date.parse(notBefore);
    const na = Date.parse(notAfter);
    const issuer = String(r.issuer_name ?? "");
    const cert: CtCertificate = {
      id: Number(r.id ?? 0),
      serial,
      issuer,
      issuerOrg: /(?:^|,\s*)O=("?)([^,"]+)\1/.exec(issuer)?.[2] ?? null,
      commonName: String(r.common_name ?? ""),
      sans,
      notBefore,
      notAfter,
      loggedAt: r.entry_timestamp ? utc(r.entry_timestamp) : null,
      daysRemaining: Math.floor((na - nowMs) / 86_400_000),
      validNow: nb <= nowMs && nowMs <= na,
      coversHost: [String(r.common_name ?? ""), ...sans].some((n) => nameCoversHost(n, host)),
    };
    const prev = bySerial.get(serial);
    if (!prev || cert.sans.length > prev.sans.length) bySerial.set(serial, cert);
  }
  return [...bySerial.values()].sort((a, b) => Date.parse(b.notBefore) - Date.parse(a.notBefore));
}

async function queryCrtSh(q: string, f: FetchLike): Promise<string> {
  const url = `https://crt.sh/?q=${encodeURIComponent(q)}&output=json&exclude=expired&deduplicate=Y`;
  const res = await f(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(CRT_TIMEOUT_MS),
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new HttpError(502, "ct_unavailable", `crt.sh answered HTTP ${res.status}.`);
  }
  const { bytes } = await readBodyCapped(res, CRT_MAX_BYTES);
  return decodeText(bytes, "charset=utf-8");
}

export interface HttpsProbe {
  reachable: boolean;
  status: number | null;
  location: string | null;
  timingMs: number;
  hsts: string | null;
  server: string | null;
  error: string | null;
}

async function probeHttps(host: string, f: FetchLike, now: () => number): Promise<HttpsProbe> {
  const t0 = now();
  try {
    const url = validateTargetUrl(`https://${host}/`, { addScheme: false });
    const res = await f(url.href, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*;q=0.8" },
      signal: AbortSignal.timeout(10_000),
    });
    await res.body?.cancel().catch(() => undefined);
    return {
      reachable: true,
      status: res.status,
      location: res.headers.get("location"),
      timingMs: Math.round(now() - t0),
      hsts: res.headers.get("strict-transport-security"),
      server: res.headers.get("server"),
      error: null,
    };
  } catch (e) {
    const err = e as { name?: string; message?: string };
    return {
      reachable: false,
      status: null,
      location: null,
      timingMs: Math.round(now() - t0),
      hsts: null,
      server: null,
      error: err?.name === "TimeoutError" ? "Timed out after 10 s" : err?.message || "HTTPS connection failed",
    };
  }
}

export async function handleSsl(request: Request, deps: HandlerDeps = {}): Promise<Response> {
  const now = deps.now ?? Date.now;
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const blocked = guardRequest(request, deps.limiter === undefined ? limiter : deps.limiter, now());
  if (blocked) return blocked;
  try {
    const host = normalizeHostname(new URL(request.url).searchParams.get("host"));
    validateTargetUrl(`https://${host}/`, { addScheme: false }); // SSRF guard / hostname sanity
    const f = deps.fetch ?? fetch;
    const labels = host.split(".");
    const wildcard = labels.length > 2 ? `*.${labels.slice(1).join(".")}` : null;
    const [probe, exact, wild] = await Promise.all([
      probeHttps(host, f, now),
      queryCrtSh(host, f).then(
        (t) => ({ text: t, error: null as string | null }),
        (e: Error) => ({ text: "", error: e?.name === "TimeoutError" ? "crt.sh timed out" : e?.message || "crt.sh failed" }),
      ),
      wildcard
        ? queryCrtSh(wildcard, f).then(
            (t) => ({ text: t, error: null as string | null }),
            () => ({ text: "", error: null as string | null }),
          )
        : Promise.resolve({ text: "", error: null as string | null }),
    ]);
    const nowMs = now();
    const merged = new Map<string, CtCertificate>();
    for (const c of [...parseCrtSh(exact.text, host, nowMs), ...parseCrtSh(wild.text, host, nowMs)]) {
      if (!merged.has(c.serial)) merged.set(c.serial, c);
    }
    const certificates = [...merged.values()]
      .filter((c) => c.coversHost)
      .sort((a, b) => Date.parse(b.notBefore) - Date.parse(a.notBefore));
    const current = certificates.find((c) => c.validNow) ?? null;
    return json({
      host,
      https: probe,
      current,
      certificates: certificates.slice(0, MAX_CERTS),
      totalCertificates: certificates.length,
      ctError: exact.error,
      statusNote: SSL_STATUS_NOTE,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export const onRequest: PagesFunction = (ctx) => handleSsl(ctx.request);
