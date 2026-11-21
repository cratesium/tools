"use client";

/** Shared helpers for audio tools: output-format picking and a waveform with a selection overlay. */

import { useEffect, useRef, useState, type RefObject } from "react";
import { Field, Select } from "@/components/ui/field";
import { AUDIO_FORMATS, BITRATES, type AudioFormat } from "@/lib/processors/audio/args";

/** AudioFormat for a file name, or null if it isn't one we can write. */
export function formatOf(name: string): AudioFormat | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (!ext) return null;
  if (ext === "oga") return "ogg";
  if (ext === "mp4" || ext === "m4b") return "m4a";
  return ext in AUDIO_FORMATS ? (ext as AudioFormat) : null;
}

/** Output format: same as the input when writable, otherwise MP3. */
export const sameOrMp3 = (name: string): AudioFormat => formatOf(name) ?? "mp3";

export function FormatSelect({ value, onChange, label = "Output format", allowSame, sameLabel }: { value: AudioFormat | "same"; onChange: (v: AudioFormat | "same") => void; label?: string; allowSame?: boolean; sameLabel?: string }) {
  return (
    <Field label={label}>
      {(id) => (
        <Select id={id} value={value} onChange={(e) => onChange(e.target.value as AudioFormat | "same")}>
          {allowSame ? <option value="same">{sameLabel ?? "Same as input"}</option> : null}
          {(Object.keys(AUDIO_FORMATS) as AudioFormat[]).map((k) => (
            <option key={k} value={k}>
              {AUDIO_FORMATS[k].label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

export function BitrateSelect({ value, onChange, disabled, label = "Bitrate" }: { value: number; onChange: (v: number) => void; disabled?: boolean; label?: string }) {
  return (
    <Field label={label}>
      {(id) => (
        <Select id={id} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}>
          {BITRATES.map((b) => (
            <option key={b} value={b}>
              {b} kbit/s
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

/** Resolves "same" against the input name. */
export const resolveFormat = (f: AudioFormat | "same", name: string): AudioFormat => (f === "same" ? sameOrMp3(name) : f);

const BUCKETS = 600;

/** Decodes the file in the browser and returns normalised peaks (null while loading or if undecodable). */
function usePeaks(file: File | null) {
  const [state, setState] = useState<{ file: File; peaks: Float32Array | null; duration: number } | null>(null);
  useEffect(() => {
    if (!file) return;
    let alive = true;
    (async () => {
      try {
        const { decodeAudioFile } = await import("@/lib/processors/audio/browser");
        const { waveformPeaks } = await import("@/lib/processors/audio/pcm");
        if (file.size > 300 * 1024 * 1024) throw new Error("too large for a preview");
        const d = await decodeAudioFile(file);
        const p = waveformPeaks(d.channels[0], BUCKETS);
        if (alive) setState({ file, peaks: p, duration: d.duration });
      } catch {
        if (alive) setState({ file, peaks: null, duration: 0 });
      }
    })();
    return () => {
      alive = false;
    };
  }, [file]);
  return state && state.file === file ? state : null;
}

/**
 * Waveform of the file with an optional highlighted selection. Clicking seeks the player.
 * `mode="remove"` shades the selection as the part to delete.
 */
export function Waveform({ file, selection, mode = "keep", playerRef, onPick }: { file: File | null; selection?: { start: number; end: number }; mode?: "keep" | "remove"; playerRef?: RefObject<HTMLMediaElement | null>; onPick?: (t: number) => void }) {
  const data = usePeaks(file);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !data?.peaks) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    const color = getComputedStyle(c).getPropertyValue("--accent").trim() || "#4f46e5";
    g.fillStyle = color;
    const p = data.peaks;
    const bw = w / p.length;
    for (let i = 0; i < p.length; i++) {
      const v = Math.max(0.01, p[i]) * (h / 2 - 2);
      g.fillRect(i * bw, h / 2 - v, Math.max(1, bw - 0.5), v * 2);
    }
  }, [data]);
  if (!file) return null;
  if (!data) return <div className="h-24 animate-pulse rounded-lg border border-border bg-bg-muted" aria-label="Loading waveform" />;
  if (!data.peaks) return null;
  const d = data.duration;
  const sel = selection && d ? { l: Math.max(0, Math.min(1, selection.start / d)), r: Math.max(0, Math.min(1, selection.end / d)) } : null;
  return (
    <div
      className="relative h-24 cursor-pointer overflow-hidden rounded-lg border border-border bg-card"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const t = ((e.clientX - rect.left) / rect.width) * d;
        if (playerRef?.current) playerRef.current.currentTime = t;
        onPick?.(t);
      }}
      title="Click to move the playhead"
    >
      <canvas ref={canvas} className="h-full w-full opacity-80" aria-hidden />
      {sel && sel.r > sel.l ? (
        mode === "keep" ? (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-0 bg-bg/70" style={{ width: `${sel.l * 100}%` }} />
            <div className="pointer-events-none absolute inset-y-0 right-0 bg-bg/70" style={{ width: `${(1 - sel.r) * 100}%` }} />
            <div className="pointer-events-none absolute inset-y-0 border-x-2 border-accent" style={{ left: `${sel.l * 100}%`, width: `${(sel.r - sel.l) * 100}%` }} />
          </>
        ) : (
          <div className="pointer-events-none absolute inset-y-0 border-x-2 border-danger bg-danger/25" style={{ left: `${sel.l * 100}%`, width: `${(sel.r - sel.l) * 100}%` }} />
        )
      ) : null}
    </div>
  );
}
