"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { ActionBar, ErrorMessage, FileResult, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { Dropzone } from "@/components/upload/dropzone";
import { formatBytes } from "@/lib/utils/format";
import type { ProbeResult } from "@/lib/processors/media/probe";
import { FFmpegNotice, LogPanel, MAX_MEDIA_BYTES, VIDEO_ACCEPT, useFFmpegTask } from "./media-common";

/** Video Merger: joins clips in order. Identical clips are stream-copied; others are normalised and re-encoded. */
export default function VideoMerge(_: ToolComponentProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [size, setSize] = useState("auto");
  const [fps, setFps] = useState(30);
  const [fast, setFast] = useState(true);
  const task = useFFmpegTask<{ blob: Blob; copied: boolean }>();

  const move = (i: number, d: number) =>
    setFiles((f) => {
      const n = [...f];
      const j = i + d;
      if (j < 0 || j >= n.length) return f;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const run = () =>
    task.run(async (s, ctx) => {
      if (files.length < 2) throw new Error("Add at least two videos.");
      const a = await import("@/lib/processors/video/args");
      const { firstVideo, hasAudio } = await import("@/lib/processors/media/probe");
      const paths: string[] = [];
      const probes: ProbeResult[] = [];
      for (let i = 0; i < files.length; i++) {
        ctx.progress(null, `Reading clip ${i + 1} of ${files.length}…`);
        const p = await s.input(files[i], `clip${i}-${files[i].name}`);
        const pr = await s.probe(p);
        if (!firstVideo(pr)) throw new Error(`"${files[i].name}" has no video stream.`);
        paths.push(p);
        probes.push(pr);
      }
      const total = probes.reduce((t, p) => t + (p.duration ?? 0), 0) || undefined;
      if (fast && size === "auto" && a.canConcatCopy(probes)) {
        const list = await s.writeText("list.txt", a.concatListFile(paths));
        const code = await s.exec([...a.concatCopyArgs(list, "out.mp4").slice(0, -1), "-movflags", "+faststart", "out.mp4"], { duration: total, label: "Joining (no re-encoding)…", allowFailure: true });
        if (code === 0) return { blob: await s.readBlob("out.mp4", "video/mp4"), copied: true };
        await s.remove("out.mp4").catch(() => {});
      }
      const v0 = firstVideo(probes[0])!;
      let w = v0.width ?? 1280;
      let h = v0.height ?? 720;
      if (v0.rotation && Math.abs(v0.rotation) % 180 === 90) [w, h] = [h, w];
      if (size !== "auto") [w, h] = size.split("x").map(Number);
      const inputs = paths.map((path, i) => ({ path, hasAudio: hasAudio(probes[i]), duration: probes[i].duration ?? 0 }));
      await s.exec(a.mergeArgs(inputs, "out.mp4", { width: w, height: h, fps, container: "mp4" }), { duration: total, label: "Re-encoding and joining clips…" });
      return { blob: await s.readBlob("out.mp4", "video/mp4"), copied: false };
    });

  return (
    <div className="space-y-4">
      <Dropzone accept={VIDEO_ACCEPT} multiple maxSize={MAX_MEDIA_BYTES} formatsLabel="Add two or more videos (MP4, MOV, MKV, WebM…)" onFiles={(f) => (setFiles((x) => [...x, ...f]), task.reset())} />
      {files.length ? (
        <Panel title={`Clips in order (${files.length})`}>
          <ol className="divide-y divide-border">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 py-2 text-sm">
                <span className="w-6 shrink-0 font-mono text-xs text-fg-subtle">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="font-mono text-xs text-fg-subtle">{formatBytes(f.size)}</span>
                <Button size="icon" variant="ghost" aria-label={`Move ${f.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label={`Move ${f.name} down`} disabled={i === files.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((_, k) => k !== i))}><X className="h-4 w-4" /></Button>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}
      <Panel title="Settings">
        <Settings>
          <Field label="Output size">{(id) => <Select id={id} value={size} onChange={(e) => setSize(e.target.value)}><option value="auto">Same as first clip</option><option value="1920x1080">1920×1080 (landscape)</option><option value="1280x720">1280×720 (landscape)</option><option value="1080x1920">1080×1920 (vertical)</option><option value="1080x1080">1080×1080 (square)</option></Select>}</Field>
          <Field label="Frame rate">{(id) => <Select id={id} value={fps} onChange={(e) => setFps(Number(e.target.value))}>{[24, 25, 30, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}</Select>}</Field>
        </Settings>
        <div className="mt-4"><Checkbox label="Join without re-encoding when clips match" description="Instant and lossless when every clip has the same codec, size and audio format" checked={fast} onChange={setFast} /></div>
      </Panel>
      <ActionBar onRun={run} runLabel="Merge videos" running={task.running} disabled={files.length < 2} onCancel={task.cancel} onReset={() => (setFiles([]), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? (
        <FileResult blob={task.result.blob} filename="merged.mp4" label="Merged video">
          <p className="text-xs text-fg-muted">{task.result.copied ? "Clips were joined without re-encoding." : "Clips were scaled to a common size and re-encoded (letterboxed where aspect ratios differ)."}</p>
        </FileResult>
      ) : null}
      <LogPanel logs={task.logs} />
      <FFmpegNotice extra="All clips are held in memory together, so keep the combined size under ~500 MB." />
    </div>
  );
}
