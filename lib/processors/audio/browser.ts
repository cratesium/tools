/**
 * Browser-only audio helpers: decoding with Web Audio, offline rendering, and encoding PCM to
 * WAV (built-in) or compressed formats (via FFmpeg.wasm). Import dynamically from handlers.
 */

import { encodeWav } from "./wav";
import { AUDIO_FORMATS, audioCodecArgs, type AudioFormat } from "./args";
import type { Channels } from "./pcm";
import type { SessionOptions } from "@/lib/processors/media/ffmpeg";

/** Above this, decoding to PCM risks exhausting browser memory (≈ 2 GB of Float32 data at 48 kHz stereo). */
export const MAX_DECODE_SECONDS = 3 * 60 * 60;

export interface DecodedAudio {
  channels: Channels;
  sampleRate: number;
  duration: number;
}

function audioCtor(): typeof AudioContext {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const C = w.AudioContext ?? w.webkitAudioContext;
  if (!C) throw new Error("Web Audio is not supported in this browser.");
  return C;
}

/**
 * Decodes a file to PCM. With `sampleRate`, the browser resamples during decoding
 * (decodeAudioData resamples to the context rate).
 */
export async function decodeAudioFile(file: Blob, sampleRate?: number): Promise<DecodedAudio> {
  const buf = await file.arrayBuffer();
  let audio: AudioBuffer;
  try {
    if (sampleRate) {
      const ctx = new OfflineAudioContext(1, 1, sampleRate);
      audio = await ctx.decodeAudioData(buf);
    } else {
      const C = audioCtor();
      const ctx = new C();
      try {
        audio = await ctx.decodeAudioData(buf);
      } finally {
        void ctx.close();
      }
    }
  } catch {
    throw new Error("This browser could not decode the file. Try converting it to MP3 or WAV first with the Audio Converter.");
  }
  if (audio.duration > MAX_DECODE_SECONDS) throw new Error("The audio is too long to process in the browser (limit 3 hours).");
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
  return { channels, sampleRate: audio.sampleRate, duration: audio.duration };
}

/** Mono Float32 at `rate` (default 16 kHz, what Whisper expects), resampled by OfflineAudioContext. */
export async function decodeToMono(file: Blob, rate = 16000): Promise<Float32Array> {
  const d = await decodeAudioFile(file, rate);
  if (d.channels.length === 1) return d.channels[0];
  const len = d.channels[0].length;
  const out = new Float32Array(len);
  for (const c of d.channels) for (let i = 0; i < len; i++) out[i] += c[i];
  for (let i = 0; i < len; i++) out[i] /= d.channels.length;
  return out;
}

export function channelsToAudioBuffer(ctx: BaseAudioContext, channels: Channels, sampleRate: number): AudioBuffer {
  const b = ctx.createBuffer(channels.length, channels[0].length, sampleRate);
  channels.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  return b;
}

/**
 * Renders `channels` through a node graph in an OfflineAudioContext.
 * `build` receives the source node and must return the last node to connect to the destination.
 */
export async function renderOffline(channels: Channels, sampleRate: number, build: (ctx: OfflineAudioContext, src: AudioBufferSourceNode) => AudioNode): Promise<Channels> {
  const ctx = new OfflineAudioContext(channels.length, channels[0].length, sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = channelsToAudioBuffer(ctx, channels, sampleRate);
  build(ctx, src).connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  return Array.from({ length: out.numberOfChannels }, (_, i) => out.getChannelData(i));
}

export type OutputFormat = "wav" | Exclude<AudioFormat, "wav" | "aac">;

export interface EncodeChannelsOptions {
  format: OutputFormat;
  bitrate?: number;
  bitDepth?: 16 | 24;
  session?: SessionOptions;
}

/** Encodes PCM to a Blob. WAV is instant; other formats go through FFmpeg.wasm. */
export async function encodeChannels(channels: Channels, sampleRate: number, o: EncodeChannelsOptions): Promise<Blob> {
  const wav = encodeWav(channels, sampleRate, o.bitDepth ?? 16);
  if (o.format === "wav") return new Blob([wav as BlobPart], { type: "audio/wav" });
  const { withFFmpeg } = await import("@/lib/processors/media/ffmpeg");
  const info = AUDIO_FORMATS[o.format];
  const duration = channels[0].length / sampleRate;
  return withFFmpeg(async (s) => {
    const inp = await s.writeBytes("pcm.wav", wav);
    const out = `out.${info.ext}`;
    await s.exec(["-i", inp, ...audioCodecArgs(o.format, { bitrate: o.bitrate }), out], { duration, label: `Encoding ${info.label}…` });
    return s.readBlob(out, info.mime);
  }, o.session);
}

export const OUTPUT_FORMATS: { value: OutputFormat; label: string }[] = [
  { value: "wav", label: "WAV (lossless, instant)" },
  { value: "mp3", label: "MP3" },
  { value: "m4a", label: "M4A (AAC)" },
  { value: "ogg", label: "OGG (Vorbis)" },
  { value: "flac", label: "FLAC (lossless)" },
];

/** Picks a sensible default output format for an input file name. */
export function defaultOutputFor(name: string): OutputFormat {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (ext === "mp3") return "mp3";
  if (ext === "m4a" || ext === "aac" || ext === "mp4") return "m4a";
  if (ext === "ogg" || ext === "oga") return "ogg";
  if (ext === "flac") return "flac";
  return "wav";
}
