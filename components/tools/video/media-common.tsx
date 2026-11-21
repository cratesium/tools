"use client";

/**
 * Shared building blocks for video and audio tools: file picking with native metadata,
 * a player whose current time can be captured, timecode fields, and an FFmpeg task runner
 * with real progress, cancellation and a collapsible log.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import type { FFmpegSession } from "@/lib/processors/media/ffmpeg";
import { formatTimecode, parseTimecode } from "@/lib/processors/media/timecode";
import { useObjectUrl, useTask, type TaskContext } from "@/lib/utils/hooks";

export const VIDEO_ACCEPT = "video/*,.mkv,.avi,.mov,.flv,.wmv,.m4v,.3gp,.ts,.mts";
export const AUDIO_ACCEPT = "audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.wma,.aiff,.amr";
/** Browser WebAssembly memory is limited (~2 GB); keep inputs reasonable. */
export const MAX_MEDIA_BYTES = 1024 * 1024 * 1024;

export interface NativeMeta {
  duration: number;
  width: number;
  height: number;
}

/** Reads duration/size with a hidden media element (fast, no FFmpeg). */
export function useNativeMeta(url: string | null, kind: "video" | "audio") {
  const [meta, setMeta] = useState<{ url: string; meta: NativeMeta | null } | null>(null);
  useEffect(() => {
    if (!url) return;
    const el = document.createElement(kind);
    el.preload = "metadata";
    el.src = url;
    const done = () => setMeta({ url, meta: Number.isFinite(el.duration) ? { duration: el.duration, width: (el as HTMLVideoElement).videoWidth ?? 0, height: (el as HTMLVideoElement).videoHeight ?? 0 } : null });
    el.addEventListener("loadedmetadata", done);
    el.addEventListener("error", () => setMeta({ url, meta: null }));
    return () => {
      el.removeAttribute("src");
      el.load();
    };
  }, [url, kind]);
  return meta && meta.url === url ? meta.meta : null;
}

export function MediaPicker({ file, onFile, kind, multiple, onFiles, label }: { file: File | null; onFile: (f: File | null) => void; kind: "video" | "audio"; multiple?: boolean; onFiles?: (f: File[]) => void; label?: string }) {
  if (file && !multiple) return <FileList files={[file]} onClear={() => onFile(null)} />;
  return (
    <Dropzone
      accept={kind === "video" ? VIDEO_ACCEPT : AUDIO_ACCEPT}
      multiple={multiple}
      maxSize={MAX_MEDIA_BYTES}
      formatsLabel={label ?? (kind === "video" ? "MP4, MOV, MKV, WebM, AVI and more (up to 1 GB)" : "MP3, WAV, M4A, AAC, FLAC, OGG and more")}
      onFiles={(f) => (multiple ? onFiles?.(f) : onFile(f[0]))}
    />
  );
}

/** Video/audio player; `playerRef` lets tools read currentTime. */
export function Player({ url, kind, playerRef, className }: { url: string | null; kind: "video" | "audio"; playerRef?: RefObject<HTMLMediaElement | null>; className?: string }) {
  if (!url) return null;
  return kind === "video" ? (
    <video ref={playerRef as RefObject<HTMLVideoElement>} src={url} controls playsInline className={className ?? "max-h-[420px] w-full rounded-lg border border-border bg-black"} />
  ) : (
    <audio ref={playerRef as RefObject<HTMLAudioElement>} src={url} controls className={className ?? "w-full"} />
  );
}

/** Timecode input (accepts 90, 1:30, 00:01:30.5, 1m30s) with "use current position". */
export function TimeField({ label, value, onChange, playerRef, hint }: { label: string; value: string; onChange: (v: string) => void; playerRef?: RefObject<HTMLMediaElement | null>; hint?: ReactNode }) {
  const bad = value.trim() !== "" && Number.isNaN(parseTimecode(value));
  return (
    <Field label={label} hint={hint} error={bad ? "Use 90, 1:30 or 00:01:30.5" : null}>
      {(id) => (
        <div className="flex gap-1.5">
          <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" placeholder="00:00:00.000" />
          {playerRef ? (
            <Button size="icon" variant="secondary" aria-label={`Set ${label.toLowerCase()} to the current playback position`} title="Use current playback position" onClick={() => playerRef.current && onChange(formatTimecode(playerRef.current.currentTime))}>
              <Crosshair className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      )}
    </Field>
  );
}

export function seconds(v: string, fallback = 0): number {
  const n = parseTimecode(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Runs FFmpeg jobs with progress, cancel and logs. */
export function useFFmpegTask<T>() {
  const task = useTask<T>();
  const [logs, setLogs] = useState<string[]>([]);
  const buf = useRef<string[]>([]);
  const run = useCallback(
    (job: (s: FFmpegSession, ctx: TaskContext) => Promise<T>) => {
      buf.current = [];
      setLogs([]);
      return task.run(async (ctx) => {
        const { withFFmpeg } = await import("@/lib/processors/media/ffmpeg");
        const flush = setInterval(() => setLogs([...buf.current]), 500);
        try {
          return await withFFmpeg((s) => job(s, ctx), {
            signal: ctx.signal,
            onProgress: (v, l) => ctx.progress(v, l),
            onLog: (line) => {
              buf.current.push(line);
              if (buf.current.length > 3000) buf.current.splice(0, 1000);
            },
          });
        } finally {
          clearInterval(flush);
          setLogs([...buf.current]);
        }
      });
    },
    [task],
  );
  return { ...task, run, logs };
}

export function LogPanel({ logs }: { logs: string[] }) {
  if (!logs.length) return null;
  return (
    <details className="rounded-lg border border-border bg-card">
      <summary className="cursor-pointer px-3 py-2 text-xs text-fg-muted">FFmpeg log ({logs.length} lines)</summary>
      <pre className="max-h-64 overflow-auto border-t border-border p-3 font-mono text-[11px] leading-relaxed text-fg-muted">{logs.slice(-400).join("\n")}</pre>
    </details>
  );
}

export function FFmpegNotice({ extra }: { extra?: ReactNode }) {
  return (
    <Alert tone="info">
      Processing runs in your browser with FFmpeg compiled to WebAssembly, served from this site (~31 MB, loaded on first use and cached). Your files are never uploaded. Browser memory limits apply – files under ~500 MB work best. {extra}
    </Alert>
  );
}

/** Media object URL + native metadata for a single file. */
export function useMedia(file: File | null, kind: "video" | "audio") {
  const url = useObjectUrl(file);
  const meta = useNativeMeta(url, kind);
  return { url, meta };
}

export const baseOf = (name: string) => name.replace(/\.[^.]+$/, "") || "output";
