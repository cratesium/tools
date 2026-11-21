/**
 * GET /api/inspect?url=<url>[&html=1][&method=HEAD]
 *
 * Fetches a public URL (following and re-validating redirects) and reports the final URL,
 * status, redirect chain, response headers and timing. With html=1 and a text/HTML
 * response, the (capped) body is returned for in-browser analysis.
 */
import {
  decodeText,
  errorResponse,
  fetchFollowingRedirects,
  guardRequest,
  headersToList,
  json,
  MAX_BODY_BYTES,
  methodNotAllowed,
  RateLimiter,
  readBodyCapped,
  type HandlerDeps,
  type PagesFunction,
} from "./_lib";

const limiter = new RateLimiter(60, 60_000);

export interface InspectResult {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  statusText: string;
  ok: boolean;
  redirects: { url: string; status: number; location: string | null }[];
  headers: { name: string; value: string }[];
  timingMs: number;
  contentType: string | null;
  contentLength: number | null;
  method: "GET" | "HEAD";
  html?: string;
  htmlTruncated?: boolean;
  bytesRead?: number;
}

export async function handleInspect(request: Request, deps: HandlerDeps = {}): Promise<Response> {
  const now = deps.now ?? Date.now;
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const blocked = guardRequest(request, deps.limiter === undefined ? limiter : deps.limiter, now());
  if (blocked) return blocked;
  try {
    const params = new URL(request.url).searchParams;
    const wantHtml = params.get("html") === "1";
    const method = !wantHtml && params.get("method")?.toUpperCase() === "HEAD" ? "HEAD" : "GET";
    const target = params.get("url");
    const { response, finalUrl, redirects, timingMs } = await fetchFollowingRedirects(target ?? "", {
      fetch: deps.fetch,
      now,
      method,
      timeoutMs: 15_000,
    });
    const contentType = response.headers.get("content-type");
    const lenHeader = response.headers.get("content-length");
    const result: InspectResult = {
      requestedUrl: redirects[0]?.url ?? finalUrl,
      finalUrl,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      redirects,
      headers: headersToList(response.headers),
      timingMs,
      contentType,
      contentLength: lenHeader && /^\d+$/.test(lenHeader) ? Number(lenHeader) : null,
      method,
    };
    const isText = /^(text\/html|application\/xhtml\+xml|text\/plain|application\/xml|text\/xml)/i.test(contentType ?? "");
    if (wantHtml && isText && method === "GET") {
      const { bytes, truncated } = await readBodyCapped(response, MAX_BODY_BYTES);
      result.html = decodeText(bytes, contentType);
      result.htmlTruncated = truncated;
      result.bytesRead = bytes.byteLength;
    } else {
      await response.body?.cancel().catch(() => undefined);
    }
    return json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

export const onRequest: PagesFunction = (ctx) => handleInspect(ctx.request);
