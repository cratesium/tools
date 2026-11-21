/**
 * POST /api/check-links   body: {"urls": ["https://…", …]}  (max 25 per request)
 *
 * Checks each link with HEAD (falling back to GET when HEAD is refused), following and
 * re-validating redirects, 6 at a time. The browser sends batches and shows real progress.
 *
 * Workers on the Free plan allow 50 subrequests per invocation, so each request carries a
 * subrequest budget; links that cannot be checked within it are reported as "skipped" and
 * the client simply re-sends them in the next batch.
 */
import {
  errorResponse,
  fetchFollowingRedirects,
  guardRequest,
  HttpError,
  json,
  jsonError,
  mapWithConcurrency,
  methodNotAllowed,
  RateLimiter,
  validateTargetUrl,
  type FetchLike,
  type HandlerDeps,
  type PagesFunction,
} from "./_lib";

const limiter = new RateLimiter(40, 60_000);

export const MAX_LINKS_PER_REQUEST = 25;
export const CONCURRENCY = 6;
export const SUBREQUEST_BUDGET = 45;
const PER_LINK_TIMEOUT_MS = 10_000;
const MAX_BODY_JSON = 64 * 1024;

export interface LinkCheckResult {
  url: string;
  status: number | null;
  ok: boolean;
  finalUrl: string | null;
  redirects: number;
  method: "HEAD" | "GET" | null;
  timingMs: number;
  error: string | null;
  /** "ok" | "redirect" | "broken" | "error" | "blocked" | "skipped" */
  verdict: "ok" | "redirect" | "broken" | "error" | "blocked" | "skipped";
}

/** Wraps fetch so the number of outbound subrequests can be capped. */
export function budgetedFetch(inner: FetchLike, budget: number): { fetch: FetchLike; used: () => number } {
  let used = 0;
  return {
    used: () => used,
    fetch: (input, init) => {
      if (used >= budget) return Promise.reject(new HttpError(503, "budget_exhausted", "Subrequest budget exhausted"));
      used++;
      return inner(input, init);
    },
  };
}

async function checkOne(url: string, f: FetchLike, now: () => number): Promise<LinkCheckResult> {
  const base: LinkCheckResult = { url, status: null, ok: false, finalUrl: null, redirects: 0, method: null, timingMs: 0, error: null, verdict: "error" };
  try {
    validateTargetUrl(url, { addScheme: false });
  } catch (e) {
    return { ...base, error: (e as Error).message, verdict: "blocked" };
  }
  const t0 = now();
  const attempt = async (method: "HEAD" | "GET") => {
    const r = await fetchFollowingRedirects(url, { fetch: f, method, timeoutMs: PER_LINK_TIMEOUT_MS, now, maxRedirects: 10 });
    await r.response.body?.cancel().catch(() => undefined);
    return { ...r, method };
  };
  try {
    let r = await attempt("HEAD");
    // Many servers mishandle HEAD: retry with GET on 405/501/403/400/404/429-style refusals.
    if ([400, 403, 404, 405, 406, 429, 500, 501, 502, 503].includes(r.response.status)) {
      try {
        r = await attempt("GET");
      } catch (e) {
        if (e instanceof HttpError && e.code === "budget_exhausted") throw e;
        /* keep HEAD result */
      }
    }
    const status = r.response.status;
    const ok = status >= 200 && status < 400;
    return {
      url,
      status,
      ok,
      finalUrl: r.finalUrl,
      redirects: r.redirects.length,
      method: r.method,
      timingMs: Math.round(now() - t0),
      error: null,
      verdict: !ok ? "broken" : r.redirects.length ? "redirect" : "ok",
    };
  } catch (e) {
    const timingMs = Math.round(now() - t0);
    if (e instanceof HttpError) {
      if (e.code === "budget_exhausted") return { ...base, timingMs, verdict: "skipped", error: "Not checked in this batch (subrequest limit)." };
      return { ...base, timingMs, error: e.message, verdict: e.code.startsWith("blocked") ? "blocked" : "error" };
    }
    const err = e as { name?: string; message?: string };
    const msg = err?.name === "TimeoutError" || err?.name === "AbortError" ? "Timed out after 10 s" : err?.message || "Request failed";
    return { ...base, timingMs, error: msg, verdict: "error" };
  }
}

export async function handleCheckLinks(request: Request, deps: HandlerDeps = {}): Promise<Response> {
  const now = deps.now ?? Date.now;
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const blocked = guardRequest(request, deps.limiter === undefined ? limiter : deps.limiter, now());
  if (blocked) return blocked;
  try {
    if (!(request.headers.get("content-type") ?? "").includes("application/json"))
      return jsonError(415, "unsupported_media_type", "Send a JSON body: {\"urls\": [...]}.");
    const text = await request.text();
    if (text.length > MAX_BODY_JSON) return jsonError(413, "payload_too_large", "Request body is too large.");
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return jsonError(400, "invalid_json", "Request body is not valid JSON.");
    }
    const urls = (body as { urls?: unknown })?.urls;
    if (!Array.isArray(urls) || !urls.every((u) => typeof u === "string"))
      return jsonError(400, "invalid_body", "Expected {\"urls\": string[]}.");
    if (urls.length === 0) return jsonError(400, "no_urls", "No URLs to check.");
    if (urls.length > MAX_LINKS_PER_REQUEST)
      return jsonError(400, "too_many_urls", `At most ${MAX_LINKS_PER_REQUEST} URLs per request.`);
    const budget = budgetedFetch(deps.fetch ?? fetch, SUBREQUEST_BUDGET);
    const results = await mapWithConcurrency(urls as string[], CONCURRENCY, (u) => checkOne(u, budget.fetch, now));
    return json({ results, subrequests: budget.used() });
  } catch (e) {
    return errorResponse(e);
  }
}

export const onRequest: PagesFunction = (ctx) => handleCheckLinks(ctx.request);
