/**
 * DNS lookups over HTTPS (DoH) using the JSON API of Cloudflare (1.1.1.1) and Google
 * Public DNS. Both send CORS headers, so queries go straight from the browser to the resolver.
 */
import { parseIPv4, parseIPv6 } from "./ip";

export const RECORD_TYPES = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  PTR: 12,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  SRV: 33,
  DS: 43,
  DNSKEY: 48,
  SVCB: 64,
  HTTPS: 65,
  CAA: 257,
} as const;

export type RecordType = keyof typeof RECORD_TYPES;
export const RECORD_TYPE_LIST = Object.keys(RECORD_TYPES) as RecordType[];

const TYPE_NAMES: Record<number, string> = Object.fromEntries(Object.entries(RECORD_TYPES).map(([k, v]) => [v, k]));
TYPE_NAMES[46] = "RRSIG";
TYPE_NAMES[47] = "NSEC";
TYPE_NAMES[50] = "NSEC3";

export function typeName(n: number): string {
  return TYPE_NAMES[n] ?? `TYPE${n}`;
}

export const RCODES: Record<number, { name: string; meaning: string }> = {
  0: { name: "NOERROR", meaning: "The query succeeded." },
  1: { name: "FORMERR", meaning: "The resolver could not interpret the query." },
  2: { name: "SERVFAIL", meaning: "The authoritative servers failed to answer (often a DNSSEC or delegation problem)." },
  3: { name: "NXDOMAIN", meaning: "The domain name does not exist." },
  4: { name: "NOTIMP", meaning: "The resolver does not support this kind of query." },
  5: { name: "REFUSED", meaning: "The server refused to answer." },
};

export type DohProvider = "cloudflare" | "google";

export const DOH_ENDPOINTS: Record<DohProvider, { label: string; url: string }> = {
  cloudflare: { label: "Cloudflare (1.1.1.1)", url: "https://cloudflare-dns.com/dns-query" },
  google: { label: "Google (8.8.8.8)", url: "https://dns.google/resolve" },
};

export interface DnsRecord {
  name: string;
  type: number;
  typeName: string;
  ttl: number;
  data: string;
}

export interface DnsResult {
  provider: DohProvider;
  name: string;
  type: RecordType;
  status: number;
  statusName: string;
  statusMeaning: string;
  /** Authenticated Data: the resolver validated the answer with DNSSEC. */
  ad: boolean;
  truncated: boolean;
  answers: DnsRecord[];
  authority: DnsRecord[];
  comment: string | null;
  timingMs: number;
}

/** Validates and normalises a DNS name (accepts URLs and IDNs, returns ASCII without trailing dot). */
export function normalizeDnsName(raw: string): string {
  let s = raw.trim();
  if (!s) throw new Error("Enter a domain name or IP address.");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    try {
      s = new URL(s).hostname;
    } catch {
      throw new Error("That is not a valid domain name.");
    }
  }
  s = s.replace(/\.$/, "");
  if (parseIPv4(s) || parseIPv6(s)) return s;
  let ascii: string;
  try {
    // WHATWG URL parsing performs IDNA (punycode) conversion and keeps underscores (_dmarc, _sip._tcp).
    ascii = new URL(`http://${s}`).hostname;
  } catch {
    throw new Error("That is not a valid domain name.");
  }
  if (ascii.length > 253) throw new Error("Domain names are limited to 253 characters.");
  if (!/^[a-z0-9_.-]+$/.test(ascii) || ascii.split(".").some((l) => !l || l.length > 63))
    throw new Error("That is not a valid domain name.");
  return ascii;
}

/** Reverse-DNS (PTR) name for an IP: 1.2.3.4 → 4.3.2.1.in-addr.arpa. Returns null if not an IP. */
export function reverseName(ip: string): string | null {
  const v4 = parseIPv4(ip.trim());
  if (v4) return `${[...v4].reverse().join(".")}.in-addr.arpa`;
  const v6 = parseIPv6(ip.trim());
  if (v6) {
    const nibbles = v6.map((h) => h.toString(16).padStart(4, "0")).join("").split("");
    return `${nibbles.reverse().join(".")}.ip6.arpa`;
  }
  return null;
}

export function buildDohUrl(provider: DohProvider, name: string, type: RecordType, dnssec = true): string {
  const q = new URLSearchParams({ name, type });
  if (dnssec) q.set("do", "1");
  return `${DOH_ENDPOINTS[provider].url}?${q}`;
}

interface DohJson {
  Status?: number;
  TC?: boolean;
  AD?: boolean;
  Answer?: { name: string; type: number; TTL: number; data: string }[];
  Authority?: { name: string; type: number; TTL: number; data: string }[];
  Comment?: string | string[];
}

export function parseDohJson(json: DohJson, provider: DohProvider, name: string, type: RecordType, timingMs = 0): DnsResult {
  const status = typeof json.Status === "number" ? json.Status : -1;
  const map = (r: { name: string; type: number; TTL: number; data: string }): DnsRecord => ({
    name: String(r.name).replace(/\.$/, ""),
    type: r.type,
    typeName: typeName(r.type),
    ttl: r.TTL,
    data: String(r.data),
  });
  return {
    provider,
    name,
    type,
    status,
    statusName: RCODES[status]?.name ?? `RCODE ${status}`,
    statusMeaning: RCODES[status]?.meaning ?? "Unexpected response code.",
    ad: Boolean(json.AD),
    truncated: Boolean(json.TC),
    answers: (json.Answer ?? []).map(map),
    authority: (json.Authority ?? []).map(map),
    comment: Array.isArray(json.Comment) ? json.Comment.join(" ") : (json.Comment ?? null),
    timingMs,
  };
}

/** Runs one DoH query from the browser. */
export async function dohQuery(
  name: string,
  type: RecordType,
  opts: { provider?: DohProvider; signal?: AbortSignal; fetchImpl?: (u: string, i?: RequestInit) => Promise<Response> } = {},
): Promise<DnsResult> {
  const provider = opts.provider ?? "cloudflare";
  const f = opts.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i));
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  let res: Response;
  try {
    res = await f(buildDohUrl(provider, name, type), { headers: { accept: "application/dns-json" }, signal: opts.signal });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    throw new Error(`Could not reach ${DOH_ENDPOINTS[provider].label}. A browser extension, firewall or network policy may block DNS-over-HTTPS.`);
  }
  if (!res.ok) throw new Error(`${DOH_ENDPOINTS[provider].label} answered HTTP ${res.status}.`);
  const json = (await res.json()) as DohJson;
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return parseDohJson(json, provider, name, type, Math.round(t1 - t0));
}

/** TXT data comes back as one or more quoted strings; join them into the logical value. */
export function unquoteTxt(data: string): string {
  const parts = data.match(/"((?:[^"\\]|\\.)*)"/g);
  if (!parts) return data;
  return parts.map((p) => p.slice(1, -1).replace(/\\(.)/g, "$1")).join("");
}

/** Human-friendly explanation of a record's data field. */
export function describeRecord(r: DnsRecord): string | null {
  const parts = r.data.split(/\s+/);
  switch (r.typeName) {
    case "MX":
      return `Priority ${parts[0]}, mail server ${parts[1]?.replace(/\.$/, "")}`;
    case "SRV":
      return `Priority ${parts[0]}, weight ${parts[1]}, port ${parts[2]}, target ${parts[3]?.replace(/\.$/, "")}`;
    case "SOA":
      return `Primary NS ${parts[0]?.replace(/\.$/, "")}, admin ${parts[1]?.replace(/\.$/, "").replace(".", "@")}, serial ${parts[2]}`;
    case "CAA":
      return `${parts[1]} ${parts.slice(2).join(" ")} (flags ${parts[0]})`;
    case "TXT": {
      const v = unquoteTxt(r.data);
      if (v.startsWith("v=spf1")) return "SPF policy (authorised mail senders)";
      if (v.startsWith("v=DMARC1")) return "DMARC policy";
      if (/^v=DKIM1/i.test(v)) return "DKIM public key";
      if (/^google-site-verification=/.test(v)) return "Google site verification";
      if (/^MS=/.test(v)) return "Microsoft 365 verification";
      return null;
    }
    default:
      return null;
  }
}
