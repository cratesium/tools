/**
 * Pure QR payload builders. Each content type produces the de-facto standard
 * string that phone camera apps recognise (Wi-Fi, vCard 3.0, MECARD, mailto:,
 * SMSTO:/sms:, tel:, geo:). No DOM, no dependencies: fully unit tested.
 */

export type QrContentType = "text" | "url" | "wifi" | "vcard" | "email" | "sms" | "phone" | "geo";

export type WifiEncryption = "WPA" | "WEP" | "nopass";

export interface WifiFields {
  ssid: string;
  password?: string;
  encryption: WifiEncryption;
  hidden?: boolean;
}

export interface ContactFields {
  firstName?: string;
  lastName?: string;
  organization?: string;
  title?: string;
  phone?: string;
  workPhone?: string;
  email?: string;
  website?: string;
  street?: string;
  city?: string;
  region?: string;
  postcode?: string;
  country?: string;
  note?: string;
}

export interface EmailFields {
  to: string;
  subject?: string;
  body?: string;
}

export interface SmsFields {
  number: string;
  message?: string;
  /** "smsto" → SMSTO:number:message (widest scanner support); "sms" → sms:number?body= (RFC 5724). */
  format?: "smsto" | "sms";
}

export interface GeoFields {
  latitude: string | number;
  longitude: string | number;
  altitude?: string | number;
}

export type BuildResult = { ok: true; payload: string } | { ok: false; error: string };

const ok = (payload: string): BuildResult => ({ ok: true, payload });
const fail = (error: string): BuildResult => ({ ok: false, error });

/** Escape \ ; , : " with a backslash, as required by the WIFI: and MECARD formats. */
export function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

/** MECARD escaping (DoCoMo spec): \ ; , : are backslash-escaped. */
export function escapeMecard(value: string): string {
  return value.replace(/([\\;,:])/g, "\\$1").replace(/\r?\n/g, " ");
}

/** vCard 3.0 text escaping (RFC 2426 §5): backslash, semicolon, comma, newline. */
export function escapeVcard(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Keep digits and a single leading +. Spaces, dashes, dots and brackets are dropped. */
export function normalizePhone(raw: string): string {
  const t = raw.trim();
  const plus = t.startsWith("+");
  const digits = t.replace(/[^0-9]/g, "");
  return (plus ? "+" : "") + digits;
}

export function isValidPhone(raw: string): boolean {
  const n = normalizePhone(raw).replace(/^\+/, "");
  return n.length >= 3 && n.length <= 15;
}

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test(raw.trim());
}

/** Adds https:// when no scheme is present and validates the result. */
export function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t || /\s/.test(t)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if ((u.protocol === "http:" || u.protocol === "https:") && !u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return withScheme;
  } catch {
    return null;
  }
}

export function buildText(text: string): BuildResult {
  if (!text) return fail("Enter some text to encode.");
  return ok(text);
}

export function buildUrl(raw: string): BuildResult {
  if (!raw.trim()) return fail("Enter a URL.");
  const u = normalizeUrl(raw);
  return u ? ok(u) : fail("That does not look like a valid URL.");
}

export function buildWifi(f: WifiFields): BuildResult {
  if (!f.ssid) return fail("Enter the network name (SSID).");
  const parts = [`T:${f.encryption}`, `S:${escapeWifi(f.ssid)}`];
  if (f.encryption !== "nopass") {
    const pw = f.password ?? "";
    if (!pw) return fail("Enter the network password, or choose 'No password'.");
    if (f.encryption === "WPA" && (pw.length < 8 || pw.length > 63))
      return fail("WPA/WPA2/WPA3 passwords are 8–63 characters long.");
    parts.push(`P:${escapeWifi(pw)}`);
  }
  if (f.hidden) parts.push("H:true");
  return ok(`WIFI:${parts.join(";")};;`);
}

function hasContactName(f: ContactFields): boolean {
  return Boolean(f.firstName?.trim() || f.lastName?.trim() || f.organization?.trim());
}

/** vCard 3.0 with CRLF line endings (RFC 2426). */
export function buildVcard(f: ContactFields): BuildResult {
  if (!hasContactName(f)) return fail("Enter a name or organisation.");
  if (f.email && !isValidEmail(f.email)) return fail("The email address is not valid.");
  const e = (v?: string) => escapeVcard((v ?? "").trim());
  const first = e(f.firstName);
  const last = e(f.lastName);
  const fn = [f.firstName?.trim(), f.lastName?.trim()].filter(Boolean).join(" ") || (f.organization ?? "").trim();
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${last};${first};;;`, `FN:${escapeVcard(fn)}`];
  if (f.organization?.trim()) lines.push(`ORG:${e(f.organization)}`);
  if (f.title?.trim()) lines.push(`TITLE:${e(f.title)}`);
  if (f.phone?.trim()) lines.push(`TEL;TYPE=CELL:${normalizePhone(f.phone)}`);
  if (f.workPhone?.trim()) lines.push(`TEL;TYPE=WORK:${normalizePhone(f.workPhone)}`);
  if (f.email?.trim()) lines.push(`EMAIL;TYPE=INTERNET:${f.email.trim()}`);
  if (f.website?.trim()) {
    const u = normalizeUrl(f.website);
    if (!u) return fail("The website URL is not valid.");
    lines.push(`URL:${u}`);
  }
  if ([f.street, f.city, f.region, f.postcode, f.country].some((v) => v?.trim()))
    lines.push(`ADR;TYPE=WORK:;;${e(f.street)};${e(f.city)};${e(f.region)};${e(f.postcode)};${e(f.country)}`);
  if (f.note?.trim()) lines.push(`NOTE:${e(f.note)}`);
  lines.push("END:VCARD");
  return ok(lines.join("\r\n"));
}

/** MECARD: shorter than vCard, so it produces a smaller, easier-to-scan code. */
export function buildMecard(f: ContactFields): BuildResult {
  if (!hasContactName(f)) return fail("Enter a name or organisation.");
  if (f.email && !isValidEmail(f.email)) return fail("The email address is not valid.");
  const e = (v?: string) => escapeMecard((v ?? "").trim());
  const name = [e(f.lastName), e(f.firstName)].filter(Boolean).join(",") || e(f.organization);
  const parts = [`N:${name}`];
  if (f.organization?.trim() && (f.firstName?.trim() || f.lastName?.trim())) parts.push(`ORG:${e(f.organization)}`);
  if (f.phone?.trim()) parts.push(`TEL:${normalizePhone(f.phone)}`);
  if (f.workPhone?.trim()) parts.push(`TEL:${normalizePhone(f.workPhone)}`);
  if (f.email?.trim()) parts.push(`EMAIL:${e(f.email)}`);
  if (f.website?.trim()) {
    const u = normalizeUrl(f.website);
    if (!u) return fail("The website URL is not valid.");
    parts.push(`URL:${escapeMecard(u)}`);
  }
  const adr = [f.street, f.city, f.region, f.postcode, f.country].map((v) => (v ?? "").trim()).filter(Boolean);
  if (adr.length) parts.push(`ADR:${escapeMecard(adr.join(", "))}`);
  if (f.note?.trim()) parts.push(`NOTE:${e(f.note)}`);
  return ok(`MECARD:${parts.join(";")};;`);
}

/** RFC 6068 mailto: URI. Subject/body are percent-encoded; newlines become %0D%0A. */
export function buildEmail(f: EmailFields): BuildResult {
  const addrs = f.to
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter(Boolean);
  if (!addrs.length) return fail("Enter a recipient email address.");
  const bad = addrs.find((a) => !isValidEmail(a));
  if (bad) return fail(`"${bad}" is not a valid email address.`);
  const to = addrs.map((a) => encodeURIComponent(a).replace(/%40/g, "@")).join(",");
  const q: string[] = [];
  const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, "\r\n"));
  if (f.subject) q.push(`subject=${enc(f.subject)}`);
  if (f.body) q.push(`body=${enc(f.body)}`);
  return ok(`mailto:${to}${q.length ? `?${q.join("&")}` : ""}`);
}

export function buildSms(f: SmsFields): BuildResult {
  if (!isValidPhone(f.number)) return fail("Enter a valid phone number (3–15 digits, optional leading +).");
  const n = normalizePhone(f.number);
  const msg = f.message ?? "";
  if ((f.format ?? "smsto") === "sms") return ok(`sms:${n}${msg ? `?body=${encodeURIComponent(msg)}` : ""}`);
  return ok(`SMSTO:${n}:${msg}`);
}

export function buildPhone(number: string): BuildResult {
  if (!isValidPhone(number)) return fail("Enter a valid phone number (3–15 digits, optional leading +).");
  return ok(`tel:${normalizePhone(number)}`);
}

function fmtCoord(n: number): string {
  return String(Number(n.toFixed(7)));
}

/** RFC 5870 geo: URI. */
export function buildGeo(f: GeoFields): BuildResult {
  const latS = String(f.latitude).trim();
  const lngS = String(f.longitude).trim();
  if (!latS || !lngS) return fail("Enter both latitude and longitude.");
  const lat = Number(latS);
  const lng = Number(lngS);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return fail("Latitude must be a number between -90 and 90.");
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return fail("Longitude must be a number between -180 and 180.");
  let s = `geo:${fmtCoord(lat)},${fmtCoord(lng)}`;
  const altS = f.altitude == null ? "" : String(f.altitude).trim();
  if (altS) {
    const alt = Number(altS);
    if (!Number.isFinite(alt)) return fail("Altitude must be a number (metres).");
    s += `,${fmtCoord(alt)}`;
  }
  return ok(s);
}

/** Parses "lat, lng" pasted from Google Maps or similar. */
export function parseLatLng(text: string): { lat: number; lng: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
