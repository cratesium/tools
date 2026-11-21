/**
 * Timecode parsing/formatting and time-range math shared by video and audio tools.
 * Pure functions, no DOM.
 */

/**
 * Parses "1:02:03.5", "02:03", "123.4", "1h2m3s", "90s" into seconds.
 * Returns NaN for invalid input.
 */
export function parseTimecode(input: string | number): number {
  if (typeof input === "number") return Number.isFinite(input) && input >= 0 ? input : NaN;
  const s = input.trim().replace(",", ".");
  if (!s) return NaN;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const unit = /^(?:(\d+(?:\.\d+)?)h)?\s*(?:(\d+(?:\.\d+)?)m(?!s))?\s*(?:(\d+(?:\.\d+)?)s)?\s*(?:(\d+)ms)?$/i.exec(s);
  if (unit && (unit[1] || unit[2] || unit[3] || unit[4])) {
    return Number(unit[1] ?? 0) * 3600 + Number(unit[2] ?? 0) * 60 + Number(unit[3] ?? 0) + Number(unit[4] ?? 0) / 1000;
  }
  const parts = s.split(":");
  if (parts.length < 2 || parts.length > 3) return NaN;
  if (!parts.every((p, i) => (i === parts.length - 1 ? /^\d+(\.\d+)?$/.test(p) : /^\d+$/.test(p)))) return NaN;
  const nums = parts.map(Number);
  const [h, m, sec] = nums.length === 3 ? nums : [0, nums[0], nums[1]];
  if (nums.length === 3 && m >= 60) return NaN;
  if (sec >= 60) return NaN;
  return h * 3600 + m * 60 + sec;
}

/** Formats seconds as "HH:MM:SS.mmm" (ffmpeg-compatible). */
export function formatTimecode(seconds: number, fractionDigits = 3): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const scale = 10 ** fractionDigits;
  const total = Math.round(seconds * scale);
  const whole = Math.floor(total / scale);
  const frac = total % scale;
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const base = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return fractionDigits > 0 ? `${base}.${String(frac).padStart(fractionDigits, "0")}` : base;
}

/** Short human display: "1:02:03.4" or "2:03.4". */
export function formatClock(seconds: number, fractionDigits = 1): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const scale = 10 ** fractionDigits;
  const total = Math.round(seconds * scale) / scale;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total - h * 3600 - m * 60;
  const ss = s.toFixed(fractionDigits).padStart(fractionDigits ? 3 + fractionDigits : 2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** SRT timestamp "HH:MM:SS,mmm". */
export function formatSrtTime(seconds: number): string {
  return formatTimecode(seconds, 3).replace(".", ",");
}

export interface TimeRange {
  start: number;
  end: number;
}

/** Validates a range against an optional duration; returns an error message or null. */
export function validateRange(range: TimeRange, duration?: number): string | null {
  const { start, end } = range;
  if (!Number.isFinite(start) || start < 0) return "Start time is not valid.";
  if (!Number.isFinite(end) || end <= 0) return "End time is not valid.";
  if (end <= start) return "End time must be after the start time.";
  if (duration != null && Number.isFinite(duration) && duration > 0) {
    if (start >= duration) return "Start time is beyond the end of the file.";
    if (end > duration + 0.05) return "End time is beyond the end of the file.";
  }
  if (end - start < 0.05) return "The selection is too short.";
  return null;
}

/** Clamps a range into [0, duration]. */
export function clampRange(range: TimeRange, duration: number): TimeRange {
  const start = Math.min(Math.max(0, range.start), duration);
  const end = Math.min(Math.max(start, range.end), duration);
  return { start, end };
}

/** Splits [0,total] into consecutive segments of `segment` seconds (last one may be shorter). */
export function splitByDuration(total: number, segment: number): TimeRange[] {
  if (!(total > 0) || !(segment > 0)) return [];
  const out: TimeRange[] = [];
  for (let t = 0; t < total - 1e-6; t += segment) {
    const end = Math.min(total, t + segment);
    // Fold a tiny trailing remainder (<0.1 s) into the previous segment.
    if (end - t < 0.1 && out.length) out[out.length - 1].end = end;
    else out.push({ start: round3(t), end: round3(end) });
  }
  return out;
}

/** Splits [0,total] into `count` equal parts. */
export function splitByCount(total: number, count: number): TimeRange[] {
  if (!(total > 0) || !(count >= 1)) return [];
  const n = Math.floor(count);
  const len = total / n;
  return Array.from({ length: n }, (_, i) => ({ start: round3(i * len), end: round3(i === n - 1 ? total : (i + 1) * len) }));
}

/** Splits [0,total] at the given points (unsorted, duplicates and out-of-range points ignored). */
export function splitAtPoints(total: number, points: number[]): TimeRange[] {
  if (!(total > 0)) return [];
  const cuts = [...new Set(points.filter((p) => Number.isFinite(p) && p > 0.05 && p < total - 0.05).map(round3))].sort((a, b) => a - b);
  const bounds = [0, ...cuts, total];
  const out: TimeRange[] = [];
  for (let i = 0; i < bounds.length - 1; i++) out.push({ start: bounds[i], end: round3(bounds[i + 1]) });
  return out;
}

/** Parses a comma/space/newline separated list of timecodes. Returns NaN entries for invalid tokens. */
export function parseTimecodeList(input: string): number[] {
  return input
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map(parseTimecode);
}

/** The parts of [0,total] that remain after removing `cut`. */
export function complementRange(total: number, cut: TimeRange): TimeRange[] {
  const out: TimeRange[] = [];
  if (cut.start > 0.01) out.push({ start: 0, end: cut.start });
  if (cut.end < total - 0.01) out.push({ start: cut.end, end: total });
  return out;
}

/** Evenly spaced timestamps for N thumbnails, avoiding the very first/last frame. */
export function evenTimestamps(duration: number, count: number): number[] {
  if (!(duration > 0) || !(count >= 1)) return [];
  const n = Math.floor(count);
  return Array.from({ length: n }, (_, i) => round3(((i + 0.5) / n) * duration));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
