/**
 * Calendar math on plain dates (no time of day, no time zone). All arithmetic happens
 * in UTC so DST transitions never shift a day.
 */

export interface YMD {
  y: number;
  m: number; // 1–12
  d: number;
}

const DAY = 86400000;

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** Parses yyyy-mm-dd; returns null for invalid dates such as 2025-02-30. */
export function parseDate(s: string): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

export function formatDate(d: YMD): string {
  return `${String(d.y).padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
}

export function toUtc(d: YMD): number {
  const t = new Date(0);
  t.setUTCFullYear(d.y, d.m - 1, d.d);
  t.setUTCHours(0, 0, 0, 0);
  return t.getTime();
}

export function fromUtc(ms: number): YMD {
  const t = new Date(ms);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(d: YMD): number {
  return new Date(toUtc(d)).getUTCDay();
}

export function compare(a: YMD, b: YMD): number {
  return toUtc(a) - toUtc(b);
}

/** Whole days from a to b (negative when b is earlier). */
export function daysBetween(a: YMD, b: YMD): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY);
}

export function addDays(d: YMD, n: number): YMD {
  return fromUtc(toUtc(d) + n * DAY);
}

/** Adds months, clamping to the last day of the target month (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(d: YMD, n: number): YMD {
  const t = d.y * 12 + (d.m - 1) + n;
  const y = Math.floor(t / 12);
  const m = (((t % 12) + 12) % 12) + 1;
  return { y, m, d: Math.min(d.d, daysInMonth(y, m)) };
}

export function addYears(d: YMD, n: number): YMD {
  return addMonths(d, n * 12);
}

/** Calendar difference in years, months and days (a ≤ b is normalised automatically). */
export function calendarDiff(a: YMD, b: YMD): { years: number; months: number; days: number; negative: boolean } {
  let negative = false;
  if (compare(a, b) > 0) {
    [a, b] = [b, a];
    negative = true;
  }
  // Largest whole number of months k with a + k months (clamped) ≤ b, then the remaining days.
  let total = (b.y - a.y) * 12 + (b.m - a.m);
  while (total > 0 && compare(addMonths(a, total), b) > 0) total--;
  const days = daysBetween(addMonths(a, total), b);
  const years = Math.floor(total / 12);
  const months = total % 12;
  return { years, months, days, negative };
}

export interface BusinessDayOptions {
  /** Weekday numbers treated as weekend (default Saturday + Sunday). */
  weekend?: number[];
  /** yyyy-mm-dd holidays to exclude. */
  holidays?: string[];
}

function isWorkday(d: YMD, weekend: Set<number>, holidays: Set<string>): boolean {
  return !weekend.has(weekday(d)) && !holidays.has(formatDate(d));
}

/** Working days between two dates. `inclusive` counts both endpoints; otherwise the end date is excluded. */
export function businessDaysBetween(a: YMD, b: YMD, inclusive = false, opts: BusinessDayOptions = {}): number {
  const weekend = new Set(opts.weekend ?? [0, 6]);
  const holidays = new Set(opts.holidays ?? []);
  let sign = 1;
  if (compare(a, b) > 0) {
    [a, b] = [b, a];
    sign = -1;
  }
  const total = daysBetween(a, b) + (inclusive ? 1 : 0);
  const workPerWeek = 7 - weekend.size;
  const fullWeeks = Math.floor(total / 7);
  let count = fullWeeks * workPerWeek;
  let cur = addDays(a, fullWeeks * 7);
  for (let i = fullWeeks * 7; i < total; i++) {
    if (!weekend.has(weekday(cur))) count++;
    cur = addDays(cur, 1);
  }
  // subtract holidays falling on workdays within range
  for (const h of holidays) {
    const hd = parseDate(h);
    if (!hd || weekend.has(weekday(hd))) continue;
    const off = daysBetween(a, hd);
    if (off >= 0 && off < total) count--;
  }
  return sign * count;
}

/** Adds n working days (n may be negative). Starting day itself is not counted. */
export function addBusinessDays(d: YMD, n: number, opts: BusinessDayOptions = {}): YMD {
  const weekend = new Set(opts.weekend ?? [0, 6]);
  const holidays = new Set(opts.holidays ?? []);
  if (weekend.size >= 7) return d;
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(Math.trunc(n));
  let cur = d;
  while (left > 0) {
    cur = addDays(cur, step);
    if (isWorkday(cur, weekend, holidays)) left--;
  }
  return cur;
}

export interface AgeResult {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  totalWeeks: number;
  totalMonths: number;
  nextBirthday: YMD;
  daysToNextBirthday: number;
  nextAge: number;
  bornOn: string;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function weekdayName(d: YMD): string {
  return WEEKDAYS[weekday(d)];
}

/** Birthday in a given year; 29 February falls on 28 February in non-leap years. */
export function birthdayIn(birth: YMD, year: number): YMD {
  return { y: year, m: birth.m, d: Math.min(birth.d, daysInMonth(year, birth.m)) };
}

export function age(birth: YMD, on: YMD): AgeResult | null {
  if (compare(birth, on) > 0) return null;
  const diff = calendarDiff(birth, on);
  let next = birthdayIn(birth, on.y);
  if (compare(next, on) <= 0) next = birthdayIn(birth, on.y + 1);
  if (compare(next, on) <= 0) next = birthdayIn(birth, on.y + 2);
  const totalDays = daysBetween(birth, on);
  const isToday = birthdayIn(birth, on.y).m === on.m && birthdayIn(birth, on.y).d === on.d;
  return {
    ...diff,
    totalDays,
    totalWeeks: Math.floor(totalDays / 7),
    totalMonths: diff.years * 12 + diff.months,
    nextBirthday: isToday ? on : next,
    daysToNextBirthday: isToday ? 0 : daysBetween(on, next),
    nextAge: isToday ? diff.years : next.y - birth.y,
    bornOn: weekdayName(birth),
  };
}

export function todayLocal(): string {
  const n = new Date();
  return formatDate({ y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() });
}
