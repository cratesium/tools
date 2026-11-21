/**
 * GET /api/myip
 *
 * Returns the caller's public IP (CF-Connecting-IP) and the approximate location and
 * network data Cloudflare attaches to every request (request.cf). Nothing is stored.
 */
import { checkSameOrigin, classifyIp, json, jsonError, methodNotAllowed, type CfProperties, type PagesFunction } from "./_lib";

export function handleMyIp(request: Request, cf: CfProperties | undefined): Response {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const origin = checkSameOrigin(request);
  if (origin) return origin;
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip) return jsonError(503, "no_client_ip", "The client IP is not available (not running behind Cloudflare).");
  const info = classifyIp(ip);
  const num = (v: string | undefined) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  return json({
    ip: info?.normalized ?? ip,
    version: info?.version ?? null,
    country: cf?.country ?? null,
    city: cf?.city ?? null,
    region: cf?.region ?? null,
    regionCode: cf?.regionCode ?? null,
    postalCode: cf?.postalCode ?? null,
    latitude: num(cf?.latitude),
    longitude: num(cf?.longitude),
    timezone: cf?.timezone ?? null,
    continent: cf?.continent ?? null,
    isEU: cf?.isEUCountry === "1",
    asn: typeof cf?.asn === "number" ? cf.asn : null,
    asOrganization: cf?.asOrganization ?? null,
    colo: cf?.colo ?? null,
    httpProtocol: cf?.httpProtocol ?? null,
    tlsVersion: cf?.tlsVersion ?? null,
    tlsCipher: cf?.tlsCipher ?? null,
    clientTcpRtt: typeof cf?.clientTcpRtt === "number" ? cf.clientTcpRtt : null,
    userAgent: request.headers.get("user-agent"),
    acceptLanguage: request.headers.get("accept-language"),
  });
}

export const onRequest: PagesFunction = (ctx) =>
  handleMyIp(ctx.request, (ctx.request as Request & { cf?: CfProperties }).cf);
