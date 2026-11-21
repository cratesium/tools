/**
 * GET /api/ip?ip=<IPv4 or IPv6>
 *
 * Network registration data for an IP address via RDAP (rdap.org → ARIN / RIPE NCC /
 * APNIC / LACNIC / AFRINIC): network name, range, CIDR, owning organisation, abuse contact
 * and the registration country. This is registry data, not GPS-style geolocation.
 */
import {
  classifyIp,
  errorResponse,
  guardRequest,
  json,
  jsonError,
  methodNotAllowed,
  RateLimiter,
  type HandlerDeps,
  type PagesFunction,
} from "./_lib";
import { fetchRdap, normalizeIpRdap } from "./_rdap";

const limiter = new RateLimiter(20, 60_000);

export async function handleIpLookup(request: Request, deps: HandlerDeps = {}): Promise<Response> {
  const now = deps.now ?? Date.now;
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const blocked = guardRequest(request, deps.limiter === undefined ? limiter : deps.limiter, now());
  if (blocked) return blocked;
  try {
    const raw = (new URL(request.url).searchParams.get("ip") ?? "").trim();
    if (!raw) return jsonError(400, "missing_ip", "Enter an IPv4 or IPv6 address.");
    const info = classifyIp(raw);
    if (!info) return jsonError(400, "invalid_ip", "That is not a valid IPv4 or IPv6 address.");
    if (info.blockedReason)
      return json({
        query: info.normalized,
        version: info.version,
        reserved: true,
        reservedReason: info.blockedReason,
        message: `This is a ${info.blockedReason} address. It is not publicly routable, so no registry owns it.`,
      });
    const r = await fetchRdap(`/ip/${encodeURIComponent(info.normalized)}`, deps.fetch, now);
    if (!r) return jsonError(404, "not_found", `No registry record found for ${info.normalized}.`);
    return json({
      version: info.version,
      reserved: false,
      ...normalizeIpRdap(r.data, info.normalized, r.finalUrl),
      rdapServer: r.finalUrl,
      raw: r.data,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export const onRequest: PagesFunction = (ctx) => handleIpLookup(ctx.request);
