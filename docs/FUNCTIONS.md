# Cloudflare Pages Functions

UtilityHub is a static site. The few features that genuinely need a server live in `functions/` and are deployed automatically with the site by Cloudflare Pages. Every handler is a pure exported function (`handleX(request, deps)`) wrapped by `onRequest`, so it can be unit-tested with a mocked `fetch`.

Run them locally with the built site:

```bash
npm run build
npm run pages:dev        # wrangler pages dev out → http://localhost:8788
```

Under `next dev` the endpoints don't exist. The UI detects this (network error or HTML/404 response) and explains it instead of failing.

## Shared hardening (`functions/api/_lib.ts`)

- **URL validation**: http/https only, ≤ 2048 characters, no credentials in URLs, default and common alternative ports only.
- **SSRF guard**: rejects localhost, private, link-local, CGNAT, multicast, metadata and other reserved IPv4/IPv6 literals, and `.local` / `.internal` / `.localhost` hostnames. Redirects are followed manually (max 10), and every hop is re-validated. Workers also cannot reach private networks, which gives a second layer of protection.
- **Timeouts** via `AbortSignal.timeout` (10–15 s), and response bodies are capped at 3 MB.
- **Same-origin only**: requests carrying a cross-site `Origin` / `Sec-Fetch-Site` are rejected, and no CORS headers are sent.
- **Rate limiting**: a best-effort in-memory, per-isolate, per-IP limiter. For real protection, add a Cloudflare **Rate Limiting rule** on `/api/*` (Security → WAF → Rate limiting rules), for example 60 requests per minute per IP.
- **JSON errors**: `{ "error": "<code>", "message": "<human text>" }` with a proper status code.
- **User-Agent**: `UtilityHubBot/1.0 (+https://utilityhub-4kt.pages.dev)`.

## Endpoints

| Endpoint | Used by | Upstream | Bindings / env |
| --- | --- | --- | --- |
| `GET /api/inspect?url=&html=1&method=HEAD` | Status checker, header checker, URL expander, meta tag analyzer, Open Graph preview, website word counter, HTML viewer, link extractor, sitemap crawl | The target site | — |
| `POST /api/check-links` `{"urls": [...]}` (≤ 25 per request) | Broken link checker | Target sites (HEAD, GET fallback, concurrency 6) | — |
| `GET /api/whois?domain=` | WHOIS lookup | RDAP (IANA bootstrap, then rdap.org) | — |
| `GET /api/ip?ip=` | IP address lookup | RDAP via rdap.org | — |
| `GET /api/myip` | My IP address | `CF-Connecting-IP` and `request.cf` | — |
| `GET /api/ssl?host=` | SSL certificate checker | crt.sh (Certificate Transparency) and a live HTTPS probe | — |
| `POST /api/shorten` `{"url": "..."}` | URL shortener | — | KV namespace `SHORT_LINKS` |
| `GET /s/:code` | Short-link redirect (301) | — | KV namespace `SHORT_LINKS` |
| `GET /api/screenshot?url=&width=&height=&fullPage=1&format=png\|jpeg` | Website screenshot tool | Cloudflare Browser Rendering REST API | `CF_ACCOUNT_ID` (var), `CF_API_TOKEN` (secret) |

DNS Lookup does **not** use a function. The browser queries Cloudflare or Google DNS-over-HTTPS directly.

## Optional configuration

### URL shortener (KV)

```bash
npx wrangler kv namespace create SHORT_LINKS
```

Then either uncomment `kv_namespaces` in `wrangler.jsonc` and paste the id, or go to Pages project → Settings → Bindings → KV namespace, with variable name `SHORT_LINKS`. Without the binding, `/api/shorten` returns `503 not_configured` and the tool says so.

### Website screenshots (Browser Rendering)

1. Create an API token with the **Browser Rendering – Edit** permission.
2. Pages project → Settings → Variables and Secrets:
   - `CF_ACCOUNT_ID` = your account id (plain variable)
   - `CF_API_TOKEN` = the token (**encrypt** it as a secret)
3. Redeploy. Browser Rendering is billed by Cloudflare beyond its free allowance.

## Limits and honesty notes

- **SSL checker**: Workers cannot read a TLS peer certificate, so certificate details come from Certificate Transparency logs plus a live HTTPS reachability check, not from a raw handshake.
- **Fetching sites**: Some sites block data-centre IPs or bots (403/429). These are reported as "blocked", not "broken".
- **Content limits**: Only the initial HTML is analysed, without running JavaScript, and bodies over 3 MB are truncated.
