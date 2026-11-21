/**
 * GET /s/<code> → 301 redirect to the stored destination (SHORT_LINKS KV namespace).
 * The destination is re-validated before redirecting.
 */
import { validateTargetUrl, type Env, type PagesFunction } from "../api/_lib";
import { CODE_PATTERN, parseStoredLink } from "../api/_shortlinks";

function page(status: number, title: string, body: string): Response {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:15vh auto;padding:0 16px;color:#222}a{color:inherit}</style></head><body><h1>${esc(title)}</h1><p>${esc(body)}</p><p><a href="/tools/url-shortener">UtilityHub URL Shortener</a></p></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } },
  );
}

export async function handleRedirect(request: Request, code: string, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return page(405, "Method not allowed", "Short links only support GET.");
  if (!CODE_PATTERN.test(code)) return page(404, "Short link not found", "This short link does not exist.");
  if (!env.SHORT_LINKS) return page(503, "Short links are not configured", "The site operator has not set up the SHORT_LINKS storage yet.");
  const link = parseStoredLink(await env.SHORT_LINKS.get(code));
  if (!link) return page(404, "Short link not found", "This short link does not exist or has been removed.");
  try {
    const dest = validateTargetUrl(link.url, { addScheme: false });
    return new Response(null, {
      status: 301,
      headers: { location: dest.href, "cache-control": "public, max-age=3600", "x-robots-tag": "noindex" },
    });
  } catch {
    return page(410, "Short link disabled", "The destination of this short link is not allowed.");
  }
}

export const onRequest: PagesFunction<Env, "code"> = (ctx) =>
  handleRedirect(ctx.request, String(ctx.params.code ?? ""), ctx.env);
