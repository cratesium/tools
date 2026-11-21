/**
 * FFmpeg argument builders for every video operation. Pure, node-testable.
 * Paths are virtual-FS paths; callers add inputs/outputs to the session.
 * Targets the FFmpeg 5.1 build inside @ffmpeg/core 0.12.x (single-threaded).
 */

import { formatTimecode, type TimeRange } from "@/lib/processors/media/timecode";
import type { ProbeResult } from "@/lib/processors/media/probe";
import { firstAudio, firstVideo } from "@/lib/processors/media/probe";

export type VideoContainer = "mp4" | "webm" | "mov" | "mkv" | "avi";
export type Quality = "high" | "balanced" | "small";
export type X264Preset = "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium";

export const VIDEO_CONTAINERS: Record<VideoContainer, { ext: string; mime: string; label: string }> = {
  mp4: { ext: "mp4", mime: "video/mp4", label: "MP4 (H.264 + AAC)" },
  webm: { ext: "webm", mime: "video/webm", label: "WebM (VP8/VP9 + Opus)" },
  mov: { ext: "mov", mime: "video/quicktime", label: "MOV (H.264 + AAC)" },
  mkv: { ext: "mkv", mime: "video/x-matroska", label: "MKV (H.264 + AAC)" },
  avi: { ext: "avi", mime: "video/x-msvideo", label: "AVI (MPEG-4 Part 2 + MP3)" },
};

export function isVideoContainer(v: unknown): v is VideoContainer {
  return typeof v === "string" && v in VIDEO_CONTAINERS;
}

const X264_CRF: Record<Quality, number> = { high: 20, balanced: 23, small: 28 };
const VPX_CRF: Record<Quality, number> = { high: 8, balanced: 12, small: 24 };
const VP9_CRF: Record<Quality, number> = { high: 28, balanced: 33, small: 40 };
const MPEG4_Q: Record<Quality, number> = { high: 3, balanced: 5, small: 9 };

export interface EncodeOptions {
  quality?: Quality;
  /** Explicit x264 CRF (overrides quality). 0–51. */
  crf?: number;
  preset?: X264Preset;
  /** Video bitrate in kbit/s (overrides CRF; used by target-size compression). */
  videoKbps?: number;
  audioKbps?: number;
  /** WebM only. */
  webmCodec?: "vp8" | "vp9";
  /** Drop the audio track. */
  noAudio?: boolean;
}

/** Codec arguments for re-encoding into `container`. */
export function encodeArgs(container: VideoContainer, o: EncodeOptions = {}): string[] {
  const q = o.quality ?? "balanced";
  const audioK = o.audioKbps ?? 128;
  const a: string[] = [];
  if (container === "webm") {
    if (o.webmCodec === "vp9") {
      a.push("-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1");
      if (o.videoKbps) a.push("-b:v", `${Math.round(o.videoKbps)}k`);
      else a.push("-crf", String(VP9_CRF[q]), "-b:v", "0");
    } else {
      a.push("-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8", "-auto-alt-ref", "0");
      // VP8 needs a bitrate ceiling; CRF then lowers it where possible.
      a.push("-crf", String(VPX_CRF[q]), "-b:v", `${Math.round(o.videoKbps ?? (q === "high" ? 4000 : q === "balanced" ? 2000 : 900))}k`);
    }
    a.push("-pix_fmt", "yuv420p");
    if (o.noAudio) a.push("-an");
    else a.push("-c:a", "libopus", "-b:a", `${audioK}k`);
    return a;
  }
  if (container === "avi") {
    a.push("-c:v", "mpeg4", "-vtag", "xvid");
    if (o.videoKbps) a.push("-b:v", `${Math.round(o.videoKbps)}k`);
    else a.push("-q:v", String(MPEG4_Q[q]));
    if (o.noAudio) a.push("-an");
    else a.push("-c:a", "libmp3lame", "-b:a", `${Math.max(audioK, 128)}k`);
    return a;
  }
  a.push("-c:v", "libx264", "-preset", o.preset ?? "veryfast");
  if (o.videoKbps) {
    const k = Math.round(o.videoKbps);
    a.push("-b:v", `${k}k`, "-maxrate", `${Math.round(k * 1.5)}k`, "-bufsize", `${k * 2}k`);
  } else a.push("-crf", String(clampInt(o.crf ?? X264_CRF[q], 0, 51)));
  a.push("-pix_fmt", "yuv420p");
  if (o.noAudio) a.push("-an");
  else a.push("-c:a", "aac", "-b:a", `${audioK}k`);
  if (container === "mp4" || container === "mov") a.push("-movflags", "+faststart");
  return a;
}

/** H.264/AVC + AAC/MP3 streams can be remuxed into MP4 without re-encoding. */
export function canRemuxToMp4(p: ProbeResult): boolean {
  const v = firstVideo(p);
  const a = firstAudio(p);
  if (!v) return false;
  if (!["h264", "hevc", "mpeg4", "av1"].includes(v.codec)) return false;
  if (a && !["aac", "mp3", "ac3", "eac3", "alac", "opus", "flac"].includes(a.codec)) return false;
  return true;
}

export interface ConvertOptions extends EncodeOptions {
  input: string;
  output: string;
  container: VideoContainer;
  /** Copy streams instead of re-encoding (remux). */
  remux?: boolean;
  /** Target height (keeps aspect). */
  height?: number;
  fps?: number;
}

export function convertArgs(o: ConvertOptions): string[] {
  const args = ["-i", o.input];
  if (o.remux) {
    args.push("-map", "0:v:0", "-map", "0:a?", "-c", "copy");
    if (o.container === "mp4" || o.container === "mov") args.push("-movflags", "+faststart");
    args.push(o.output);
    return args;
  }
  const vf: string[] = [];
  if (o.height) vf.push(`scale=-2:${evenInt(o.height)}`);
  if (o.fps) vf.push(`fps=${o.fps}`);
  if (vf.length) args.push("-vf", vf.join(","));
  args.push("-map", "0:v:0", "-map", "0:a:0?", ...encodeArgs(o.container, o), o.output);
  return args;
}

/** Remux args for MP4 output, choosing the right codec tag. */
export function remuxToMp4Args(input: string, output: string, p: ProbeResult): string[] {
  const v = firstVideo(p);
  const args = ["-i", input, "-map", "0:v:0", "-map", "0:a?", "-c", "copy", "-movflags", "+faststart"];
  if (v?.codec === "hevc") args.push("-tag:v", "hvc1");
  args.push(output);
  return args;
}

/** Video bitrate (kbit/s) needed to hit a target file size. Returns null if impossible. */
export function targetVideoKbps(targetMB: number, durationSec: number, audioKbps: number, overhead = 0.03): number | null {
  if (!(targetMB > 0) || !(durationSec > 0)) return null;
  const totalKbits = targetMB * 8 * 1024 * (1 - overhead); // MB → kbit (1 MB = 1024 KB, 1 KB = 8 kbit)
  const v = totalKbits / durationSec - audioKbps;
  return v >= 50 ? Math.floor(v) : null;
}

export interface CompressOptions {
  input: string;
  output: string;
  container: "mp4" | "webm";
  quality: Quality;
  preset?: X264Preset;
  maxHeight?: number;
  audioKbps: number;
  /** When set, encode to this video bitrate instead of CRF. */
  videoKbps?: number;
  noAudio?: boolean;
}

export function compressArgs(o: CompressOptions): string[] {
  const args = ["-i", o.input];
  if (o.maxHeight) args.push("-vf", `scale=-2:'min(ih,${evenInt(o.maxHeight)})'`);
  args.push("-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1");
  args.push(
    ...encodeArgs(o.container, {
      quality: o.quality,
      crf: o.container === "mp4" && !o.videoKbps ? { high: 24, balanced: 28, small: 32 }[o.quality] : undefined,
      preset: o.preset,
      videoKbps: o.videoKbps,
      audioKbps: o.audioKbps,
      noAudio: o.noAudio,
    }),
    o.output,
  );
  return args;
}

/**
 * Keep [start, end]. `copy` is instant but cuts on the nearest preceding keyframe;
 * re-encoding is frame-accurate.
 */
export function trimArgs(input: string, output: string, range: TimeRange, mode: "copy" | "encode", container: VideoContainer = "mp4"): string[] {
  const dur = Math.max(0.01, range.end - range.start);
  if (mode === "copy") {
    return ["-ss", formatTimecode(range.start), "-i", input, "-t", formatTimecode(dur), "-map", "0:v?", "-map", "0:a?", "-c", "copy", "-avoid_negative_ts", "make_zero", ...(container === "mp4" || container === "mov" ? ["-movflags", "+faststart"] : []), output];
  }
  // Input seeking + re-encode is frame-accurate in FFmpeg ≥ 2.1 and much faster than output seeking.
  return ["-ss", formatTimecode(range.start), "-i", input, "-t", formatTimecode(dur), "-map", "0:v:0?", "-map", "0:a:0?", ...encodeArgs(container), output];
}

/** Removes [cut.start, cut.end] and joins the remaining parts (re-encodes). */
export function cutOutArgs(input: string, output: string, cut: TimeRange, withAudio: boolean, container: VideoContainer = "mp4"): string[] {
  const a = cut.start.toFixed(3);
  const b = cut.end.toFixed(3);
  const args = ["-i", input, "-vf", `select='not(between(t,${a},${b}))',setpts=N/FRAME_RATE/TB`];
  if (withAudio) args.push("-af", `aselect='not(between(t,${a},${b}))',asetpts=N/SR/TB`);
  args.push("-map", "0:v:0", ...(withAudio ? ["-map", "0:a:0"] : []), ...encodeArgs(container, { noAudio: !withAudio }), output);
  return args;
}

/** Crop rectangle, snapped to even numbers (required by yuv420p). */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function normalizeCrop(r: CropRect, srcW: number, srcH: number): CropRect {
  let width = evenInt(Math.min(Math.max(2, r.width), srcW));
  let height = evenInt(Math.min(Math.max(2, r.height), srcH));
  let x = evenInt(Math.min(Math.max(0, r.x), srcW - width));
  let y = evenInt(Math.min(Math.max(0, r.y), srcH - height));
  if (x + width > srcW) width = evenInt(srcW - x);
  if (y + height > srcH) height = evenInt(srcH - y);
  x = Math.max(0, x);
  y = Math.max(0, y);
  return { x, y, width, height };
}

/** Largest centred rectangle with the given aspect ratio. */
export function aspectCrop(srcW: number, srcH: number, aspect: number): CropRect {
  let width = srcW;
  let height = Math.round(srcW / aspect);
  if (height > srcH) {
    height = srcH;
    width = Math.round(srcH * aspect);
  }
  return normalizeCrop({ x: (srcW - width) / 2, y: (srcH - height) / 2, width, height }, srcW, srcH);
}

export function cropArgs(input: string, output: string, r: CropRect, container: VideoContainer = "mp4"): string[] {
  return ["-i", input, "-vf", `crop=${r.width}:${r.height}:${r.x}:${r.y}`, "-map", "0:v:0", "-map", "0:a?", ...encodeArgs(container), output];
}

export interface ResizeOptions {
  width?: number;
  height?: number;
  /** "fit" keeps aspect inside WxH; "pad" letterboxes to exactly WxH; "stretch" ignores aspect. */
  mode: "fit" | "pad" | "stretch";
}

export function scaleFilter(o: ResizeOptions): string {
  const w = o.width ? evenInt(o.width) : undefined;
  const h = o.height ? evenInt(o.height) : undefined;
  if (w && h) {
    if (o.mode === "stretch") return `scale=${w}:${h},setsar=1`;
    if (o.mode === "pad") return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
    return `scale=${w}:${h}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
  }
  if (w) return `scale=${w}:-2`;
  if (h) return `scale=-2:${h}`;
  throw new Error("Enter a width or a height.");
}

export function resizeArgs(input: string, output: string, o: ResizeOptions, container: VideoContainer = "mp4"): string[] {
  return ["-i", input, "-vf", scaleFilter(o), "-map", "0:v:0", "-map", "0:a?", ...encodeArgs(container), output];
}

export type Rotation = "90" | "180" | "270" | "hflip" | "vflip";

export function rotateFilter(r: Rotation): string {
  switch (r) {
    case "90":
      return "transpose=1";
    case "270":
      return "transpose=2";
    case "180":
      return "transpose=1,transpose=1";
    case "hflip":
      return "hflip";
    case "vflip":
      return "vflip";
  }
}

export function rotateArgs(input: string, output: string, r: Rotation, container: VideoContainer = "mp4"): string[] {
  return ["-i", input, "-vf", rotateFilter(r), "-map", "0:v:0", "-map", "0:a?", ...encodeArgs(container), "-metadata:s:v:0", "rotate=0", output];
}

/** Lossless rotation: only sets the display-rotation tag (MP4/MOV). Players honour it; some editors ignore it. */
export function rotateMetadataArgs(input: string, output: string, degrees: 90 | 180 | 270, existing = 0): string[] {
  // FFmpeg's "rotate" tag is clockwise; combine with any existing rotation.
  const total = (((existing + degrees) % 360) + 360) % 360;
  return ["-i", input, "-map", "0", "-c", "copy", "-metadata:s:v:0", `rotate=${total}`, output];
}

/** atempo accepts 0.5–2.0 per instance in FFmpeg 5.1; chain instances for other factors. */
export function atempoChain(factor: number): string {
  if (!(factor > 0)) throw new Error("Speed must be positive.");
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
  parts.push(`atempo=${round(f, 6)}`);
  return parts.join(",");
}

export function speedArgs(input: string, output: string, factor: number, withAudio: boolean, container: VideoContainer = "mp4"): string[] {
  const args = ["-i", input, "-vf", `setpts=${round(1 / factor, 6)}*PTS`];
  if (withAudio) args.push("-af", atempoChain(factor));
  args.push("-map", "0:v:0", ...(withAudio ? ["-map", "0:a:0"] : []), ...encodeArgs(container, { noAudio: !withAudio }), output);
  return args;
}

export function reverseArgs(input: string, output: string, withAudio: boolean, container: VideoContainer = "mp4"): string[] {
  const args = ["-i", input, "-vf", "reverse"];
  if (withAudio) args.push("-af", "areverse");
  args.push("-map", "0:v:0", ...(withAudio ? ["-map", "0:a:0"] : []), ...encodeArgs(container, { noAudio: !withAudio }), output);
  return args;
}

export function muteArgs(input: string, output: string): string[] {
  return ["-i", input, "-map", "0:v", "-map", "0:s?", "-c", "copy", output];
}

export type AudioOut = "mp3" | "m4a" | "wav" | "ogg" | "flac" | "opus" | "copy";

/** Container extension for copying the original audio stream unchanged. */
export function audioCopyExtension(codec: string): string | null {
  const map: Record<string, string> = { aac: "m4a", mp3: "mp3", opus: "opus", vorbis: "ogg", flac: "flac", alac: "m4a", ac3: "ac3", eac3: "eac3", pcm_s16le: "wav", pcm_s24le: "wav" };
  return map[codec] ?? null;
}

export function extractAudioArgs(input: string, output: string, codecArgs: string[]): string[] {
  return ["-i", input, "-vn", "-sn", "-dn", "-map", "0:a:0", ...codecArgs, output];
}

export interface GifOptions {
  fps: number;
  width: number;
  start?: number;
  duration?: number;
  /** 0 = loop forever, -1 = play once. */
  loop: number;
  dither?: "sierra2_4a" | "bayer" | "floyd_steinberg" | "none";
  colors?: number;
}

/** Single-pass palettegen + paletteuse for high-quality GIFs. */
export function videoToGifArgs(input: string, output: string, o: GifOptions): string[] {
  const args: string[] = [];
  if (o.start && o.start > 0) args.push("-ss", formatTimecode(o.start));
  args.push("-i", input);
  if (o.duration && o.duration > 0) args.push("-t", formatTimecode(o.duration));
  const dither = o.dither ?? "sierra2_4a";
  const ditherOpt = dither === "bayer" ? "dither=bayer:bayer_scale=3" : `dither=${dither}`;
  const colors = clampInt(o.colors ?? 256, 2, 256);
  const scale = o.width > 0 ? `scale=${Math.round(o.width)}:-1:flags=lanczos,` : "";
  args.push(
    "-filter_complex",
    `[0:v]fps=${o.fps},${scale}split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=${ditherOpt}:diff_mode=rectangle`,
    "-loop",
    String(o.loop),
    output,
  );
  return args;
}

export function gifToVideoArgs(input: string, output: string, container: "mp4" | "webm", loops = 1): string[] {
  const args: string[] = [];
  if (loops > 1) args.push("-stream_loop", String(loops - 1));
  args.push("-i", input, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-an", ...encodeArgs(container, { noAudio: true, quality: "high" }), output);
  return args;
}

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";

/** overlay= x:y expression for a corner position with a pixel margin. */
export function overlayPosition(pos: Corner, margin: number): string {
  const m = Math.max(0, Math.round(margin));
  switch (pos) {
    case "top-left":
      return `${m}:${m}`;
    case "top-right":
      return `W-w-${m}:${m}`;
    case "bottom-left":
      return `${m}:H-h-${m}`;
    case "bottom-right":
      return `W-w-${m}:H-h-${m}`;
    case "center":
      return "(W-w)/2:(H-h)/2";
  }
}

export function watermarkArgs(input: string, watermark: string, output: string, pos: Corner, margin: number, container: VideoContainer = "mp4"): string[] {
  return ["-i", input, "-i", watermark, "-filter_complex", `[0:v][1:v]overlay=${overlayPosition(pos, margin)}:format=auto,format=yuv420p[v]`, "-map", "[v]", "-map", "0:a?", ...encodeArgs(container), output];
}

export function stripMetadataArgs(input: string, output: string): string[] {
  return ["-i", input, "-map", "0", "-map", "-0:d?", "-map", "-0:t?", "-map_metadata", "-1", "-map_chapters", "-1", "-c", "copy", "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact", output];
}

export function extractSubtitleArgs(input: string, output: string, typeIndex: number, format: "srt" | "vtt" | "ass"): string[] {
  const codec = format === "srt" ? "srt" : format === "vtt" ? "webvtt" : "ass";
  return ["-i", input, "-map", `0:s:${typeIndex}`, "-c:s", codec, output];
}

/** Subtitle codec for soft subtitles in each container. */
export function subtitleCodecFor(container: "mp4" | "mov" | "mkv" | "webm"): string {
  return container === "mkv" ? "srt" : container === "webm" ? "webvtt" : "mov_text";
}

export function addSubtitleArgs(
  input: string,
  subtitle: string,
  output: string,
  container: "mp4" | "mov" | "mkv" | "webm",
  opts: { language?: string; title?: string; makeDefault?: boolean; keepExisting?: boolean; existingSubtitleCount?: number },
): string[] {
  const keep = !!opts.keepExisting && (opts.existingSubtitleCount ?? 0) > 0;
  const idx = keep ? (opts.existingSubtitleCount ?? 0) : 0;
  const args = ["-i", input, "-i", subtitle, "-map", "0:v?", "-map", "0:a?"];
  if (keep) args.push("-map", "0:s?");
  args.push("-map", "1:0", "-c:v", "copy", "-c:a", "copy", "-c:s", subtitleCodecFor(container));
  if (opts.language) args.push(`-metadata:s:s:${idx}`, `language=${opts.language}`);
  if (opts.title) args.push(`-metadata:s:s:${idx}`, `title=${opts.title}`);
  if (opts.makeDefault) args.push(`-disposition:s:${idx}`, "default");
  if (container === "mp4" || container === "mov") args.push("-movflags", "+faststart");
  args.push(output);
  return args;
}

export function fpsArgs(input: string, output: string, fps: number, mode: "drop" | "blend", container: VideoContainer = "mp4"): string[] {
  const vf = mode === "blend" ? `framerate=fps=${fps}` : `fps=${fps}`;
  return ["-i", input, "-vf", vf, "-map", "0:v:0", "-map", "0:a?", ...encodeArgs(container), output];
}

export interface MergeInput {
  path: string;
  hasAudio: boolean;
  duration: number;
}

/**
 * Concatenates clips of any size/codec: each clip is scaled and letterboxed to W×H at a
 * common frame rate, silent audio is generated for clips without sound, then concat.
 */
export function mergeArgs(inputs: MergeInput[], output: string, o: { width: number; height: number; fps: number; container: VideoContainer }): string[] {
  if (inputs.length < 2) throw new Error("Add at least two videos.");
  const w = evenInt(o.width);
  const h = evenInt(o.height);
  const anyAudio = inputs.some((i) => i.hasAudio);
  const args: string[] = [];
  for (const i of inputs) args.push("-i", i.path);
  const parts: string[] = [];
  const concatIn: string[] = [];
  inputs.forEach((inp, k) => {
    parts.push(`[${k}:v:0]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${o.fps},format=yuv420p[v${k}]`);
    if (anyAudio) {
      if (inp.hasAudio) parts.push(`[${k}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${k}]`);
      else parts.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${inp.duration.toFixed(3)},aformat=sample_fmts=fltp:channel_layouts=stereo[a${k}]`);
      concatIn.push(`[v${k}][a${k}]`);
    } else concatIn.push(`[v${k}]`);
  });
  parts.push(`${concatIn.join("")}concat=n=${inputs.length}:v=1:a=${anyAudio ? 1 : 0}${anyAudio ? "[v][a]" : "[v]"}`);
  args.push("-filter_complex", parts.join(";"), "-map", "[v]");
  if (anyAudio) args.push("-map", "[a]");
  args.push(...encodeArgs(o.container, { noAudio: !anyAudio }), output);
  return args;
}

/** concat demuxer list (stream copy; all clips must share codecs and parameters). */
export function concatListFile(paths: string[]): string {
  return paths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n") + "\n";
}

export function concatCopyArgs(listPath: string, output: string): string[] {
  return ["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", output];
}

/** True when every clip has the same video codec, size and audio codec (stream-copy concat is safe). */
export function canConcatCopy(probes: ProbeResult[]): boolean {
  if (probes.length < 2) return false;
  const sig = (p: ProbeResult) => {
    const v = firstVideo(p);
    const a = firstAudio(p);
    return [v?.codec, v?.width, v?.height, v?.pixelFormat, a?.codec, a?.sampleRate, a?.channels].join("|");
  };
  const s0 = sig(probes[0]);
  return probes.every((p) => sig(p) === s0 && !!firstVideo(p));
}

/** Common frame rates offered by the converter. */
export const FRAME_RATES = [12, 15, 23.976, 24, 25, 29.97, 30, 48, 50, 60];

export function evenInt(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r - 1;
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function round(n: number, d: number): number {
  const s = 10 ** d;
  return Math.round(n * s) / s;
}
