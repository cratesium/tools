"use client";

/**
 * Video Thumbnail Generator and Video Screenshot Tool. Frames are captured with the
 * browser's own decoder (<video> + canvas): instant and no FFmpeg download, but limited to
 * formats the browser can play (MP4/H.264, WebM, and MOV in Safari).
 */

import { useRef, useState, type RefObject } from "react";
import { Camera } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Segmented, Select, Slider } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, FileResult, FileResults, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { useTask } from "@/lib/utils/hooks";
import { evenTimestamps, formatTimecode } from "@/lib/processors/media/timecode";
import { MediaPicker, Player, baseOf, useMedia } from "./media-common";

type ImgFormat = "png" | "jpeg" | "webp";
const MIME: Record<ImgFormat, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };
const EXT: Record<ImgFormat, string> = { png: "png", jpeg: "jpg", webp: "webp" };

function seek(v: HTMLVideoElement, t: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Cancelled", "AbortError"));
    const done = () => {
      v.removeEventListener("seeked", done);
      v.removeEventListener("error", fail);
      resolve();
    };
    const fail = () => {
      v.removeEventListener("seeked", done);
      reject(new Error("The browser could not decode this video. Convert it to MP4 first with the Video to MP4 tool."));
    };
    v.addEventListener("seeked", done);
    v.addEventListener("error", fail);
    v.currentTime = Math.min(Math.max(0, t), Math.max(0, v.duration - 0.05));
  });
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "auto";
    v.playsInline = true;
    v.src = url;
    v.addEventListener("loadeddata", () => (v.videoWidth ? resolve(v) : reject(new Error("This file has no video the browser can decode."))), { once: true });
    v.addEventListener("error", () => reject(new Error("The browser cannot play this format. Convert it to MP4 first with the Video to MP4 tool.")), { once: true });
  });
}

function drawFrame(v: HTMLVideoElement, width: number): HTMLCanvasElement {
  const w = width > 0 ? Math.min(width, v.videoWidth) : v.videoWidth;
  const h = Math.round((v.videoHeight / v.videoWidth) * w);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(v, 0, 0, w, h);
  return c;
}

function toBlob(c: HTMLCanvasElement, fmt: ImgFormat, q: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not encode the image."))), MIME[fmt], q));
}

const stamp = (t: number) => formatTimecode(t, 2).replace(/:/g, "-");

export function VideoThumbnails(_: ToolComponentProps) {
  const [file, setFile] = useState<File | null>(null);
  const { url, meta } = useMedia(file, "video");
  const [mode, setMode] = useState<"count" | "interval">("count");
  const [count, setCount] = useState(8);
  const [interval, setIntervalSec] = useState("10");
  const [width, setWidth] = useState(640);
  const [format, setFormat] = useState<ImgFormat>("jpeg");
  const [quality, setQuality] = useState(0.88);
  const [sheet, setSheet] = useState(false);
  const [cols, setCols] = useState(4);
  const task = useTask<{ blob: Blob; name: string }[]>();
  const duration = meta?.duration ?? 0;
  const times = mode === "count" ? evenTimestamps(duration, count) : (() => {
    const step = Number(interval);
    if (!(step > 0) || !duration) return [];
    const out: number[] = [];
    for (let t = 0; t < duration && out.length < 500; t += step) out.push(Math.round(t * 1000) / 1000);
    return out;
  })();

  const run = () =>
    task.run(async ({ signal, progress }) => {
      if (!url || !file) throw new Error("Add a video first.");
      if (!times.length) throw new Error("No frames to capture with these settings.");
      if (times.length > 200) throw new Error("Too many frames (maximum 200). Increase the interval.");
      const v = await loadVideo(url);
      const frames: HTMLCanvasElement[] = [];
      for (let i = 0; i < times.length; i++) {
        await seek(v, times[i], signal);
        frames.push(drawFrame(v, sheet ? Math.min(width, 480) : width));
        progress((i + 1) / times.length, `Frame ${i + 1} of ${times.length}`);
      }
      const base = baseOf(file.name);
      if (sheet) {
        const fw = frames[0].width;
        const fh = frames[0].height;
        const gap = 4;
        const rows = Math.ceil(frames.length / cols);
        const c = document.createElement("canvas");
        c.width = cols * fw + (cols + 1) * gap;
        c.height = rows * fh + (rows + 1) * gap;
        const g = c.getContext("2d")!;
        g.fillStyle = "#111";
        g.fillRect(0, 0, c.width, c.height);
        g.font = `${Math.max(12, Math.round(fh / 14))}px system-ui, sans-serif`;
        frames.forEach((f, i) => {
          const x = gap + (i % cols) * (fw + gap);
          const y = gap + Math.floor(i / cols) * (fh + gap);
          g.drawImage(f, x, y);
          const label = formatTimecode(times[i], 0);
          const tw = g.measureText(label).width;
          g.fillStyle = "rgba(0,0,0,0.6)";
          g.fillRect(x + fw - tw - 12, y + fh - 24, tw + 8, 20);
          g.fillStyle = "#fff";
          g.fillText(label, x + fw - tw - 8, y + fh - 9);
        });
        return [{ blob: await toBlob(c, format, quality), name: `${base}-contact-sheet.${EXT[format]}` }];
      }
      const out = [];
      for (let i = 0; i < frames.length; i++) out.push({ blob: await toBlob(frames[i], format, quality), name: `${base}-${String(i + 1).padStart(3, "0")}-${stamp(times[i])}.${EXT[format]}` });
      return out;
    });

  return (
    <div className="space-y-4">
      <MediaPicker file={file} onFile={(f) => (setFile(f), task.reset())} kind="video" label="MP4, WebM or MOV (formats your browser can play)" />
      <Player url={url} kind="video" />
      <Panel title="Settings">
        <div className="space-y-4">
          <Segmented label="Frames" value={mode} onChange={setMode} options={[{ value: "count", label: "Evenly spaced" }, { value: "interval", label: "Every N seconds" }]} />
          <Settings>
            {mode === "count" ? <Field label="Number of thumbnails">{(id) => <Input id={id} type="number" min={1} max={100} value={count} onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />}</Field> : <Field label="Interval (seconds)">{(id) => <Input id={id} type="number" min={0.5} step={0.5} value={interval} onChange={(e) => setIntervalSec(e.target.value)} />}</Field>}
            <Field label="Width">{(id) => <Select id={id} value={width} onChange={(e) => setWidth(Number(e.target.value))}>{[160, 320, 480, 640, 1280, 1920].map((w) => <option key={w} value={w}>{w}px</option>)}<option value={0}>Original</option></Select>}</Field>
            <Field label="Format">{(id) => <Select id={id} value={format} onChange={(e) => setFormat(e.target.value as ImgFormat)}><option value="jpeg">JPG</option><option value="png">PNG</option><option value="webp">WebP</option></Select>}</Field>
          </Settings>
          {format !== "png" ? <Slider label="Quality" value={quality} min={0.5} max={1} step={0.01} onChange={setQuality} format={(v) => `${Math.round(v * 100)}%`} /> : null}
          <Checkbox label="Combine into one contact sheet" checked={sheet} onChange={setSheet} />
          {sheet ? <Slider label="Columns" value={cols} min={2} max={8} onChange={setCols} /> : null}
          {duration ? <p className="text-xs text-fg-muted">{times.length} frame{times.length === 1 ? "" : "s"} from a {formatTimecode(duration, 1)} video.</p> : null}
        </div>
      </Panel>
      <ActionBar onRun={run} runLabel="Generate thumbnails" running={task.running} disabled={!file || !times.length} onCancel={task.cancel} onReset={() => (setFile(null), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result?.length === 1 ? <FileResult blob={task.result[0].blob} filename={task.result[0].name} label="Contact sheet" /> : null}
      {task.result && task.result.length > 1 ? <ThumbGrid files={task.result} zipName={`${file ? baseOf(file.name) : "video"}-thumbnails.zip`} /> : null}
      <Alert tone="info">Frames are captured with your browser&apos;s video decoder: fast, nothing uploaded and no extra download. For MKV, AVI or other formats your browser can&apos;t play, convert to MP4 first.</Alert>
    </div>
  );
}

function ThumbGrid({ files, zipName }: { files: { blob: Blob; name: string }[]; zipName: string }) {
  const [urls] = useState(() => files.map((f) => URL.createObjectURL(f.blob)));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {urls.map((u, i) => <img key={u} src={u} alt={files[i].name} className="w-full rounded border border-border" />)}
      </div>
      <FileResults files={files} zipName={zipName} label="Thumbnails" />
    </div>
  );
}

export function VideoScreenshot(_: ToolComponentProps) {
  const [file, setFile] = useState<File | null>(null);
  const { url } = useMedia(file, "video");
  const player = useRef<HTMLMediaElement | null>(null);
  const [format, setFormat] = useState<ImgFormat>("png");
  const [shots, setShots] = useState<{ blob: Blob; name: string; url: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const capture = async () => {
    const v = player.current as HTMLVideoElement | null;
    if (!v || !file) return;
    setError(null);
    try {
      if (!v.videoWidth) throw new Error("The browser cannot decode this video. Convert it to MP4 first.");
      v.pause();
      const blob = await toBlob(drawFrame(v, 0), format, 0.95);
      const name = `${baseOf(file.name)}-${stamp(v.currentTime)}.${EXT[format]}`;
      setShots((s) => [{ blob, name, url: URL.createObjectURL(blob) }, ...s]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const step = (d: number) => {
    const v = player.current;
    if (v) {
      v.pause();
      v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d));
    }
  };

  return (
    <div className="space-y-4">
      <MediaPicker file={file} onFile={(f) => (setFile(f), setShots([]))} kind="video" label="MP4, WebM or MOV (formats your browser can play)" />
      <Player url={url} kind="video" playerRef={player as RefObject<HTMLMediaElement | null>} />
      {file ? (
        <Panel title="Capture">
          <div className="flex flex-wrap items-end gap-3">
            <Button onClick={capture} icon={<Camera className="h-4 w-4" />} data-testid="run">Capture frame</Button>
            <Button variant="secondary" onClick={() => step(-1 / 30)}>◀ Frame</Button>
            <Button variant="secondary" onClick={() => step(1 / 30)}>Frame ▶</Button>
            <Field label="Format">{(id) => <Select id={id} value={format} onChange={(e) => setFormat(e.target.value as ImgFormat)}><option value="png">PNG (lossless)</option><option value="jpeg">JPG</option><option value="webp">WebP</option></Select>}</Field>
          </div>
          <p className="mt-3 text-xs text-fg-muted">Pause on the moment you want and capture it at the video&apos;s full resolution. Frame steps assume ~30 fps.</p>
        </Panel>
      ) : null}
      <ErrorMessage error={error} />
      {shots.length === 1 ? <FileResult blob={shots[0].blob} filename={shots[0].name} label="Screenshot" /> : null}
      {shots.length > 1 ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {shots.map((s) => <img key={s.url} src={s.url} alt={s.name} className="w-full rounded border border-border" />)}
          </div>
          <FileResults files={shots} zipName={`${file ? baseOf(file.name) : "video"}-screenshots.zip`} label="Screenshots" />
        </>
      ) : null}
    </div>
  );
}
