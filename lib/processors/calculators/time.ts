/**
 * Duration arithmetic (HH:MM:SS) and time-zone conversion using the platform's IANA
 * database through Intl.DateTimeFormat (DST-correct).
 */

/**
 * Parses a duration: "1:30" (h:mm), "1:30:15", "-0:45", "90" (minutes when bare),
 * "2h 15m 10s", "1d 2:00:00", decimals allowed ("1.5h"). Returns seconds or NaN.
 */
export function parseDuration(input: string, bareUnit: "seconds" | "minutes" | "hours" = "minutes"): number {
  let s = input.trim().toLowerCase();
  if (!s) return NaN;
  let sign = 1;
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) s = s.slice(1).trim();
  let total = 0;
  const dayMatch = /^(\d+(?:\.\d+)?)\s*d(?:ays?)?\s*/.exec(s);
  if (dayMatch && /\d+:\d/.test(s)) {
    total += Number(dayMatch[1]) * 86400;
    s = s.slice(dayMatch[0].length);
  }
  if (/^\d+(?:\.\d+)?(?::\d+(?:\.\d+)?){1,2}$/.test(s)) {
    const parts = s.split(":").map(Number);
    if (parts.slice(1).some((p) => p >= 60)) return NaN;
    if (parts.length === 2) total += parts[0] * 3600 + parts[1] * 60;
    else total += parts[0] * 3600 + parts[1] * 60 + parts[2];
    return sign * total;
  }
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    const n = Number(s);
    return sign * (total + n * (bareUnit === "seconds" ? 1 : bareUnit === "minutes" ? 60 : 3600));
  }
  const re = /(\d+(?:\.\d+)?)\s*(d|days?|h|hrs?|hours?|m|mins?|minutes?|s|secs?|seconds?)\b/g;
  let consumed = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const n = Number(m[1]);
    const u = m[2][0];
    total += n * (u === "d" ? 86400 : u === "h" ? 3600 : u === "m" ? 60 : 1);
    consumed += m[0];
  }
  if (!consumed || s.replace(re, "").replace(/[\s,]+/g, "") !== "") return NaN;
  return sign * total;
}

export interface DurationParts {
  negative: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function splitDuration(totalSeconds: number): DurationParts {
  const negative = totalSeconds < 0;
  let t = Math.round(Math.abs(totalSeconds) * 1000) / 1000;
  const days = Math.floor(t / 86400);
  t -= days * 86400;
  const hours = Math.floor(t / 3600);
  t -= hours * 3600;
  const minutes = Math.floor(t / 60);
  const seconds = Math.round((t - minutes * 60) * 1000) / 1000;
  return { negative, days, hours, minutes, seconds };
}

const p2 = (n: number) => String(n).padStart(2, "0");
const sec = (n: number) => (Number.isInteger(n) ? p2(n) : n.toFixed(3).replace(/0+$/, "").padStart(6, "0"));

/** "HH:MM:SS" with hours allowed above 24 (e.g. 27:05:00). */
export function formatHms(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return "—";
  const p = splitDuration(totalSeconds);
  const h = p.days * 24 + p.hours;
  return `${p.negative ? "-" : ""}${p2(h)}:${p2(p.minutes)}:${sec(p.seconds)}`;
}

/** "1d 03:05:00" style. */
export function formatDhms(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return "—";
  const p = splitDuration(totalSeconds);
  const core = `${p2(p.hours)}:${p2(p.minutes)}:${sec(p.seconds)}`;
  return `${p.negative ? "-" : ""}${p.days ? `${p.days}d ` : ""}${core}`;
}

/** Sums signed duration entries. Returns NaN if any entry is invalid. */
export function sumDurations(entries: { sign: 1 | -1; value: string }[], bareUnit: "seconds" | "minutes" | "hours" = "minutes"): number {
  let total = 0;
  for (const e of entries) {
    if (!e.value.trim()) continue;
    const v = parseDuration(e.value, bareUnit);
    if (!Number.isFinite(v)) return NaN;
    total += e.sign * v;
  }
  return total;
}

/** Parses a clock time "HH:MM" or "HH:MM:SS" (24h) or "h:mm am/pm" into seconds since midnight. */
export function parseClock(s: string): number {
  const m = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?\s*$/i.exec(s);
  if (!m) return NaN;
  let h = Number(m[1]);
  const mi = Number(m[2]);
  const se = m[3] ? Number(m[3]) : 0;
  if (mi > 59 || se > 59) return NaN;
  if (m[4]) {
    if (h < 1 || h > 12) return NaN;
    const pm = m[4].toLowerCase() === "pm";
    h = (h % 12) + (pm ? 12 : 0);
  } else if (h > 23) return NaN;
  return h * 3600 + mi * 60 + se;
}

/** Elapsed time from start to end clock time; wraps past midnight when end < start. */
export function clockDifference(start: number, end: number): number {
  let d = end - start;
  if (d < 0) d += 86400;
  return d;
}

/** Adds a duration to a clock time; returns time of day and day offset. */
export function addToClock(clock: number, duration: number): { time: number; dayOffset: number } {
  const t = clock + duration;
  const dayOffset = Math.floor(t / 86400);
  return { time: t - dayOffset * 86400, dayOffset };
}

// ---------------- Time zones ----------------

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
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

export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function wallTimeIn(utcMs: number, tz: string): WallTime {
  const parts = partsFormatter(tz).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute"), second: get("second") };
}

/** UTC offset of a zone at an instant, in minutes (e.g. +330 for Asia/Kolkata). */
export function offsetMinutes(utcMs: number, tz: string): number {
  const w = wallTimeIn(utcMs, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const truncated = Math.floor(utcMs / 1000) * 1000;
  return Math.round((asUtc - truncated) / 60000);
}

/**
 * Converts a wall-clock time in a zone to a UTC instant. For times skipped by a DST
 * jump forward, the result is shifted forward by the gap (as most systems do); for
 * repeated times during fall-back, the earlier instant is returned.
 */
export function zonedToUtc(w: WallTime, tz: string): { utc: number; adjusted: boolean } {
  const guess = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const o1 = offsetMinutes(guess, tz);
  let utc = guess - o1 * 60000;
  const o2 = offsetMinutes(utc, tz);
  if (o2 !== o1) {
    const alt = guess - o2 * 60000;
    const back = wallTimeIn(alt, tz);
    if (back.hour === w.hour && back.minute === w.minute) utc = alt;
  }
  // Earlier instant for ambiguous (fall-back) times
  const earlier = utc - 3600000;
  const we = wallTimeIn(earlier, tz);
  if (we.year === w.year && we.month === w.month && we.day === w.day && we.hour === w.hour && we.minute === w.minute) utc = earlier;
  const back = wallTimeIn(utc, tz);
  const adjusted = back.hour !== w.hour || back.minute !== w.minute || back.day !== w.day;
  return { utc, adjusted };
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const a = Math.abs(minutes);
  return `UTC${sign}${p2(Math.floor(a / 60))}:${p2(a % 60)}`;
}

export function zoneAbbreviation(utcMs: number, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date(utcMs));
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

export function listTimeZones(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    const list = intl.supportedValuesOf?.("timeZone");
    if (list && list.length) return list.includes("UTC") ? list : ["UTC", ...list];
  } catch {
    /* fall through */
  }
  return ["UTC", "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Sao_Paulo"];
}
