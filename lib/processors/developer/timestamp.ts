/** Unix timestamp ↔ date conversion with IANA time zones via Intl. Pure (no DOM). */

export type TsUnit = "s" | "ms" | "us" | "ns";

export const UNIT_LABEL: Record<TsUnit, string> = { s: "seconds", ms: "milliseconds", us: "microseconds", ns: "nanoseconds" };

/** Guesses the unit from magnitude: up to ~5138 CE in seconds, then ms, µs, ns. */
export function detectUnit(n: number): TsUnit {
  const a = Math.abs(n);
  if (a < 1e11) return "s";
  if (a < 1e14) return "ms";
  if (a < 1e17) return "us";
  return "ns";
}

export class TimestampError extends Error {}

/** Parses a numeric timestamp string. Returns epoch milliseconds (may be fractional). */
export function parseTimestamp(input: string, unit: TsUnit | "auto" = "auto"): { ms: number; unit: TsUnit } {
  const t = input.trim().replace(/[_,\s]/g, "");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(t)) throw new TimestampError("Enter a numeric Unix timestamp, e.g. 1763683200 or 1763683200000.");
  const n = Number(t);
  const u = unit === "auto" ? detectUnit(n) : unit;
  const ms = u === "s" ? n * 1000 : u === "ms" ? n : u === "us" ? n / 1000 : n / 1e6;
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) throw new TimestampError("That timestamp is outside the range JavaScript dates support (±275,760 years).");
  return { ms, unit: u };
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      era: "short",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(ms: number, tz: string): ZonedParts {
  const parts = dtf(tz).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let year = Number(get("year"));
  if (get("era") === "BC" || get("era") === "B") year = 1 - year;
  return {
    year,
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: get("weekday"),
  };
}

/** Offset of `tz` from UTC at instant `ms`, in minutes (e.g. +330 for Asia/Kolkata). */
export function tzOffsetMinutes(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  const asUtc = utcFromParts(p.year, p.month, p.day, p.hour, p.minute, p.second, 0);
  const whole = Math.floor(ms / 1000) * 1000;
  return Math.round((asUtc - whole) / 60000);
}

function utcFromParts(y: number, mo: number, d: number, h: number, mi: number, s: number, msec: number): number {
  const dt = new Date(Date.UTC(2000, mo - 1, d, h, mi, s, msec));
  dt.setUTCFullYear(y);
  return dt.getTime();
}

export function formatOffset(min: number, colon = true): string {
  const sign = min < 0 ? "-" : "+";
  const a = Math.abs(min);
  const hh = String(Math.floor(a / 60)).padStart(2, "0");
  const mm = String(a % 60).padStart(2, "0");
  return `${sign}${hh}${colon ? ":" : ""}${mm}`;
}

/** Converts a wall-clock time in `tz` to epoch ms (handles DST; ambiguous times resolve to the earlier instant). */
export function zonedToEpoch(y: number, mo: number, d: number, h: number, mi: number, s: number, msec: number, tz: string): number {
  const guess = utcFromParts(y, mo, d, h, mi, s, msec);
  const off1 = tzOffsetMinutes(guess, tz);
  let result = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(result, tz);
  if (off2 !== off1) {
    const alt = guess - off2 * 60000;
    // Prefer the candidate whose wall-clock time round-trips; for gaps (spring forward) take the later one.
    const p = zonedParts(alt, tz);
    result = p.hour === h && p.minute === mi ? Math.min(alt, result) : Math.max(alt, result);
  }
  return result;
}

const pad = (n: number, l = 2) => String(Math.abs(n)).padStart(l, "0");
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function yearStr(y: number): string {
  if (y >= 0 && y <= 9999) return pad(y, 4);
  return (y < 0 ? "-" : "+") + pad(y, 6);
}

/** ISO 8601 with the zone's offset, e.g. 2026-11-21T10:30:00.000+05:30 (or Z for UTC). */
export function isoInZone(ms: number, tz: string, withMs = true): string {
  const p = zonedParts(ms, tz);
  const off = tzOffsetMinutes(ms, tz);
  const frac = withMs ? `.${pad(((Math.floor(ms) % 1000) + 1000) % 1000, 3)}` : "";
  const zone = off === 0 && (tz === "UTC" || tz === "Etc/UTC") ? "Z" : formatOffset(off);
  return `${yearStr(p.year)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${frac}${zone}`;
}

/** RFC 2822 / RFC 5322 date, e.g. "Sat, 21 Nov 2026 10:30:00 +0530". */
export function rfc2822(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  const off = tzOffsetMinutes(ms, tz);
  const wd = DAYS[new Date(utcFromParts(p.year, p.month, p.day, 12, 0, 0, 0)).getUTCDay()];
  return `${wd}, ${pad(p.day)} ${MONTHS[p.month - 1]} ${p.year} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)} ${formatOffset(off, false)}`;
}

/** Human relative time, e.g. "in 3 days", "5 minutes ago". */
export function relativeTime(ms: number, now = Date.now(), locale = "en"): string {
  const diff = (ms - now) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ];
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [u, s] of units) {
    if (Math.abs(diff) >= s || u === "second") return rtf.format(Math.round(diff / s), u);
  }
  return "";
}

/** ISO week date (week number and ISO year). */
export function isoWeek(y: number, m: number, d: number): { year: number; week: number } {
  const date = new Date(Date.UTC(2000, m - 1, d));
  date.setUTCFullYear(y);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const isoYear = date.getUTCFullYear();
  const start = new Date(Date.UTC(2000, 0, 1));
  start.setUTCFullYear(isoYear);
  const week = Math.ceil(((date.getTime() - start.getTime()) / 86400000 + 1) / 7);
  return { year: isoYear, week };
}

export function dayOfYear(y: number, m: number, d: number): number {
  const a = utcFromParts(y, m, d, 0, 0, 0, 0);
  const b = utcFromParts(y, 1, 1, 0, 0, 0, 0);
  return Math.round((a - b) / 86400000) + 1;
}

export interface FormatRow {
  label: string;
  value: string;
}

export function dateFormats(ms: number, tz: string, now = Date.now()): FormatRow[] {
  const p = zonedParts(ms, tz);
  const off = tzOffsetMinutes(ms, tz);
  const w = isoWeek(p.year, p.month, p.day);
  const sec = Math.floor(ms / 1000);
  const human = new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "full", timeStyle: "long" }).format(new Date(ms));
  return [
    { label: `Date & time (${tz})`, value: human },
    { label: "ISO 8601 (UTC)", value: new Date(ms).toISOString() },
    { label: `ISO 8601 (${tz})`, value: isoInZone(ms, tz) },
    { label: "RFC 3339", value: isoInZone(ms, tz, false) },
    { label: "RFC 2822", value: rfc2822(ms, tz) },
    { label: "UTC string (HTTP date)", value: new Date(ms).toUTCString() },
    { label: "Relative", value: relativeTime(ms, now) },
    { label: "UTC offset", value: `UTC${formatOffset(off)}` },
    { label: "ISO week", value: `${w.year}-W${pad(w.week)}-${new Date(utcFromParts(p.year, p.month, p.day, 12, 0, 0, 0)).getUTCDay() || 7}` },
    { label: "Day of year", value: String(dayOfYear(p.year, p.month, p.day)) },
    { label: "Unix seconds", value: String(sec) },
    { label: "Unix milliseconds", value: String(Math.floor(ms)) },
    { label: "Unix microseconds", value: (BigInt(Math.floor(ms)) * 1000n).toString() },
    { label: "Unix nanoseconds", value: (BigInt(Math.floor(ms)) * 1000000n).toString() },
  ];
}

/**
 * Parses a date string. Strings with an explicit offset or Z (ISO 8601 / RFC 2822) are
 * absolute; bare "YYYY-MM-DD[ T]HH:MM[:SS[.fff]]" strings are interpreted in `tz`.
 */
export function parseDateInput(input: string, tz: string): number {
  const s = input.trim();
  if (!s) throw new TimestampError("Enter a date.");
  if (/^now$/i.test(s)) return Date.now();
  const bare = /^([+-]?\d{4,6})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?$/.exec(s);
  if (bare) {
    const [, y, mo, d, h = "0", mi = "0", sec = "0", frac = "0"] = bare;
    const M = Number(mo), D = Number(d), H = Number(h), MI = Number(mi), S = Number(sec);
    if (M < 1 || M > 12 || D < 1 || D > 31 || H > 23 || MI > 59 || S > 59) throw new TimestampError("Date or time component out of range.");
    const msec = Math.floor(Number(`0.${frac}`) * 1000);
    const result = zonedToEpoch(Number(y), M, D, H, MI, S, msec, tz);
    const check = zonedParts(result, tz);
    if (check.day !== D || check.month !== M) throw new TimestampError(`${mo}/${d} does not exist in that month.`);
    return result;
  }
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) throw new TimestampError('Unrecognized date. Use ISO 8601 such as "2026-11-21 14:30", "2026-11-21T14:30:00Z" or an RFC 2822 date.');
  return ms;
}

export function epochIn(ms: number, unit: TsUnit): string {
  const whole = Math.floor(ms);
  switch (unit) {
    case "s":
      return String(Math.floor(ms / 1000));
    case "ms":
      return String(whole);
    case "us":
      return (BigInt(whole) * 1000n).toString();
    case "ns":
      return (BigInt(whole) * 1000000n).toString();
  }
}

export const COMMON_TIME_ZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/** All IANA zones the runtime knows, falling back to a common list. */
export function allTimeZones(): string[] {
  try {
    const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    const list = f ? f("timeZone") : [];
    if (list.length) return list.includes("UTC") ? list : ["UTC", ...list];
  } catch {
    /* ignore */
  }
  return COMMON_TIME_ZONES;
}
