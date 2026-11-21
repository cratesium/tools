/**
 * Browser-side client for UtilityHub's Cloudflare Pages Functions (/api/*).
 *
 * Under `next dev` or any static host the functions do not exist: requests either fail at
 * the network level or come back as a 404/HTML page. Those cases raise ApiUnavailableError
 * so the UI can explain how to get the function, instead of showing a confusing parse error.
 */

export const API_UNAVAILABLE_MESSAGE =
  "This tool needs the UtilityHub Cloudflare function, available on the deployed site or via `npm run pages:dev`.";

export class ApiUnavailableError extends Error {
  constructor(message = API_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "ApiUnavailableError";
  }
}

/** The function exists but the operator has not configured a binding / secret (503 not_configured). */
export class ApiNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiNotConfiguredError";
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

interface CallOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  fetchImpl?: FetchFn;
}

async function send(path: string, opts: CallOptions): Promise<Response> {
  const f = opts.fetchImpl ?? ((i: string, init?: RequestInit) => fetch(i, init));
  try {
    return await f(path, {
      method: opts.method ?? "GET",
      signal: opts.signal,
      headers: opts.body !== undefined ? { "content-type": "application/json", accept: "application/json" } : { accept: "application/json" },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    });
  } catch (e) {
    if (opts.signal?.aborted || (e as Error)?.name === "AbortError") throw e;
    throw new ApiUnavailableError();
  }
}

function isJson(res: Response): boolean {
  return (res.headers.get("content-type") ?? "").toLowerCase().includes("application/json");
}

async function raiseForError(res: Response): Promise<never> {
  if (!isJson(res)) {
    // Static hosting / next dev: no function behind /api → HTML 404 or 405.
    if (res.status === 404 || res.status === 405 || res.status === 501 || (res.headers.get("content-type") ?? "").includes("text/html"))
      throw new ApiUnavailableError();
    throw new ApiError(`The server answered HTTP ${res.status}.`, res.status, "http_error");
  }
  let data: { error?: string; message?: string } = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  const code = data.error ?? "http_error";
  const message = data.message ?? `The server answered HTTP ${res.status}.`;
  if (res.status === 503 && code === "not_configured") throw new ApiNotConfiguredError(message);
  throw new ApiError(message, res.status, code);
}

/** Calls a JSON endpoint and returns the parsed body. */
export async function callApi<T>(path: string, opts: CallOptions = {}): Promise<T> {
  const res = await send(path, opts);
  if (!res.ok || !isJson(res)) {
    if (res.ok && !isJson(res)) throw new ApiUnavailableError(); // e.g. SPA fallback served index.html
    await raiseForError(res);
  }
  return (await res.json()) as T;
}

/** Calls an endpoint that returns binary data (e.g. a screenshot) and returns it as a Blob. */
export async function callApiBlob(path: string, opts: CallOptions = {}): Promise<{ blob: Blob; headers: Headers }> {
  const res = await send(path, opts);
  if (!res.ok) await raiseForError(res);
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("text/html")) throw new ApiUnavailableError();
  return { blob: await res.blob(), headers: res.headers };
}

/** Builds a query string path: apiPath("/api/inspect", {url, html: 1}). Undefined values are skipped. */
export function apiPath(base: string, params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== false) q.set(k, v === true ? "1" : String(v));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/* ---------- Response shapes (mirrors functions/api/*) ---------- */

export interface InspectResponse {
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

export interface LinkCheckResult {
  url: string;
  status: number | null;
  ok: boolean;
  finalUrl: string | null;
  redirects: number;
  method: "HEAD" | "GET" | null;
  timingMs: number;
  error: string | null;
  verdict: "ok" | "redirect" | "broken" | "error" | "blocked" | "skipped";
}

/** Normalises what a user typed into a URL ("example.com" → "https://example.com/"). Throws on invalid input. */
export function normalizeUrlInput(raw: string): string {
  const s = raw.trim();
  if (!s) throw new Error("Enter a URL.");
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    throw new Error("That is not a valid URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http:// and https:// URLs are supported.");
  if (!u.hostname.includes(".") && !u.hostname.startsWith("[")) throw new Error("Enter a full domain, such as example.com.");
  return u.href;
}

/** Fetches a page's HTML through /api/inspect. */
export async function fetchPageHtml(url: string, opts: { signal?: AbortSignal; fetchImpl?: FetchFn } = {}): Promise<InspectResponse & { html: string }> {
  const r = await callApi<InspectResponse>(apiPath("/api/inspect", { url, html: true }), opts);
  if (r.html == null)
    throw new Error(
      r.ok
        ? `The page did not return HTML (Content-Type: ${r.contentType ?? "unknown"}).`
        : `The page answered HTTP ${r.status} ${r.statusText} without HTML to analyse.`,
    );
  return r as InspectResponse & { html: string };
}
