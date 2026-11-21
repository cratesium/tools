/**
 * RDAP helpers shared by /api/whois and /api/ip. Exports no route handler.
 * RDAP (RFC 9082/9083) is the structured JSON successor to WHOIS; rdap.org redirects each
 * query to the authoritative registry or RIR server listed in IANA's bootstrap files.
 */
import { decodeText, fetchFollowingRedirects, HttpError, readBodyCapped, type FetchLike } from "./_lib";

export const RDAP_BASE = "https://rdap.org";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export interface RdapContact {
  roles: string[];
  name: string | null;
  org: string | null;
  email: string | null;
  phone: string | null;
  handle: string | null;
  ianaId: string | null;
}

export interface RdapEvent {
  action: string;
  date: string;
}

/** Reads one vCard property value from an RDAP jCard array. */
function vcardValue(vcard: Json, prop: string): string | null {
  const props = Array.isArray(vcard) && Array.isArray(vcard[1]) ? vcard[1] : [];
  for (const p of props) {
    if (Array.isArray(p) && p[0] === prop) {
      const v = p[3];
      if (typeof v === "string") return v.replace(/^tel:/, "").replace(/^mailto:/, "");
      if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x).join(", ") || null;
    }
  }
  return null;
}

/** Flattens nested RDAP entities into a contact list. */
export function extractContacts(entities: Json, depth = 0): RdapContact[] {
  if (!Array.isArray(entities) || depth > 3) return [];
  const out: RdapContact[] = [];
  for (const e of entities) {
    if (!e || typeof e !== "object") continue;
    const ianaId = Array.isArray(e.publicIds)
      ? (e.publicIds.find((p: Json) => /iana/i.test(String(p?.type)))?.identifier ?? null)
      : null;
    out.push({
      roles: Array.isArray(e.roles) ? e.roles.map(String) : [],
      name: vcardValue(e.vcardArray, "fn"),
      org: vcardValue(e.vcardArray, "org"),
      email: vcardValue(e.vcardArray, "email"),
      phone: vcardValue(e.vcardArray, "tel"),
      handle: typeof e.handle === "string" ? e.handle : null,
      ianaId: ianaId != null ? String(ianaId) : null,
    });
    out.push(...extractContacts(e.entities, depth + 1));
  }
  return out;
}

export function extractEvents(events: Json): RdapEvent[] {
  if (!Array.isArray(events)) return [];
  return events
    .filter((e) => e && typeof e.eventAction === "string" && typeof e.eventDate === "string")
    .map((e) => ({ action: e.eventAction, date: e.eventDate }));
}

const eventDate = (events: RdapEvent[], ...actions: string[]) => events.find((e) => actions.includes(e.action))?.date ?? null;

export interface DomainRdap {
  domain: string;
  unicodeName: string | null;
  handle: string | null;
  registrar: string | null;
  registrarIanaId: string | null;
  registrarUrl: string | null;
  abuseEmail: string | null;
  abusePhone: string | null;
  created: string | null;
  updated: string | null;
  expires: string | null;
  status: string[];
  nameservers: string[];
  dnssec: boolean | null;
  events: RdapEvent[];
  contacts: RdapContact[];
  notices: string[];
}

export function normalizeDomainRdap(raw: Json, fallbackName: string): DomainRdap {
  const contacts = extractContacts(raw?.entities);
  const events = extractEvents(raw?.events);
  const registrar = contacts.find((c) => c.roles.includes("registrar"));
  const abuse = contacts.find((c) => c.roles.includes("abuse"));
  const registrarLink = Array.isArray(raw?.entities)
    ? raw.entities
        .find((e: Json) => Array.isArray(e?.roles) && e.roles.includes("registrar"))
        ?.links?.find((l: Json) => typeof l?.href === "string" && l.rel !== "self")?.href
    : null;
  return {
    domain: String(raw?.ldhName ?? fallbackName).toLowerCase(),
    unicodeName: typeof raw?.unicodeName === "string" ? raw.unicodeName : null,
    handle: typeof raw?.handle === "string" ? raw.handle : null,
    registrar: registrar?.name ?? registrar?.org ?? null,
    registrarIanaId: registrar?.ianaId ?? null,
    registrarUrl: registrarLink ?? null,
    abuseEmail: abuse?.email ?? null,
    abusePhone: abuse?.phone ?? null,
    created: eventDate(events, "registration"),
    updated: eventDate(events, "last changed", "last update of RDAP database"),
    expires: eventDate(events, "expiration"),
    status: Array.isArray(raw?.status) ? raw.status.map(String) : [],
    nameservers: Array.isArray(raw?.nameservers)
      ? raw.nameservers.map((n: Json) => String(n?.ldhName ?? "").toLowerCase()).filter(Boolean)
      : [],
    dnssec: typeof raw?.secureDNS?.delegationSigned === "boolean" ? raw.secureDNS.delegationSigned : null,
    events,
    contacts: contacts.filter((c) => c.name || c.org || c.email),
    notices: Array.isArray(raw?.notices)
      ? raw.notices.map((n: Json) => [n?.title, ...(Array.isArray(n?.description) ? n.description : [])].filter(Boolean).join(": ")).slice(0, 6)
      : [],
  };
}

export interface IpRdap {
  query: string;
  handle: string | null;
  name: string | null;
  type: string | null;
  startAddress: string | null;
  endAddress: string | null;
  cidrs: string[];
  ipVersion: string | null;
  country: string | null;
  parentHandle: string | null;
  organization: string | null;
  abuseEmail: string | null;
  registry: string | null;
  status: string[];
  events: RdapEvent[];
  contacts: RdapContact[];
  remarks: string[];
}

export function rirFromUrl(url: string): string | null {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (host.includes("arin")) return "ARIN";
  if (host.includes("ripe")) return "RIPE NCC";
  if (host.includes("apnic")) return "APNIC";
  if (host.includes("lacnic")) return "LACNIC";
  if (host.includes("afrinic")) return "AFRINIC";
  return null;
}

export function normalizeIpRdap(raw: Json, query: string, finalUrl: string): IpRdap {
  const contacts = extractContacts(raw?.entities);
  const org =
    contacts.find((c) => c.roles.includes("registrant"))?.name ??
    contacts.find((c) => c.roles.includes("registrant"))?.org ??
    contacts.find((c) => c.roles.includes("administrative"))?.name ??
    null;
  const cidrs = Array.isArray(raw?.cidr0_cidrs)
    ? raw.cidr0_cidrs
        .map((c: Json) => (c?.v4prefix ? `${c.v4prefix}/${c.length}` : c?.v6prefix ? `${c.v6prefix}/${c.length}` : null))
        .filter(Boolean)
    : [];
  return {
    query,
    handle: typeof raw?.handle === "string" ? raw.handle : null,
    name: typeof raw?.name === "string" ? raw.name : null,
    type: typeof raw?.type === "string" ? raw.type : null,
    startAddress: raw?.startAddress ?? null,
    endAddress: raw?.endAddress ?? null,
    cidrs,
    ipVersion: raw?.ipVersion ?? null,
    country: typeof raw?.country === "string" ? raw.country : null,
    parentHandle: raw?.parentHandle ?? null,
    organization: org,
    abuseEmail: contacts.find((c) => c.roles.includes("abuse"))?.email ?? null,
    registry: rirFromUrl(finalUrl),
    status: Array.isArray(raw?.status) ? raw.status.map(String) : [],
    events: extractEvents(raw?.events),
    contacts: contacts.filter((c) => c.name || c.org || c.email),
    remarks: Array.isArray(raw?.remarks)
      ? raw.remarks
          .map((r: Json) => [r?.title, ...(Array.isArray(r?.description) ? r.description : [])].filter(Boolean).join(": "))
          .slice(0, 6)
      : [],
  };
}

/** Fetches an RDAP path from rdap.org. Returns null on 404. Throws HttpError otherwise. */
export async function fetchRdap(path: string, f: FetchLike | undefined, now?: () => number): Promise<{ data: Json; finalUrl: string } | null> {
  const { response, finalUrl } = await fetchFollowingRedirects(`${RDAP_BASE}${path}`, {
    fetch: f,
    now,
    timeoutMs: 15_000,
    headers: { accept: "application/rdap+json, application/json;q=0.9" },
  });
  if (response.status === 404) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (response.status === 429) throw new HttpError(429, "upstream_rate_limited", "The RDAP registry is rate limiting requests. Try again in a minute.");
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new HttpError(502, "upstream_error", `The RDAP server answered HTTP ${response.status}.`);
  }
  const { bytes, truncated } = await readBodyCapped(response, 1024 * 1024);
  if (truncated) throw new HttpError(502, "upstream_too_large", "The RDAP response was unexpectedly large.");
  try {
    return { data: JSON.parse(decodeText(bytes, "charset=utf-8")), finalUrl };
  } catch {
    throw new HttpError(502, "upstream_invalid", "The RDAP server returned invalid JSON.");
  }
}
