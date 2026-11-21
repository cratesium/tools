/** HTTP status descriptions and response-header analysis for the status and header tools. */

export interface StatusInfo {
  phrase: string;
  category: "informational" | "success" | "redirect" | "client-error" | "server-error" | "unknown";
  meaning: string;
}

const PHRASES: Record<number, [string, string]> = {
  100: ["Continue", "Interim response."],
  101: ["Switching Protocols", "The server is switching protocols."],
  200: ["OK", "The page loaded successfully."],
  201: ["Created", "A resource was created."],
  202: ["Accepted", "The request was accepted for processing."],
  203: ["Non-Authoritative Information", "Content was modified by a proxy."],
  204: ["No Content", "Success, with no body."],
  206: ["Partial Content", "Only part of the resource was sent."],
  301: ["Moved Permanently", "Permanent redirect: search engines transfer ranking to the new URL."],
  302: ["Found", "Temporary redirect."],
  303: ["See Other", "Redirect to another resource using GET."],
  304: ["Not Modified", "The cached copy is still valid."],
  307: ["Temporary Redirect", "Temporary redirect that keeps the request method."],
  308: ["Permanent Redirect", "Permanent redirect that keeps the request method."],
  400: ["Bad Request", "The server rejected the request as malformed."],
  401: ["Unauthorized", "Authentication is required."],
  402: ["Payment Required", "Payment is required."],
  403: ["Forbidden", "Access is refused (often bot protection or geo-blocking)."],
  404: ["Not Found", "The page does not exist."],
  405: ["Method Not Allowed", "The server does not accept this HTTP method."],
  406: ["Not Acceptable", "The server cannot produce an acceptable format."],
  408: ["Request Timeout", "The server timed out waiting for the request."],
  410: ["Gone", "The page was removed permanently."],
  418: ["I'm a teapot", "A joke status, sometimes used by bot protection."],
  429: ["Too Many Requests", "Rate limited."],
  451: ["Unavailable For Legal Reasons", "Blocked for legal reasons."],
  500: ["Internal Server Error", "The server hit an unexpected error."],
  501: ["Not Implemented", "The server does not support this feature."],
  502: ["Bad Gateway", "A proxy or CDN got an invalid response from the origin."],
  503: ["Service Unavailable", "The server is overloaded or under maintenance."],
  504: ["Gateway Timeout", "A proxy or CDN timed out waiting for the origin."],
  520: ["Unknown Error (Cloudflare)", "The origin returned an unexpected response to Cloudflare."],
  521: ["Web Server Is Down (Cloudflare)", "The origin refused Cloudflare's connection."],
  522: ["Connection Timed Out (Cloudflare)", "Cloudflare could not reach the origin in time."],
  523: ["Origin Is Unreachable (Cloudflare)", "Cloudflare could not route to the origin."],
  524: ["A Timeout Occurred (Cloudflare)", "The origin took too long to respond."],
  525: ["SSL Handshake Failed (Cloudflare)", "TLS between Cloudflare and the origin failed."],
  526: ["Invalid SSL Certificate (Cloudflare)", "The origin's certificate is invalid."],
};

export function statusInfo(code: number): StatusInfo {
  const [phrase, meaning] = PHRASES[code] ?? ["", ""];
  const category: StatusInfo["category"] =
    code >= 100 && code < 200
      ? "informational"
      : code < 300 && code >= 200
        ? "success"
        : code < 400 && code >= 300
          ? "redirect"
          : code < 500 && code >= 400
            ? "client-error"
            : code < 600 && code >= 500
              ? "server-error"
              : "unknown";
  return { phrase, category, meaning };
}

export interface HeaderCheck {
  header: string;
  status: "pass" | "warn" | "fail" | "info";
  detail: string;
}

type HeaderList = { name: string; value: string }[];

const get = (h: HeaderList, name: string) => h.find((x) => x.name.toLowerCase() === name)?.value ?? null;

/** Grades security-relevant response headers. */
export function analyzeSecurityHeaders(headers: HeaderList, isHttps: boolean): HeaderCheck[] {
  const out: HeaderCheck[] = [];
  const hsts = get(headers, "strict-transport-security");
  if (!isHttps) out.push({ header: "Strict-Transport-Security", status: "info", detail: "Only meaningful on HTTPS responses." });
  else if (!hsts) out.push({ header: "Strict-Transport-Security", status: "fail", detail: "Missing. Browsers may still try plain HTTP first." });
  else {
    const age = Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0);
    out.push({
      header: "Strict-Transport-Security",
      status: age >= 15552000 ? "pass" : "warn",
      detail: age >= 15552000 ? hsts : `max-age=${age} is shorter than the recommended 6 months (15552000).`,
    });
  }
  const csp = get(headers, "content-security-policy");
  const cspRo = get(headers, "content-security-policy-report-only");
  out.push(
    csp
      ? { header: "Content-Security-Policy", status: /'unsafe-inline'|'unsafe-eval'/.test(csp) && !/'nonce-|'strict-dynamic'/.test(csp) ? "warn" : "pass", detail: csp.length > 160 ? `${csp.slice(0, 160)}…` : csp }
      : { header: "Content-Security-Policy", status: cspRo ? "warn" : "fail", detail: cspRo ? "Only a Report-Only policy is set (not enforced)." : "Missing. A CSP is the main defence against cross-site scripting." },
  );
  const xcto = get(headers, "x-content-type-options");
  out.push({ header: "X-Content-Type-Options", status: xcto?.toLowerCase() === "nosniff" ? "pass" : "fail", detail: xcto ?? "Missing. Set to nosniff to stop MIME sniffing." });
  const xfo = get(headers, "x-frame-options");
  const frameAncestors = csp && /frame-ancestors/i.test(csp);
  out.push({
    header: "X-Frame-Options",
    status: xfo || frameAncestors ? "pass" : "warn",
    detail: xfo ?? (frameAncestors ? "Not set, but CSP frame-ancestors covers clickjacking." : "Missing. The page can be framed by other sites (clickjacking)."),
  });
  const rp = get(headers, "referrer-policy");
  out.push({ header: "Referrer-Policy", status: rp ? (/unsafe-url/i.test(rp) ? "warn" : "pass") : "warn", detail: rp ?? "Missing. Browsers default to strict-origin-when-cross-origin." });
  const pp = get(headers, "permissions-policy");
  out.push({ header: "Permissions-Policy", status: pp ? "pass" : "info", detail: pp ? (pp.length > 160 ? `${pp.slice(0, 160)}…` : pp) : "Not set. Restricts powerful features such as camera and geolocation." });
  const coop = get(headers, "cross-origin-opener-policy");
  out.push({ header: "Cross-Origin-Opener-Policy", status: coop ? "pass" : "info", detail: coop ?? "Not set. Isolates the browsing context from cross-origin popups." });
  const server = get(headers, "server");
  const powered = get(headers, "x-powered-by");
  if (powered || (server && /\d/.test(server)))
    out.push({ header: powered ? "X-Powered-By" : "Server", status: "warn", detail: `Reveals software versions: ${powered ?? server}.` });
  return out;
}

/** Short explanations for common response headers. */
export const HEADER_DOCS: Record<string, string> = {
  "accept-ranges": "Whether the server supports partial (range) requests.",
  age: "Seconds the response has been in a shared cache.",
  "alt-svc": "Alternative protocols (e.g. HTTP/3) the server supports.",
  "cache-control": "Caching rules for browsers and CDNs.",
  "cf-cache-status": "Cloudflare cache result (HIT, MISS, DYNAMIC…).",
  "cf-ray": "Cloudflare request id and data centre.",
  connection: "Connection management (hop-by-hop).",
  "content-encoding": "Compression applied to the body (gzip, br, zstd).",
  "content-language": "Language of the content.",
  "content-length": "Body size in bytes.",
  "content-security-policy": "Restricts where scripts, styles and other resources may load from.",
  "content-type": "Media type and character set of the body.",
  date: "When the response was generated.",
  etag: "Version identifier used for cache revalidation.",
  expires: "Legacy absolute cache expiry time.",
  "last-modified": "When the resource last changed.",
  link: "Related resources (preload, canonical, alternate).",
  location: "Redirect target.",
  nel: "Network Error Logging policy.",
  "permissions-policy": "Which browser features the page may use.",
  "referrer-policy": "How much referrer information is sent with requests.",
  "report-to": "Endpoints for browser reports.",
  server: "Server software.",
  "set-cookie": "Cookie set by the server.",
  "strict-transport-security": "Forces HTTPS for future visits (HSTS).",
  "transfer-encoding": "How the body is framed in transit.",
  vary: "Request headers that change the response (affects caching).",
  via: "Proxies the response passed through.",
  "x-cache": "Cache hit/miss from a proxy or CDN.",
  "x-content-type-options": "nosniff disables MIME-type sniffing.",
  "x-frame-options": "Controls whether the page can be framed.",
  "x-powered-by": "Framework or language behind the site.",
  "x-robots-tag": "Indexing directives for search engines (like the robots meta tag).",
  "x-xss-protection": "Legacy XSS filter switch (ignored by modern browsers).",
  "cross-origin-opener-policy": "Isolates the window from cross-origin openers.",
  "cross-origin-embedder-policy": "Requires cross-origin resources to opt in to embedding.",
  "cross-origin-resource-policy": "Who may embed this resource.",
  "access-control-allow-origin": "CORS: which origins may read the response.",
};
