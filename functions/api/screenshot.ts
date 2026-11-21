/**
 * GET /api/screenshot?url=<url>[&width=1280][&height=800][&fullPage=1][&format=png|jpeg]
 *
 * Renders a page with the Cloudflare Browser Rendering REST API and streams the image back.
 * Requires env CF_ACCOUNT_ID (var) and CF_API_TOKEN (secret, "Browser Rendering - Edit").
 * Without them: 503 {"error":"not_configured"}. Results are cached in caches.default for 1 hour.
 */
import {
  errorResponse,
  guardRequest,
  HttpError,
  jsonError,
  methodNotAllowed,
  RateLimiter,
  validateTargetUrl,
  type HandlerDeps,
  type PagesFunction,
} from "./_lib";

const limiter = new RateLimiter(6, 60_000);
const CACHE_TTL_S = 3600;

export interface ScreenshotOptions {
  url: string;
  width: number;
  height: number;
  fullPage: boolean;
  format: "png" | "jpeg";
}

const clampInt = (v: string | null, def: number, min: number, max: number) => {
  const n = v == null || v === "" ? def : Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

export function parseScreenshotParams(params: URLSearchParams): ScreenshotOptions {
  const url = validateTargetUrl(params.get("url")).href;
  return {
    url,
    width: clampInt(params.get("width"), 1280, 320, 1920),
    height: clampInt(params.get("height"), 800, 320, 1600),
    fullPage: params.get("fullPage") === "1",
    format: params.get("format") === "jpeg" ? "jpeg" : "png",
  };
}

/** Request body for POST /accounts/{id}/browser-rendering/screenshot. */
export function buildRenderBody(o: ScreenshotOptions) {
  return {
    url: o.url,
    viewport: { width: o.width, height: o.height },
    screenshotOptions: { fullPage: o.fullPage, type: o.format, ...(o.format === "jpeg" ? { quality: 85 } : {}) },
    gotoOptions: { waitUntil: "networkidle2", timeout: 30_000 },
  };
}

interface CacheLike {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, res: Response): Promise<void>;
}

export async function handleScreenshot(
  request: Request,
  deps: HandlerDeps & { cache?: CacheLike | null; waitUntil?: (p: Promise<unknown>) => void } = {},
): Promise<Response> {
  const now = deps.now ?? Date.now;
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const blocked = guardRequest(request, deps.limiter === undefined ? limiter : deps.limiter, now());
  if (blocked) return blocked;
  const accountId = deps.env?.CF_ACCOUNT_ID;
  const token = deps.env?.CF_API_TOKEN;
  if (!accountId || !token)
    return jsonError(503, "not_configured", "Screenshots are not configured: the site operator must set CF_ACCOUNT_ID and the CF_API_TOKEN secret for Cloudflare Browser Rendering.");
  try {
    const opts = parseScreenshotParams(new URL(request.url).searchParams);
    const cacheKey = new Request(
      `${new URL(request.url).origin}/__screenshot-cache?${new URLSearchParams({
        u: opts.url,
        w: String(opts.width),
        h: String(opts.height),
        f: opts.fullPage ? "1" : "0",
        t: opts.format,
      })}`,
    );
    const cache = deps.cache === undefined ? defaultCache() : deps.cache;
    const hit = cache ? await cache.match(cacheKey).catch(() => undefined) : undefined;
    if (hit) {
      const h = new Headers(hit.headers);
      h.set("x-cache", "HIT");
      return new Response(hit.body, { status: 200, headers: h });
    }
    const f = deps.fetch ?? fetch;
    const res = await f(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/browser-rendering/screenshot`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(buildRenderBody(opts)),
      signal: AbortSignal.timeout(60_000),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { errors?: { message?: string }[] };
        if (body?.errors?.[0]?.message) detail = body.errors[0].message;
      } catch {
        /* non-JSON error */
      }
      if (res.status === 401 || res.status === 403)
        throw new HttpError(503, "not_configured", "The Browser Rendering API rejected the configured credentials.");
      if (res.status === 429) throw new HttpError(429, "upstream_rate_limited", "Screenshot capacity is busy. Try again shortly.");
      throw new HttpError(502, "render_failed", `The page could not be rendered (${detail}).`);
    }
    const bytes = await res.arrayBuffer();
    const headers = {
      "content-type": opts.format === "jpeg" ? "image/jpeg" : "image/png",
      "cache-control": `private, max-age=${CACHE_TTL_S}`,
      "x-content-type-options": "nosniff",
      "x-final-url": opts.url,
    };
    if (cache) {
      const put = cache
        .put(cacheKey, new Response(bytes.slice(0), { headers: { ...headers, "cache-control": `public, max-age=${CACHE_TTL_S}` } }))
        .catch(() => undefined);
      if (deps.waitUntil) deps.waitUntil(put);
      else await put;
    }
    return new Response(bytes, { status: 200, headers: { ...headers, "x-cache": "MISS" } });
  } catch (e) {
    return errorResponse(e);
  }
}

function defaultCache(): CacheLike | null {
  const c = (globalThis as unknown as { caches?: { default?: CacheLike } }).caches;
  return c?.default ?? null;
}

export const onRequest: PagesFunction = (ctx) =>
  handleScreenshot(ctx.request, { env: ctx.env, waitUntil: (p) => ctx.waitUntil(p) });
