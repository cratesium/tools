/**
 * ffprobe-style parsing of the text FFmpeg prints for `ffmpeg -hide_banner -i <file>`.
 * Pure and node-testable; ffmpeg.wasm delivers these lines through its "log" event.
 */

export type StreamKind = "video" | "audio" | "subtitle" | "data" | "attachment";

export interface MediaStream {
  /** Absolute stream index in the input (the N in #0:N). */
  index: number;
  /** Index among streams of the same kind (the N in 0:s:N). */
  typeIndex: number;
  kind: StreamKind;
  codec: string;
  /** Codec description as printed, e.g. "h264 (High) (avc1 / 0x31637661), yuv420p, 1280x720 ...". */
  details: string;
  language?: string;
  width?: number;
  height?: number;
  fps?: number;
  bitrateKbps?: number;
  sampleRate?: number;
  channels?: string;
  pixelFormat?: string;
  /** Display rotation in degrees, from side data. */
  rotation?: number;
  isDefault?: boolean;
  /** Embedded cover art (MP3/M4A attached picture). */
  attachedPic?: boolean;
  metadata: Record<string, string>;
}

export interface ProbeResult {
  /** Container format list as printed, e.g. "mov,mp4,m4a,3gp,3g2,mj2". */
  format?: string;
  /** Seconds; undefined when FFmpeg prints "N/A". */
  duration?: number;
  start?: number;
  bitrateKbps?: number;
  metadata: Record<string, string>;
  streams: MediaStream[];
  chapters: number;
}

const STREAM_RE =
  /^\s*Stream #(\d+):(\d+)(?:\[0x[0-9a-f]+\])?(?:\(([^)]+)\))?:\s*(Video|Audio|Subtitle|Data|Attachment):\s*(.*)$/i;

/** Parses the probe output for input `inputIndex` (default 0). */
export function parseProbeLog(log: string | string[], inputIndex = 0): ProbeResult {
  const lines = Array.isArray(log) ? log.flatMap((l) => l.split(/\r?\n/)) : log.split(/\r?\n/);
  const result: ProbeResult = { metadata: {}, streams: [], chapters: 0 };
  let inInput = false;
  let target: Record<string, string> | null = null;
  let metaIndent = -1;
  let current: MediaStream | null = null;
  const kindCount: Record<string, number> = {};

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;

    const inputMatch = /^\s*Input #(\d+),\s*([^,]+(?:,[^,\s]+)*?),\s*from\s/.exec(line);
    if (inputMatch) {
      inInput = Number(inputMatch[1]) === inputIndex;
      if (inInput) result.format = inputMatch[2];
      target = null;
      current = null;
      continue;
    }
    if (/^\s*Output #\d+/.test(line) || /^\s*Stream mapping:/.test(line)) {
      inInput = false;
      continue;
    }
    if (!inInput) continue;

    if (/^\s*Metadata:\s*$/.test(line)) {
      target = current ? current.metadata : result.chapters > 0 && !current && indent > 4 ? null : result.metadata;
      metaIndent = indent;
      continue;
    }

    const dur = /^\s*Duration:\s*([^,]+),\s*start:\s*(-?[\d.]+)?[^,]*,\s*bitrate:\s*(N\/A|\d+)/.exec(line) ?? /^\s*Duration:\s*([^,]+)/.exec(line);
    if (dur) {
      target = null;
      const d = parseClock(dur[1]);
      if (d != null) result.duration = d;
      if (dur[2]) result.start = Number(dur[2]);
      if (dur[3] && dur[3] !== "N/A") result.bitrateKbps = Number(dur[3]);
      continue;
    }

    if (/^\s*Chapters?:\s*$/.test(line)) {
      target = null;
      current = null;
      continue;
    }
    if (/^\s*Chapter #\d+:\d+/.test(line)) {
      result.chapters++;
      target = null;
      current = null;
      continue;
    }

    const sm = STREAM_RE.exec(line);
    if (sm && Number(sm[1]) === inputIndex) {
      const kind = sm[4].toLowerCase() as StreamKind;
      const typeIndex = kindCount[kind] ?? 0;
      kindCount[kind] = typeIndex + 1;
      current = parseStreamDetails(Number(sm[2]), typeIndex, kind, sm[5], sm[3]);
      result.streams.push(current);
      target = null;
      continue;
    }

    const rot = /rotation of\s*(-?[\d.]+)\s*degrees/i.exec(line);
    if (rot && current) {
      current.rotation = Number(rot[1]);
      continue;
    }

    if (target && indent > metaIndent) {
      const kv = /^\s*([^:]+?)\s*:\s?(.*)$/.exec(line);
      if (kv) {
        const key = kv[1].trim();
        // Continuation lines of multi-line tags are printed as "            : text".
        if (!key) {
          const keys = Object.keys(target);
          if (keys.length) target[keys[keys.length - 1]] += `\n${kv[2]}`;
        } else target[key] = kv[2];
        continue;
      }
    } else if (target && indent <= metaIndent) {
      target = null;
    }
  }
  return result;
}

function parseStreamDetails(index: number, typeIndex: number, kind: StreamKind, details: string, lang?: string): MediaStream {
  const codec = (/^([A-Za-z0-9_\-.]+)/.exec(details)?.[1] ?? "unknown").toLowerCase();
  const s: MediaStream = { index, typeIndex, kind, codec, details: details.trim(), metadata: {} };
  if (lang && lang !== "und") s.language = lang;
  if (/\(default\)/.test(details)) s.isDefault = true;
  if (/\(attached pic\)/.test(details)) s.attachedPic = true;
  const br = /(\d+(?:\.\d+)?) kb\/s/.exec(details);
  if (br) s.bitrateKbps = Number(br[1]);
  if (kind === "video") {
    const res = /(?:^|[\s,])(\d{1,5})x(\d{1,5})(?=[\s,]|$)/.exec(details);
    if (res) {
      s.width = Number(res[1]);
      s.height = Number(res[2]);
    }
    const fps = /([\d.]+)(k?) fps/.exec(details) ?? /([\d.]+)(k?) tbr/.exec(details);
    if (fps) s.fps = Number(fps[1]) * (fps[2] ? 1000 : 1);
    const parts = splitTopLevel(details);
    if (parts[1]) s.pixelFormat = parts[1].replace(/\(.*$/, "").trim();
  } else if (kind === "audio") {
    const hz = /(\d+) Hz/.exec(details);
    if (hz) s.sampleRate = Number(hz[1]);
    const parts = splitTopLevel(details);
    const hzIdx = parts.findIndex((p) => /\d+ Hz/.test(p));
    if (hzIdx >= 0 && parts[hzIdx + 1]) s.channels = parts[hzIdx + 1].trim();
  }
  return s;
}

/** Splits on commas that are not inside parentheses or brackets. */
export function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** "00:01:02.50" → 62.5; "N/A" → null. */
export function parseClock(s: string): number | null {
  const m = /^\s*(-?)(\d+):(\d{2}):(\d{2}(?:\.\d+)?)\s*$/.exec(s);
  if (!m) return null;
  const v = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]);
  return m[1] ? -v : v;
}

/** Extracts the output time (seconds) from an FFmpeg stats line ("... time=00:00:05.12 bitrate=..."). */
export function parseStatsTime(line: string): number | null {
  const m = /time=\s*(-?\d+:\d{2}:\d{2}(?:\.\d+)?)/.exec(line);
  return m ? parseClock(m[1]) : null;
}

export const hasVideo = (p: ProbeResult) => p.streams.some((s) => s.kind === "video" && !s.attachedPic);
export const hasAudio = (p: ProbeResult) => p.streams.some((s) => s.kind === "audio");
export const firstVideo = (p: ProbeResult) => p.streams.find((s) => s.kind === "video" && !s.attachedPic);
export const firstAudio = (p: ProbeResult) => p.streams.find((s) => s.kind === "audio");
export const subtitleStreams = (p: ProbeResult) => p.streams.filter((s) => s.kind === "subtitle");

/** Text-based subtitle codecs that can be converted to SRT/WebVTT. Bitmap ones (PGS, DVD, DVB) cannot. */
export const TEXT_SUBTITLE_CODECS = new Set(["subrip", "srt", "ass", "ssa", "webvtt", "mov_text", "text", "microdvd", "subviewer", "jacosub", "sami", "realtext", "mpl2", "vplayer", "pjs", "stl"]);

export function isTextSubtitle(s: MediaStream): boolean {
  return TEXT_SUBTITLE_CODECS.has(s.codec);
}

/** Display dimensions after applying rotation side data. */
export function displaySize(s: MediaStream): { width: number; height: number } | null {
  if (!s.width || !s.height) return null;
  const r = Math.abs(Math.round(s.rotation ?? 0)) % 180;
  return r === 90 ? { width: s.height, height: s.width } : { width: s.width, height: s.height };
}
