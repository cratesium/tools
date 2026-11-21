"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, FileResult, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { VIDEO_CONTAINERS, type Quality, type VideoContainer } from "@/lib/processors/video/args";
import { FFmpegNotice, LogPanel, MediaPicker, Player, baseOf, useFFmpegTask, useMedia } from "./media-common";

/**
 * Video Converter (choose container) and fixed converters via processorOptions { to, from? }:
 * Video to MP4, MP4 to WebM, WebM to MP4, MOV/AVI/MKV to MP4. Remuxes without re-encoding when possible.
 */
export default function VideoConvert({ tool }: ToolComponentProps) {
  const fixed = tool.processorOptions?.to as VideoContainer | undefined;
  const [file, setFile] = useState<File | null>(null);
  const { url } = useMedia(file, "video");
  const [to, setTo] = useState<VideoContainer>(fixed ?? "mp4");
  const [quality, setQuality] = useState<Quality>("balanced");
  const [height, setHeight] = useState(0);
  const [fast, setFast] = useState(true);
  const [webm, setWebm] = useState<"vp8" | "vp9">("vp8");
  const task = useFFmpegTask<{ blob: Blob; remuxed: boolean }>();
  const target = fixed ?? to;

  const run = () =>
    task.run(async (s, ctx) => {
      if (!file) throw new Error("Add a video first.");
      const a = await import("@/lib/processors/video/args");
      const input = await s.input(file, file.name);
      const p = await s.probe(input);
      if (!p.streams.some((x) => x.kind === "video")) throw new Error("No video stream found in this file.");
      const out = `out.${a.VIDEO_CONTAINERS[target].ext}`;
      const remux = fast && !height && (target === "mp4" || target === "mov" || target === "mkv") && a.canRemuxToMp4(p);
      if (remux) await s.exec(target === "mp4" ? a.remuxToMp4Args(input, out, p) : a.convertArgs({ input, output: out, container: target, remux: true }), { duration: p.duration, label: "Copying streams (no re-encoding)…" });
      else await s.exec(a.convertArgs({ input, output: out, container: target, quality, height: height || undefined, webmCodec: webm }), { duration: p.duration, label: `Encoding ${target.toUpperCase()}…` });
      ctx.progress(1, "Finishing…");
      return { blob: await s.readBlob(out, a.VIDEO_CONTAINERS[target].mime), remuxed: remux };
    });

  return (
    <div className="space-y-4">
      <MediaPicker file={file} onFile={(f) => (setFile(f), task.reset())} kind="video" />
      <Player url={url} kind="video" />
      <Panel title="Output">
        <Settings>
          {!fixed ? (
            <Field label="Convert to">{(id) => <Select id={id} value={to} onChange={(e) => setTo(e.target.value as VideoContainer)}>{(Object.keys(VIDEO_CONTAINERS) as VideoContainer[]).map((c) => <option key={c} value={c}>{VIDEO_CONTAINERS[c].label}</option>)}</Select>}</Field>
          ) : null}
          <Field label="Quality">{(id) => <Select id={id} value={quality} onChange={(e) => setQuality(e.target.value as Quality)}><option value="high">High</option><option value="balanced">Balanced</option><option value="small">Smaller file</option></Select>}</Field>
          <Field label="Resolution">{(id) => <Select id={id} value={height} onChange={(e) => setHeight(Number(e.target.value))}><option value={0}>Keep original</option>{[2160, 1440, 1080, 720, 480, 360].map((h) => <option key={h} value={h}>{h}p</option>)}</Select>}</Field>
          {target === "webm" ? <Field label="WebM codec">{(id) => <Select id={id} value={webm} onChange={(e) => setWebm(e.target.value as "vp8" | "vp9")}><option value="vp8">VP8 (faster)</option><option value="vp9">VP9 (smaller, slower)</option></Select>}</Field> : null}
        </Settings>
        {target !== "webm" && target !== "avi" ? <div className="mt-4"><Checkbox label="Skip re-encoding when possible" description="Copies H.264/HEVC streams into the new container – much faster and lossless" checked={fast} onChange={setFast} /></div> : null}
      </Panel>
      <ActionBar onRun={run} runLabel={`Convert to ${target.toUpperCase()}`} running={task.running} disabled={!file} onCancel={task.cancel} onReset={() => (setFile(null), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result && file ? (
        <FileResult blob={task.result.blob} filename={`${baseOf(file.name)}.${VIDEO_CONTAINERS[target].ext}`} originalSize={file.size} label="Converted video">
          <p className="text-xs text-fg-muted">{task.result.remuxed ? "Streams were copied without re-encoding (no quality loss)." : "The video was re-encoded."}</p>
        </FileResult>
      ) : null}
      <LogPanel logs={task.logs} />
      {target === "webm" ? <Alert tone="info">WebM encoding in the browser is slow (single-threaded VP8/VP9). Expect roughly real-time or slower; shorter clips are recommended.</Alert> : null}
      <FFmpegNotice />
    </div>
  );
}
