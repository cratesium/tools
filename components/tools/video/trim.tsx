"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Segmented } from "@/components/ui/field";
import { Settings } from "@/components/tools/shared";
import { Alert } from "@/components/ui/feedback";
import { formatTimecode, validateRange } from "@/lib/processors/media/timecode";
import { TimeField, baseOf, seconds } from "./media-common";
import { VideoShell, useVideoTool } from "./shell";

/**
 * Video Trimmer (keep a range) and Video Cutter (remove a range), via processorOptions { mode }.
 * Trimming can stream-copy (instant, keyframe-aligned) or re-encode (frame-accurate).
 */
export default function VideoTrim({ tool }: ToolComponentProps) {
  const cut = tool.processorOptions?.mode === "cut";
  const t = useVideoTool();
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("");
  const [accuracy, setAccuracy] = useState<"copy" | "encode">("copy");
  const duration = t.meta?.duration;
  const endValue = end || (duration ? formatTimecode(duration) : "");
  const range = { start: seconds(start), end: seconds(endValue, duration ?? 0) };
  const invalid = t.file ? validateRange(range, duration) : null;

  const run = () =>
    t.run(async ({ s, input, probe, file }) => {
      const a = await import("@/lib/processors/video/args");
      const ext = /\.(mp4|mov|mkv|webm)$/i.exec(file.name)?.[1].toLowerCase() ?? "mp4";
      const total = probe.duration ?? duration ?? range.end;
      if (!cut) {
        const copy = accuracy === "copy";
        const container = copy ? (ext as "mp4" | "mov" | "mkv" | "webm") : ext === "webm" ? "webm" : "mp4";
        const out = `out.${container}`;
        await s.exec(a.trimArgs(input, out, range, accuracy, container), { duration: range.end - range.start, label: copy ? "Trimming (no re-encoding)…" : "Trimming and re-encoding…" });
        return { blob: await s.readBlob(out, a.VIDEO_CONTAINERS[container].mime), name: `${baseOf(file.name)}-trimmed.${container}`, note: copy ? "Stream copy: the start snaps to the nearest earlier keyframe, so the clip may begin slightly early." : undefined };
      }
      const hasAudio = probe.streams.some((x) => x.kind === "audio");
      const container = ext === "webm" ? "webm" : "mp4";
      const out = `out.${container}`;
      await s.exec(a.cutOutArgs(input, out, range, hasAudio, container), { duration: total - (range.end - range.start), label: "Removing section and re-encoding…" });
      return { blob: await s.readBlob(out, a.VIDEO_CONTAINERS[container].mime), name: `${baseOf(file.name)}-cut.${container}` };
    });

  return (
    <VideoShell
      tool={t}
      runLabel={cut ? "Cut out section" : "Trim video"}
      onRun={run}
      canRun={!invalid}
      resultLabel={cut ? "Edited video" : "Trimmed video"}
      settings={
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">{cut ? "Choose the section to remove. The parts before and after it are joined together." : "Choose the part of the video to keep."} Use the target buttons to take the current player position.</p>
          <Settings>
            <TimeField label={cut ? "Remove from" : "Start"} value={start} onChange={setStart} playerRef={t.playerRef} />
            <TimeField label={cut ? "Remove until" : "End"} value={endValue} onChange={setEnd} playerRef={t.playerRef} hint={duration ? `Length ${formatTimecode(duration)}` : undefined} />
          </Settings>
          {!cut ? <Segmented label="Accuracy" value={accuracy} onChange={setAccuracy} options={[{ value: "copy", label: "Fast (no re-encode)" }, { value: "encode", label: "Frame-accurate" }]} /> : null}
          {invalid ? <Alert tone="warning">{invalid}</Alert> : null}
        </div>
      }
    />
  );
}
