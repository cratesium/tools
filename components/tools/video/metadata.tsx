"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Badge } from "@/components/ui/feedback";
import { ActionBar, CopyButton, ErrorMessage, KeyValueTable, Panel, TaskProgress } from "@/components/tools/shared";
import { formatBytes } from "@/lib/utils/format";
import { formatTimecode } from "@/lib/processors/media/timecode";
import type { MediaStream, ProbeResult } from "@/lib/processors/media/probe";
import { FFmpegNotice, LogPanel, MediaPicker, baseOf, useFFmpegTask } from "./media-common";
import { VideoShell, useVideoTool } from "./shell";

function streamRows(s: MediaStream): [string, React.ReactNode][] {
  const rows: [string, React.ReactNode][] = [["Codec", s.codec]];
  if (s.width) rows.push(["Resolution", `${s.width}×${s.height}`]);
  if (s.fps) rows.push(["Frame rate", `${s.fps} fps`]);
  if (s.pixelFormat) rows.push(["Pixel format", s.pixelFormat]);
  if (s.rotation) rows.push(["Rotation", `${s.rotation}°`]);
  if (s.sampleRate) rows.push(["Sample rate", `${s.sampleRate} Hz`]);
  if (s.channels) rows.push(["Channels", s.channels]);
  if (s.bitrateKbps) rows.push(["Bitrate", `${s.bitrateKbps} kbit/s`]);
  if (s.language) rows.push(["Language", s.language]);
  if (s.isDefault) rows.push(["Default", "Yes"]);
  for (const [k, v] of Object.entries(s.metadata)) if (k !== "language") rows.push([k, v]);
  rows.push(["Details", <span key="d" className="break-all font-mono text-[11px]">{s.details}</span>]);
  return rows;
}

/** Media Metadata Viewer (shared by video and audio): container, streams and tags from FFmpeg. */
export function MediaMetadata({ kind = "video" }: { kind?: "video" | "audio" }) {
  const [file, setFile] = useState<File | null>(null);
  const task = useFFmpegTask<ProbeResult>();
  const run = () =>
    task.run(async (s) => {
      if (!file) throw new Error("Add a file first.");
      return s.probe(await s.input(file, file.name));
    });
  const p = task.result;
  return (
    <div className="space-y-4">
      <MediaPicker file={file} onFile={(f) => (setFile(f), task.reset())} kind={kind} />
      <ActionBar onRun={run} runLabel="Read metadata" running={task.running} disabled={!file} onCancel={task.cancel} onReset={() => (setFile(null), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {p && file ? (
        <>
          <Panel title="File" actions={<CopyButton text={JSON.stringify({ file: file.name, size: file.size, ...p }, null, 2)} label="Copy JSON" />}>
            <KeyValueTable
              rows={[
                ["Name", file.name],
                ["Size", formatBytes(file.size)],
                ["Container", p.format ?? "Unknown"],
                ["Duration", p.duration != null ? formatTimecode(p.duration) : "Unknown"],
                ["Overall bitrate", p.bitrateKbps ? `${p.bitrateKbps} kbit/s` : "Unknown"],
                ["Chapters", String(p.chapters)],
                ...Object.entries(p.metadata).map(([k, v]) => [k, v] as [string, string]),
              ]}
            />
          </Panel>
          {p.streams.map((s) => (
            <Panel key={s.index} title={<span className="flex items-center gap-2">Stream #{s.index} <Badge>{s.attachedPic ? "cover art" : s.kind}</Badge></span>}>
              <KeyValueTable rows={streamRows(s)} />
            </Panel>
          ))}
        </>
      ) : null}
      <LogPanel logs={task.logs} />
      <FFmpegNotice />
    </div>
  );
}

export function VideoMetadataViewer(_: ToolComponentProps) {
  return <MediaMetadata kind="video" />;
}

/** Video Metadata Remover: strips global/stream tags, chapters and data tracks (GPS, device, dates) without re-encoding. */
export function VideoMetadataRemover(_: ToolComponentProps) {
  const t = useVideoTool();
  const run = () =>
    t.run(async ({ s, input, file, probe }) => {
      const a = await import("@/lib/processors/video/args");
      const ext = (/\.(mp4|mov|mkv|webm)$/i.exec(file.name)?.[1].toLowerCase() ?? "mp4") as "mp4" | "mov" | "mkv" | "webm";
      const out = `out.${ext}`;
      await s.exec(a.stripMetadataArgs(input, out), { duration: probe.duration, label: "Removing metadata…" });
      const after = await s.probe(out);
      const removed = Object.keys(probe.metadata).filter((k) => !(k in after.metadata));
      return {
        blob: await s.readBlob(out, a.VIDEO_CONTAINERS[ext].mime),
        name: `${baseOf(file.name)}-clean.${ext}`,
        note: removed.length ? `Removed: ${removed.join(", ")}. Streams were copied without re-encoding.` : "No container tags were found; stream tags and chapters were cleared. Streams copied without re-encoding.",
      };
    });
  return (
    <VideoShell
      tool={t}
      runLabel="Remove metadata"
      onRun={run}
      resultLabel="Cleaned video"
      before={<p className="text-sm text-fg-muted">Removes title, creation date, GPS location, camera/phone model, encoder tags, chapters and data tracks. Technical fields the container requires (duration, codec info) remain.</p>}
    />
  );
}
