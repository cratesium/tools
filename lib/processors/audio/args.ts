/**
 * FFmpeg argument builders for audio operations. Pure, node-testable.
 */

export type AudioFormat = "mp3" | "wav" | "m4a" | "aac" | "ogg" | "opus" | "flac";

export const AUDIO_FORMATS: Record<AudioFormat, { ext: string; mime: string; label: string; lossless: boolean }> = {
  mp3: { ext: "mp3", mime: "audio/mpeg", label: "MP3", lossless: false },
  wav: { ext: "wav", mime: "audio/wav", label: "WAV (PCM)", lossless: true },
  m4a: { ext: "m4a", mime: "audio/mp4", label: "M4A (AAC)", lossless: false },
  aac: { ext: "aac", mime: "audio/aac", label: "AAC (ADTS)", lossless: false },
  ogg: { ext: "ogg", mime: "audio/ogg", label: "OGG (Vorbis)", lossless: false },
  opus: { ext: "opus", mime: "audio/ogg", label: "Opus", lossless: false },
  flac: { ext: "flac", mime: "audio/flac", label: "FLAC", lossless: true },
};

export function isAudioFormat(v: unknown): v is AudioFormat {
  return typeof v === "string" && v in AUDIO_FORMATS;
}

export const BITRATES = [64, 96, 128, 160, 192, 256, 320];

export interface AudioEncodeOptions {
  /** kbit/s for lossy formats. */
  bitrate?: number;
  /** Use VBR (MP3 -q:a / Vorbis -q:a) instead of CBR. */
  vbr?: boolean;
  sampleRate?: number;
  channels?: 1 | 2;
  /** WAV bit depth. */
  bitDepth?: 16 | 24;
}

/** MP3 LAME VBR quality (0 best … 9) approximating a target bitrate. */
export function lameVbrQuality(kbps: number): number {
  const table: [number, number][] = [
    [245, 0],
    [225, 1],
    [190, 2],
    [175, 3],
    [165, 4],
    [130, 5],
    [115, 6],
    [100, 7],
    [85, 8],
  ];
  for (const [k, q] of table) if (kbps >= k) return q;
  return 9;
}

export function audioCodecArgs(format: AudioFormat, o: AudioEncodeOptions = {}): string[] {
  const br = o.bitrate ?? 192;
  const a: string[] = [];
  switch (format) {
    case "mp3":
      a.push("-c:a", "libmp3lame");
      if (o.vbr) a.push("-q:a", String(lameVbrQuality(br)));
      else a.push("-b:a", `${br}k`);
      break;
    case "wav":
      a.push("-c:a", o.bitDepth === 24 ? "pcm_s24le" : "pcm_s16le");
      break;
    case "m4a":
    case "aac":
      a.push("-c:a", "aac", "-b:a", `${Math.min(br, 320)}k`);
      break;
    case "ogg":
      a.push("-c:a", "libvorbis");
      if (o.vbr) a.push("-q:a", String(Math.max(0, Math.min(10, Math.round((br - 64) / 25)))));
      else a.push("-b:a", `${br}k`);
      break;
    case "opus":
      a.push("-c:a", "libopus", "-b:a", `${Math.min(br, 256)}k`);
      break;
    case "flac":
      a.push("-c:a", "flac", "-compression_level", "5");
      break;
  }
  if (o.sampleRate) a.push("-ar", String(format === "opus" ? 48000 : o.sampleRate));
  if (o.channels) a.push("-ac", String(o.channels));
  if (format === "m4a") a.push("-movflags", "+faststart");
  return a;
}

/** Converts any audio (or the audio of a video) to `format`. Metadata tags are kept. */
export function convertAudioArgs(input: string, output: string, format: AudioFormat, o: AudioEncodeOptions = {}): string[] {
  const mapMeta = format === "wav" || format === "aac" ? [] : ["-map_metadata", "0"];
  // MP3 keeps embedded cover art when the source has one; other targets drop it.
  const map = format === "mp3" ? ["-map", "0:a:0", "-map", "0:v?", "-c:v", "copy", "-id3v2_version", "3"] : ["-map", "0:a:0", "-vn"];
  return ["-i", input, ...map, ...mapMeta, ...audioCodecArgs(format, o), output];
}

/** Version without cover art (safer for files whose "video" stream is not a picture). */
export function convertAudioArgsNoCover(input: string, output: string, format: AudioFormat, o: AudioEncodeOptions = {}): string[] {
  const mapMeta = format === "wav" || format === "aac" ? [] : ["-map_metadata", "0"];
  return ["-i", input, "-map", "0:a:0", "-vn", ...mapMeta, ...audioCodecArgs(format, o), ...(format === "mp3" ? ["-id3v2_version", "3"] : []), output];
}

/** Estimated output size in bytes for a duration at a bitrate. */
export function estimateSize(durationSec: number, kbps: number): number {
  return Math.round((durationSec * kbps * 1000) / 8);
}

export function wavBytesPerSecond(sampleRate: number, channels: number, bitDepth = 16): number {
  return (sampleRate * channels * bitDepth) / 8;
}

/**
 * Speed change. `preservePitch` uses atempo (time-stretch); otherwise the sample rate is
 * reinterpreted (pitch moves with speed, like a tape) and resampled back.
 */
export function audioSpeedFilter(factor: number, preservePitch: boolean, sampleRate = 44100): string {
  if (!(factor >= 0.25 && factor <= 4)) throw new Error("Speed must be between 0.25× and 4×.");
  if (!preservePitch) return `asetrate=${Math.round(sampleRate * factor)},aresample=${sampleRate}`;
  const parts: string[] = [];
  let f = factor;
  while (f > 2) {
    parts.push("atempo=2.0");
    f /= 2;
  }
  while (f < 0.5) {
    parts.push("atempo=0.5");
    f /= 0.5;
  }
  parts.push(`atempo=${Math.round(f * 1e6) / 1e6}`);
  return parts.join(",");
}

export function audioFilterArgs(input: string, output: string, filter: string, format: AudioFormat, o: AudioEncodeOptions = {}): string[] {
  return ["-i", input, "-map", "0:a:0", "-vn", "-af", filter, "-map_metadata", "0", ...audioCodecArgs(format, o), output];
}

/** Tag keys understood by FFmpeg's muxers (mapped to ID3/MP4/Vorbis comment fields). */
export const METADATA_KEYS = ["title", "artist", "album", "album_artist", "date", "track", "genre", "composer", "comment"] as const;
export type MetadataKey = (typeof METADATA_KEYS)[number];

/** Rewrites tags without re-encoding. Empty values remove the tag. */
export function metadataArgs(input: string, output: string, tags: Partial<Record<MetadataKey, string>>, clearOthers: boolean): string[] {
  const args = ["-i", input, "-map", "0", "-c", "copy"];
  if (clearOthers) args.push("-map_metadata", "-1");
  for (const k of METADATA_KEYS) {
    const v = tags[k];
    if (v === undefined) continue;
    args.push("-metadata", `${k}=${v.replace(/\r?\n/g, " ")}`);
  }
  args.push(output);
  return args;
}

export function stripAudioMetadataArgs(input: string, output: string, keepCover = false): string[] {
  return ["-i", input, "-map", "0:a", ...(keepCover ? ["-map", "0:v?"] : []), "-map_metadata", "-1", "-map_chapters", "-1", "-c", "copy", "-fflags", "+bitexact", "-flags:a", "+bitexact", output];
}

/** Lossless trim with stream copy (MP3/AAC frames: accurate to ~26 ms). */
export function audioTrimCopyArgs(input: string, output: string, start: number, end: number): string[] {
  return ["-ss", start.toFixed(3), "-i", input, "-t", Math.max(0.01, end - start).toFixed(3), "-map", "0:a:0", "-c", "copy", output];
}
