/**
 * Shared FFmpeg.wasm loader and per-job session.
 *
 * - The single-threaded core (@ffmpeg/core, ESM build) is self-hosted under /vendor/ffmpeg/
 *   (copied by scripts/copy-vendor.mjs). Cloudflare Pages limits files to 25 MiB, so the
 *   ~31 MB wasm is served in parts listed in manifest.json and joined here into a blob: URL.
 *   The site does not send COOP/COEP headers, so the multi-threaded core cannot be used.
 * - Only the downloaded core bytes (static, public) are cached at module level, never
 *   user data. Every job gets a fresh FFmpeg instance (its own worker + memory) that is
 *   terminated afterwards, so concurrent tools and tabs never share state.
 * - Input files are mounted with WORKERFS where possible (no copy into wasm memory);
 *   if the mount fails, they are written into MEMFS instead.
 *
 * Browser only. Import this module dynamically from event handlers.
 */

import type { FFmpeg } from "@ffmpeg/ffmpeg";

type FFmpegModule = typeof import("@ffmpeg/ffmpeg");
/** Loads the self-hosted @ffmpeg/ffmpeg ESM build (copied to /vendor/ffmpeg/lib by copy-vendor). Not bundled on purpose. */
function loadFFmpegModule(): Promise<FFmpegModule> {
  const path = "/vendor/ffmpeg/lib/index.js";
  return import(/* turbopackIgnore: true */ /* webpackIgnore: true */ path) as Promise<FFmpegModule>;
}
import { parseProbeLog, parseStatsTime, type ProbeResult } from "./probe";

/** Same-origin location of the self-hosted core (see scripts/copy-vendor.mjs). */
export const FFMPEG_CORE_BASE = "/vendor/ffmpeg";
/** Approximate download size, shown to users. */
export const FFMPEG_CORE_SIZE_LABEL = "~31 MB";

export interface CoreDownloadProgress {
  loaded: number;
  total: number;
}

interface CoreManifest {
  version: string;
  size: number;
  parts: string[];
}

let coreUrls: Promise<{ coreURL: string; wasmURL: string }> | null = null;

/** Downloads the self-hosted core once per page load and returns blob: URLs. Failures are not cached. */
export function loadFFmpegCore(onProgress?: (p: CoreDownloadProgress) => void): Promise<{ coreURL: string; wasmURL: string }> {
  if (!coreUrls) {
    coreUrls = (async () => {
      const res = await fetch(`${FFMPEG_CORE_BASE}/manifest.json`);
      if (!res.ok) throw new Error("The FFmpeg engine files are missing from this site (vendor/ffmpeg).");
      const manifest = (await res.json()) as CoreManifest;
      const js = await fetch(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`);
      if (!js.ok) throw new Error("Could not load the FFmpeg engine.");
      const coreURL = URL.createObjectURL(new Blob([await js.arrayBuffer()], { type: "text/javascript" }));
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      for (const part of manifest.parts) {
        const r = await fetch(`${FFMPEG_CORE_BASE}/${part}`);
        if (!r.ok || !r.body) throw new Error("Could not download the FFmpeg engine. Check your connection and try again.");
        const reader = r.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.byteLength;
          onProgress?.({ loaded, total: manifest.size });
        }
      }
      if (loaded !== manifest.size) throw new Error("The FFmpeg engine download was incomplete. Please retry.");
      const wasmURL = URL.createObjectURL(new Blob(chunks as BlobPart[], { type: "application/wasm" }));
      return { coreURL, wasmURL };
    })();
    coreUrls.catch(() => {
      coreUrls = null;
    });
  } else if (onProgress) {
    // Already downloading or downloaded: report completion once it resolves.
    coreUrls.then(() => onProgress({ loaded: 1, total: 1 })).catch(() => {});
  }
  return coreUrls;
}

export class CancelledError extends Error {
  constructor() {
    super("Cancelled.");
    this.name = "AbortError";
  }
}

export class FFmpegExitError extends Error {
  constructor(
    public code: number,
    public tail: string,
  ) {
    super(friendlyFFmpegError(tail) ?? `FFmpeg failed (exit code ${code}). Open the log for details.`);
    this.name = "FFmpegExitError";
  }
}

/** Maps common FFmpeg error output to a readable message. */
export function friendlyFFmpegError(log: string): string | null {
  if (/Invalid data found when processing input|moov atom not found|could not find codec parameters/i.test(log))
    return "This file could not be read. It may be damaged or use a format FFmpeg.wasm cannot decode.";
  if (/Cannot allocate memory|out of memory|memory access out of bounds|OOM/i.test(log))
    return "The browser ran out of memory. Try a shorter or smaller file, or a lower output resolution.";
  if (/Unknown encoder|Encoder not found/i.test(log)) return "This output codec is not available in FFmpeg.wasm.";
  if (/Stream map .* matches no streams|Output file #0 does not contain any stream|does not contain any stream/i.test(log))
    return "The file does not contain the stream this operation needs (for example, no audio or no subtitle track).";
  if (/height not divisible by 2|width not divisible by 2/i.test(log)) return "The output size must be an even number of pixels.";
  if (/Could not write header|Invalid argument/i.test(log)) return "The chosen output format does not support the streams in this file. Try another format or re-encoding.";
  return null;
}

export interface SessionOptions {
  signal?: AbortSignal;
  onLog?: (line: string) => void;
  /** Overall progress 0–1 (or null when unknown) plus a label. */
  onProgress?: (value: number | null, label?: string) => void;
}

export interface ExecOptions {
  /** Expected output duration in seconds; enables accurate progress from FFmpeg's time= stats. */
  duration?: number;
  /** Fraction of the session progress bar this exec covers: [from, to]. Default [0, 1]. */
  span?: [number, number];
  label?: string;
  /** Do not throw on non-zero exit (used for probing). */
  allowFailure?: boolean;
}

export interface FFmpegSession {
  ffmpeg: FFmpeg;
  /** Makes a File/Blob available to FFmpeg; returns the path to use with -i. */
  input(file: Blob, name: string): Promise<string>;
  writeText(name: string, text: string): Promise<string>;
  writeBytes(name: string, data: Uint8Array): Promise<string>;
  probe(path: string): Promise<ProbeResult>;
  exec(args: string[], opts?: ExecOptions): Promise<number>;
  read(path: string): Promise<Uint8Array>;
  readBlob(path: string, type: string): Promise<Blob>;
  exists(path: string): Promise<boolean>;
  list(dir?: string): Promise<string[]>;
  remove(path: string): Promise<void>;
  /** All log lines collected during this session. */
  logs: string[];
}

/** Sanitises a filename for the virtual file system. */
export function vfsName(name: string, fallback = "input"): string {
  const ext = /\.([a-z0-9]{1,6})$/i.exec(name)?.[1]?.toLowerCase();
  const base = name.replace(/\.[^.]*$/, "").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 40) || fallback;
  return ext ? `${base}.${ext}` : base;
}

/**
 * Runs `job` with a fresh FFmpeg instance and always terminates it afterwards
 * (on success, error or cancel). Cancelling via `signal` terminates the worker immediately.
 */
export async function withFFmpeg<T>(job: (s: FFmpegSession) => Promise<T>, opts: SessionOptions = {}): Promise<T> {
  const { signal, onLog, onProgress } = opts;
  if (signal?.aborted) throw new CancelledError();

  onProgress?.(0, "Loading FFmpeg engine (first use only)…");
  const urls = await loadFFmpegCore((p) => onProgress?.(p.total ? Math.min(1, p.loaded / p.total) : null, "Loading FFmpeg engine (first use only)…"));
  if (signal?.aborted) throw new CancelledError();

  const { FFmpeg } = await loadFFmpegModule();
  const ffmpeg = new FFmpeg();
  const logs: string[] = [];
  let currentExec: { duration?: number; span: [number, number]; label?: string } | null = null;
  let terminated = false;

  const terminate = () => {
    if (terminated) return;
    terminated = true;
    try {
      ffmpeg.terminate();
    } catch {
      /* already gone */
    }
  };
  const onAbort = () => terminate();
  signal?.addEventListener("abort", onAbort, { once: true });

  ffmpeg.on("log", ({ message }) => {
    logs.push(message);
    if (logs.length > 5000) logs.splice(0, logs.length - 4000);
    onLog?.(message);
    if (currentExec?.duration && currentExec.duration > 0) {
      const t = parseStatsTime(message);
      if (t != null && t >= 0) {
        const f = Math.min(1, t / currentExec.duration);
        const [a, b] = currentExec.span;
        onProgress?.(a + (b - a) * f, currentExec.label);
      }
    }
  });
  ffmpeg.on("progress", ({ progress }) => {
    // FFmpeg.wasm's own estimate; only used when we do not know the output duration.
    if (!currentExec || currentExec.duration) return;
    if (progress >= 0 && progress <= 1) {
      const [a, b] = currentExec.span;
      onProgress?.(a + (b - a) * progress, currentExec.label);
    }
  });

  const mounted: string[] = [];
  let mountCount = 0;

  const guard = <R>(p: Promise<R>): Promise<R> =>
    p.catch((e) => {
      if (signal?.aborted || terminated) throw new CancelledError();
      throw e;
    });

  try {
    onProgress?.(null, "Starting FFmpeg…");
    await guard(ffmpeg.load({ coreURL: urls.coreURL, wasmURL: urls.wasmURL }));

    const session: FFmpegSession = {
      ffmpeg,
      logs,
      async input(file, name) {
        const safe = vfsName(name);
        const dir = `/in${mountCount++}`;
        try {
          const { FFFSType } = await loadFFmpegModule();
          await ffmpeg.createDir(dir);
          await ffmpeg.mount(FFFSType.WORKERFS, { blobs: [{ name: safe, data: file }] }, dir);
          mounted.push(dir);
          return `${dir}/${safe}`;
        } catch {
          if (signal?.aborted) throw new CancelledError();
          const data = new Uint8Array(await file.arrayBuffer());
          const path = `${dir.slice(1)}_${safe}`;
          await guard(ffmpeg.writeFile(path, data));
          return path;
        }
      },
      async writeText(name, text) {
        await guard(ffmpeg.writeFile(name, new TextEncoder().encode(text)));
        return name;
      },
      async writeBytes(name, data) {
        await guard(ffmpeg.writeFile(name, data));
        return name;
      },
      async probe(path) {
        const start = logs.length;
        await session.exec(["-hide_banner", "-i", path], { allowFailure: true, label: "Reading file…" });
        return parseProbeLog(logs.slice(start));
      },
      async exec(args, o = {}) {
        if (signal?.aborted) throw new CancelledError();
        currentExec = { duration: o.duration, span: o.span ?? [0, 1], label: o.label };
        onProgress?.(currentExec.span[0], o.label);
        const start = logs.length;
        const code = await guard(ffmpeg.exec(args));
        currentExec = null;
        if (signal?.aborted) throw new CancelledError();
        if (code !== 0 && !o.allowFailure) throw new FFmpegExitError(code, logs.slice(start).slice(-40).join("\n"));
        if (o.span) onProgress?.(o.span[1], o.label);
        return code;
      },
      async read(path) {
        const data = await guard(ffmpeg.readFile(path));
        if (typeof data === "string") return new TextEncoder().encode(data);
        return data;
      },
      async readBlob(path, type) {
        const data = await session.read(path);
        if (!data.length) throw new Error("FFmpeg produced an empty file. Open the log for details.");
        return new Blob([data as BlobPart], { type });
      },
      async exists(path) {
        const slash = path.lastIndexOf("/");
        const dir = slash > 0 ? path.slice(0, slash) : ".";
        const base = path.slice(slash + 1);
        const nodes = await guard(ffmpeg.listDir(dir));
        return nodes.some((n) => n.name === base);
      },
      async list(dir = ".") {
        const nodes = await guard(ffmpeg.listDir(dir));
        return nodes.filter((n) => !n.isDir).map((n) => n.name);
      },
      async remove(path) {
        try {
          await ffmpeg.deleteFile(path);
        } catch {
          /* ignore */
        }
      },
    };
    return await job(session);
  } catch (e) {
    if (signal?.aborted) throw new CancelledError();
    throw e;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (!terminated) {
      // Free the virtual FS explicitly before tearing down the worker.
      for (const dir of mounted) {
        try {
          await ffmpeg.unmount(dir);
        } catch {
          /* ignore */
        }
      }
    }
    terminate();
  }
}

/** Probes a single file (reads headers only; fast). */
export async function probeFile(file: Blob, name: string, opts: SessionOptions = {}): Promise<ProbeResult> {
  return withFFmpeg(async (s) => s.probe(await s.input(file, name)), opts);
}
