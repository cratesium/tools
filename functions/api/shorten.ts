/**
 * POST /api/shorten   body: {"url": "https://…"}
 *
 * Stores the destination in the SHORT_LINKS KV namespace under a random 7-character
 * base62 code and returns https://<site>/s/<code>. Destinations pass the same URL
 * validation and SSRF guard as every other endpoint. Without the binding: 503 not_configured.
 */
import {
  errorResponse,
  guardRequest,
  HttpError,
  json,
  jsonError,
  methodNotAllowed,
  RateLimiter,
  validateTargetUrl,
  type HandlerDeps,
  type PagesFunction,
} from "./_lib";
import { generateCode, type StoredLink } from "./_shortlinks";

const limiter = new RateLimiter(10, 60_000);
const MAX_ATTEMPTS = 5;

export async function handleShorten(
  request: Request,
  deps: HandlerDeps & { random?: (b: Uint8Array) => Uint8Array } = {},
): Promise<Response> {
  const now = deps.now ?? Date.now;
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const blocked = guardRequest(request, deps.limiter === undefined ? limiter : deps.limiter, now());
  if (blocked) return blocked;
  const kv = deps.env?.SHORT_LINKS;
  if (!kv)
    return jsonError(503, "not_configured", "The URL shortener is not configured: the site operator must bind a KV namespace named SHORT_LINKS.");
  try {
    const text = await request.text();
    if (text.length > 8192) return jsonError(413, "payload_too_large", "Request body is too large.");
    let body: { url?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      return jsonError(400, "invalid_json", "Request body is not valid JSON.");
    }
    if (typeof body?.url !== "string") return jsonError(400, "missing_url", "Expected {\"url\": string}.");
    const target = validateTargetUrl(body.url);
    const self = new URL(request.url);
    if (target.host === self.host && target.pathname.startsWith("/s/"))
      throw new HttpError(400, "already_short", "That is already a UtilityHub short link.");
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const code = generateCode(deps.random);
      if ((await kv.get(code)) !== null) continue; // collision, try another code
      const record: StoredLink = { url: target.href, createdAt: new Date(now()).toISOString() };
      await kv.put(code, JSON.stringify(record));
      return json({ code, shortUrl: `${self.origin}/s/${code}`, url: target.href, createdAt: record.createdAt }, 201);
    }
    return jsonError(503, "collision", "Could not allocate a unique code. Please try again.");
  } catch (e) {
    return errorResponse(e);
  }
}

export const onRequest: PagesFunction = (ctx) => handleShorten(ctx.request, { env: ctx.env });
