"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Segmented, Select, Slider } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Settings } from "@/components/tools/shared";
import { FRAME_RATES, type Rotation } from "@/lib/processors/video/args";
import { baseOf } from "./media-common";
import { VideoShell, useVideoTool } from "./shell";

/** Video Resizer: preset or custom dimensions; fit, pad or stretch. */
export function VideoResize(_: ToolComponentProps) {
  const t = useVideoTool();
  const [w, setW] = useState("1280");
  const [h, setH] = useState("");
  const [mode, setMode] = useState<"fit" | "pad" | "stretch">("fit");
  const presets: [string, string, string][] = [["1080p", "1920", ""], ["720p", "1280", ""], ["480p", "854", ""], ["Vertical 1080×1920", "1080", "1920"], ["Square 1080", "1080", "1080"]];
  const run = () =>
    t.run(async ({ s, input, file }) => {
      const a = await import("@/lib/processors/video/args");
      const args = a.resizeArgs(input, "out.mp4", { width: Number(w) || undefined, height: Number(h) || undefined, mode });
      await s.exec(args, { duration: t.meta?.duration, label: "Resizing…" });
      return { blob: await s.readBlob("out.mp4", "video/mp4"), name: `${baseOf(file.name)}-resized.mp4` };
    });
  return (
    <VideoShell
      tool={t}
      runLabel="Resize video"
      onRun={run}
      canRun={Number(w) > 0 || Number(h) > 0}
      resultLabel="Resized video"
      settings={
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">{presets.map(([l, pw, ph]) => <button key={l} type="button" className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-bg-muted" onClick={() => (setW(pw), setH(ph))}>{l}</button>)}</div>
          <Settings>
            <Field label="Width (px)" hint="Blank = auto">{(id) => <Input id={id} type="number" min={16} value={w} onChange={(e) => setW(e.target.value)} />}</Field>
            <Field label="Height (px)" hint="Blank = auto">{(id) => <Input id={id} type="number" min={16} value={h} onChange={(e) => setH(e.target.value)} />}</Field>
          </Settings>
          {Number(w) > 0 && Number(h) > 0 ? <Segmented label="Fit" value={mode} onChange={setMode} options={[{ value: "fit", label: "Fit inside" }, { value: "pad", label: "Pad (letterbox)" }, { value: "stretch", label: "Stretch" }]} /> : null}
          {t.meta?.width ? <p className="text-xs text-fg-muted">Source {t.meta.width}×{t.meta.height}. Dimensions are rounded to even numbers.</p> : null}
        </div>
      }
    />
  );
}

/** Video Rotator: 90/180/270 or flips (re-encode), or lossless rotation tag. */
export function VideoRotate(_: ToolComponentProps) {
  const t = useVideoTool();
  const [rot, setRot] = useState<Rotation>("90");
  const [lossless, setLossless] = useState(false);
  const canTag = rot === "90" || rot === "180" || rot === "270";
  const run = () =>
    t.run(async ({ s, input, file, probe }) => {
      const a = await import("@/lib/processors/video/args");
      const { firstVideo } = await import("@/lib/processors/media/probe");
      if (lossless && canTag) {
        const ext = /\.mov$/i.test(file.name) ? "mov" : "mp4";
        const existing = firstVideo(probe)?.rotation ?? 0;
        await s.exec(a.rotateMetadataArgs(input, `out.${ext}`, Number(rot) as 90 | 180 | 270, -existing), { duration: probe.duration, label: "Setting rotation flag…" });
        return { blob: await s.readBlob(`out.${ext}`, a.VIDEO_CONTAINERS[ext].mime), name: `${baseOf(file.name)}-rotated.${ext}`, note: "Only the display-rotation flag was changed. Most players honour it; a few editors ignore it." };
      }
      await s.exec(a.rotateArgs(input, "out.mp4", rot), { duration: probe.duration, label: "Rotating…" });
      return { blob: await s.readBlob("out.mp4", "video/mp4"), name: `${baseOf(file.name)}-rotated.mp4` };
    });
  return (
    <VideoShell
      tool={t}
      runLabel="Rotate video"
      onRun={run}
      resultLabel="Rotated video"
      settings={
        <div className="space-y-4">
          <Segmented label="Rotation" value={rot} onChange={setRot} options={[{ value: "90", label: "90° right" }, { value: "270", label: "90° left" }, { value: "180", label: "180°" }, { value: "hflip", label: "Flip horizontal" }, { value: "vflip", label: "Flip vertical" }]} />
          {canTag ? <Checkbox label="Lossless (rotation flag only)" description="Instant, no quality loss: MP4/MOV only, relies on player support" checked={lossless} onChange={setLossless} /> : null}
        </div>
      }
    />
  );
}

/** Video Speed Changer: 0.25×–4× with pitch-preserving audio (atempo). */
export function VideoSpeed(_: ToolComponentProps) {
  const t = useVideoTool();
  const [speed, setSpeed] = useState(2);
  const [keepAudio, setKeepAudio] = useState(true);
  const run = () =>
    t.run(async ({ s, input, file, probe }) => {
      const a = await import("@/lib/processors/video/args");
      const withAudio = keepAudio && probe.streams.some((x) => x.kind === "audio");
      await s.exec(a.speedArgs(input, "out.mp4", speed, withAudio), { duration: probe.duration ? probe.duration / speed : undefined, label: `Changing speed to ${speed}×…` });
      return { blob: await s.readBlob("out.mp4", "video/mp4"), name: `${baseOf(file.name)}-${speed}x.mp4` };
    });
  return (
    <VideoShell
      tool={t}
      runLabel={`Change speed to ${speed}×`}
      onRun={run}
      resultLabel="Video"
      settings={
        <div className="space-y-4">
          <Slider label="Speed" value={speed} min={0.25} max={4} step={0.25} onChange={setSpeed} format={(v) => `${v}×`} />
          <div className="flex flex-wrap gap-2">{[0.25, 0.5, 0.75, 1.25, 1.5, 2, 3, 4].map((v) => <button key={v} type="button" className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-bg-muted" onClick={() => setSpeed(v)}>{v}×</button>)}</div>
          <Checkbox label="Keep audio (pitch preserved)" checked={keepAudio} onChange={setKeepAudio} />
          {t.meta?.duration ? <p className="text-xs text-fg-muted">New length ≈ {(t.meta.duration / speed).toFixed(1)} s (was {t.meta.duration.toFixed(1)} s).</p> : null}
        </div>
      }
    />
  );
}

/** Video Reverse: plays backwards. The reverse filter buffers every frame, so it is limited to short clips. */
export function VideoReverse(_: ToolComponentProps) {
  const t = useVideoTool();
  const [withAudio, setWithAudio] = useState(true);
  const [maxH, setMaxH] = useState(720);
  const tooLong = (t.meta?.duration ?? 0) > 60;
  const run = () =>
    t.run(async ({ s, input, file, probe }) => {
      const a = await import("@/lib/processors/video/args");
      const d = probe.duration ?? t.meta?.duration ?? 0;
      if (d > 60) throw new Error("Reversing needs every frame in memory, so clips are limited to 60 seconds in the browser. Trim the video first.");
      const audio = withAudio && probe.streams.some((x) => x.kind === "audio");
      const args = a.reverseArgs(input, "out.mp4", audio);
      if (maxH) {
        const i = args.indexOf("reverse");
        args[i] = `scale=-2:'min(ih,${maxH})',reverse`;
      }
      await s.exec(args, { duration: d, label: "Reversing…" });
      return { blob: await s.readBlob("out.mp4", "video/mp4"), name: `${baseOf(file.name)}-reversed.mp4` };
    });
  return (
    <VideoShell
      tool={t}
      runLabel="Reverse video"
      onRun={run}
      canRun={!tooLong}
      resultLabel="Reversed video"
      settings={
        <div className="space-y-4">
          <Settings>
            <Field label="Max resolution" hint="Lower uses less memory">{(id) => <Select id={id} value={maxH} onChange={(e) => setMaxH(Number(e.target.value))}><option value={0}>Keep original</option><option value={720}>720p</option><option value={480}>480p</option></Select>}</Field>
          </Settings>
          <Checkbox label="Reverse audio too" checked={withAudio} onChange={setWithAudio} />
          {tooLong ? <Alert tone="warning">This clip is longer than 60 seconds. Reversing needs every decoded frame in memory, so trim it first with the Video Trimmer.</Alert> : null}
        </div>
      }
    />
  );
}

/** Video Mute: removes all audio tracks without re-encoding. */
export function VideoMute(_: ToolComponentProps) {
  const t = useVideoTool();
  const run = () =>
    t.run(async ({ s, input, file, probe }) => {
      const a = await import("@/lib/processors/video/args");
      const ext = (/\.(mp4|mov|mkv|webm)$/i.exec(file.name)?.[1].toLowerCase() ?? "mp4") as "mp4" | "mov" | "mkv" | "webm";
      const out = `out.${ext}`;
      await s.exec(a.muteArgs(input, out), { duration: probe.duration, label: "Removing audio…" });
      const had = probe.streams.some((x) => x.kind === "audio");
      return { blob: await s.readBlob(out, a.VIDEO_CONTAINERS[ext].mime), name: `${baseOf(file.name)}-muted.${ext}`, note: had ? "Audio removed; video copied without re-encoding." : "This video had no audio track; the video was copied unchanged." };
    });
  return <VideoShell tool={t} runLabel="Remove audio" onRun={run} resultLabel="Muted video" />;
}

/** Video Frame Rate Converter: drop/duplicate frames or blend. */
export function VideoFps(_: ToolComponentProps) {
  const t = useVideoTool();
  const [fps, setFps] = useState(30);
  const [mode, setMode] = useState<"drop" | "blend">("drop");
  const run = () =>
    t.run(async ({ s, input, file, probe }) => {
      const a = await import("@/lib/processors/video/args");
      await s.exec(a.fpsArgs(input, "out.mp4", fps, mode), { duration: probe.duration, label: `Converting to ${fps} fps…` });
      return { blob: await s.readBlob("out.mp4", "video/mp4"), name: `${baseOf(file.name)}-${fps}fps.mp4` };
    });
  return (
    <VideoShell
      tool={t}
      runLabel={`Convert to ${fps} fps`}
      onRun={run}
      resultLabel="Video"
      settings={
        <div className="space-y-4">
          <Settings>
            <Field label="Target frame rate">{(id) => <Select id={id} value={fps} onChange={(e) => setFps(Number(e.target.value))}>{FRAME_RATES.map((f) => <option key={f} value={f}>{f} fps</option>)}</Select>}</Field>
          </Settings>
          <Segmented label="Method" value={mode} onChange={setMode} options={[{ value: "drop", label: "Drop/duplicate frames (fast)" }, { value: "blend", label: "Blend frames (smoother)" }]} />
        </div>
      }
    />
  );
}
