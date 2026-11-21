/**
 * GET /api/whois?domain=<domain>
 *
 * Domain registration data via RDAP (rdap.org → authoritative registry), normalised into
 * registrar, dates, status codes, nameservers and DNSSEC, plus the raw RDAP JSON.
 * If a subdomain is entered (www.example.com) and the registry has no record for it,
 * leading labels are stripped until a registered name is found (max 2 retries).
 */
import {
  blockedHostnameReason,
  classifyIp,
  errorResponse,
  guardRequest,
  HttpError,
  json,
  jsonError,
  methodNotAllowed,
  normalizeHostname,
  RateLimiter,
  type HandlerDeps,
  type PagesFunction,
} from "./_lib";
import { fetchRdap, normalizeDomainRdap } from "./_rdap";

const limiter = new RateLimiter(20, 60_000);

/** Validates a domain for RDAP lookup. Returns the ASCII (punycode) form. */
export function validateDomain(raw: string | null): string {
  const host = normalizeHostname(raw);
  if (classifyIp(host)) throw new HttpError(400, "is_ip", "That is an IP address. Use the IP Address Lookup tool instead.");
  if (!host.includes(".")) throw new HttpError(400, "invalid_domain", "Enter a full domain name such as example.com.");
  const reason = blockedHostnameReason(host);
  if (reason) throw new HttpError(400, "invalid_domain", `This domain cannot be looked up (${reason}).`);
  return host;
}

export async function handleWhois(request: Request, deps: HandlerDeps = {}): Promise<Response> {
  const now = deps.now ?? Date.now;
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const blocked = guardRequest(request, deps.limiter === undefined ? limiter : deps.limiter, now());
  if (blocked) return blocked;
  try {
    const domain = validateDomain(new URL(request.url).searchParams.get("domain"));
    let candidate = domain;
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetchRdap(`/domain/${encodeURIComponent(candidate)}`, deps.fetch, now);
      if (r) {
        return json({
          query: domain,
          ...normalizeDomainRdap(r.data, candidate),
          rdapServer: r.finalUrl,
          raw: r.data,
        });
      }
      const labels = candidate.split(".");
      if (labels.length <= 2) break;
      candidate = labels.slice(1).join(".");
    }
    return jsonError(404, "not_found", `No registration record found for ${domain}. It may be unregistered, or its registry may not offer RDAP.`);
  } catch (e) {
    return errorResponse(e);
  }
}

export const onRequest: PagesFunction = (ctx) => handleWhois(ctx.request);
