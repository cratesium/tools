/**
 * Classifies a decoded QR/barcode payload so scanners can show structured
 * fields (Wi-Fi credentials, contact details, links) instead of raw text.
 */

export type ParsedPayload =
  | { kind: "url"; url: string; safe: boolean }
  | { kind: "wifi"; ssid: string; password: string; encryption: string; hidden: boolean }
  | { kind: "vcard"; fields: [string, string][] }
  | { kind: "mecard"; fields: [string, string][] }
  | { kind: "email"; to: string; subject: string; body: string }
  | { kind: "sms"; number: string; body: string }
  | { kind: "phone"; number: string }
  | { kind: "geo"; latitude: number; longitude: number; altitude?: number; query?: string }
  | { kind: "text"; text: string };

export const payloadKindLabel: Record<ParsedPayload["kind"], string> = {
  url: "Link",
  wifi: "Wi-Fi network",
  vcard: "Contact (vCard)",
  mecard: "Contact (MECARD)",
  email: "Email",
  sms: "SMS",
  phone: "Phone number",
  geo: "Location",
  text: "Text",
};

/** Splits on a separator that is not preceded by a backslash escape. */
export function splitEscaped(input: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === "\\" && i + 1 < input.length) {
      cur += c + input[i + 1];
      i++;
    } else if (c === sep) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function unescapeBackslash(s: string): string {
  return s.replace(/\\(.)/g, "$1");
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Parses WIFI:T:WPA;S:name;P:pass;H:true;; (fields in any order, with escapes). */
export function parseWifi(text: string): ParsedPayload | null {
  if (!/^WIFI:/i.test(text)) return null;
  const body = text.slice(5);
  const r = { ssid: "", password: "", encryption: "nopass", hidden: false };
  for (const part of splitEscaped(body, ";")) {
    const i = part.indexOf(":");
    if (i < 1) continue;
    const key = part.slice(0, i).toUpperCase();
    const val = unescapeBackslash(part.slice(i + 1));
    if (key === "S") r.ssid = val;
    else if (key === "P") r.password = val;
    else if (key === "T") r.encryption = val || "nopass";
    else if (key === "H") r.hidden = val.toLowerCase() === "true";
  }
  return { kind: "wifi", ...r };
}

const VCARD_LABELS: Record<string, string> = {
  FN: "Name",
  N: "Structured name",
  ORG: "Organisation",
  TITLE: "Job title",
  TEL: "Phone",
  EMAIL: "Email",
  URL: "Website",
  ADR: "Address",
  NOTE: "Note",
  BDAY: "Birthday",
};

function unescapeVcard(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\([\\;,])/g, "$1");
}

export function parseVcard(text: string): ParsedPayload | null {
  if (!/^BEGIN:VCARD/i.test(text.trim())) return null;
  // Unfold continuation lines (RFC 2425 §5.8.1).
  const lines = text.replace(/\r\n[ \t]|\n[ \t]/g, "").split(/\r\n|\r|\n/);
  const fields: [string, string][] = [];
  for (const line of lines) {
    const i = line.indexOf(":");
    if (i < 1) continue;
    const prop = line.slice(0, i).split(";")[0].toUpperCase();
    if (prop === "BEGIN" || prop === "END" || prop === "VERSION") continue;
    let value = line.slice(i + 1);
    if (prop === "N" || prop === "ADR") {
      value = splitEscaped(value, ";")
        .map(unescapeVcard)
        .filter(Boolean)
        .join(prop === "N" ? " " : ", ");
      if (prop === "N" && fields.some(([k]) => k === "Name")) continue;
    } else value = unescapeVcard(value);
    if (value) fields.push([VCARD_LABELS[prop] ?? prop, value]);
  }
  return { kind: "vcard", fields };
}

const MECARD_LABELS: Record<string, string> = {
  N: "Name",
  ORG: "Organisation",
  TEL: "Phone",
  EMAIL: "Email",
  URL: "Website",
  ADR: "Address",
  NOTE: "Note",
  BDAY: "Birthday",
  NICKNAME: "Nickname",
};

export function parseMecard(text: string): ParsedPayload | null {
  if (!/^MECARD:/i.test(text)) return null;
  const fields: [string, string][] = [];
  for (const part of splitEscaped(text.slice(7), ";")) {
    const i = part.indexOf(":");
    if (i < 1) continue;
    const key = part.slice(0, i).toUpperCase();
    let val = part.slice(i + 1);
    if (key === "N") val = splitEscaped(val, ",").map(unescapeBackslash).reverse().join(" ");
    else val = unescapeBackslash(val);
    if (val) fields.push([MECARD_LABELS[key] ?? key, val]);
  }
  return { kind: "mecard", fields };
}

export function parseQrPayload(raw: string): ParsedPayload {
  const text = raw.trim();
  if (!text) return { kind: "text", text: raw };
  const wifi = parseWifi(text);
  if (wifi) return wifi;
  const vcard = parseVcard(text);
  if (vcard) return vcard;
  const mecard = parseMecard(text);
  if (mecard) return mecard;

  if (/^mailto:/i.test(text)) {
    const rest = text.slice(7);
    const q = rest.indexOf("?");
    const to = safeDecode(q >= 0 ? rest.slice(0, q) : rest);
    const params = new URLSearchParams(q >= 0 ? rest.slice(q + 1) : "");
    return { kind: "email", to, subject: params.get("subject") ?? "", body: params.get("body") ?? "" };
  }
  // MATMSG:TO:a@b.c;SUB:Hi;BODY:Text;;
  if (/^MATMSG:/i.test(text)) {
    const r = { to: "", subject: "", body: "" };
    for (const part of splitEscaped(text.slice(7), ";")) {
      const i = part.indexOf(":");
      if (i < 1) continue;
      const k = part.slice(0, i).toUpperCase();
      const v = unescapeBackslash(part.slice(i + 1));
      if (k === "TO") r.to = v;
      else if (k === "SUB") r.subject = v;
      else if (k === "BODY") r.body = v;
    }
    return { kind: "email", ...r };
  }
  if (/^SMSTO:/i.test(text)) {
    const rest = text.slice(6);
    const i = rest.indexOf(":");
    return { kind: "sms", number: i >= 0 ? rest.slice(0, i) : rest, body: i >= 0 ? rest.slice(i + 1) : "" };
  }
  if (/^sms:/i.test(text)) {
    const rest = text.slice(4);
    const q = rest.indexOf("?");
    const number = q >= 0 ? rest.slice(0, q) : rest;
    const params = new URLSearchParams(q >= 0 ? rest.slice(q + 1) : "");
    return { kind: "sms", number: safeDecode(number), body: params.get("body") ?? "" };
  }
  if (/^tel:/i.test(text)) return { kind: "phone", number: safeDecode(text.slice(4)) };
  const geo = text.match(/^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(-?\d+(?:\.\d+)?))?(?:;[^?]*)?(?:\?(.*))?$/i);
  if (geo) {
    const lat = Number(geo[1]);
    const lng = Number(geo[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      const q = geo[4] ? new URLSearchParams(geo[4]).get("q") ?? undefined : undefined;
      return { kind: "geo", latitude: lat, longitude: lng, altitude: geo[3] ? Number(geo[3]) : undefined, query: q };
    }
  }
  if (/^https?:\/\/\S+$/i.test(text)) {
    try {
      const u = new URL(text);
      return { kind: "url", url: u.href, safe: true };
    } catch {
      /* fall through to text */
    }
  }
  if (/^www\.[^\s.]+\.\S+$/i.test(text)) return { kind: "url", url: `https://${text}`, safe: true };
  return { kind: "text", text: raw };
}
