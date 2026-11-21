"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Segmented } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { formatTimecode, parseTimecodeList, splitAtPoints, splitByCount, splitByDuration } from "@/lib/processors/media/timecode";
import { baseOf } from "./media-common";
import { VideoShell, useVideoTool } from "./shell";

/** Video Splitter: by segment length, number of parts or custom split points. Stream copy (fast). */
export default function VideoSplit(_: ToolComponentProps) {
  const t = useVideoTool();
  const [mode, setMode] = useState<"duration" | "count" | "points">("duration");
  const [segment, setSegment] = useState("60");
  const [count, setCount] = useState("2");
  const [points, setPoints] = useState("");
  const [accurate, setAccurate] = useState<"copy" | "encode">("copy");
  const duration = t.meta?.duration ?? 0;
  const pts = parseTimecodeList(points);
  const ranges =
    mode === "duration" ? splitByDuration(duration, Number(segment)) : mode === "count" ? splitByCount(duration, Number(count)) : pts.some(Number.isNaN) ? [] : splitAtPoints(duration, pts);
  const tooMany = ranges.length > 100;

  const run = () =>
    t.run(async ({ s, input, file, ctx }) => {
      if (ranges.length < 2) throw new Error("These settings produce fewer than two parts.");
      if (tooMany) throw new Error("Too many parts (maximum 100).");
      const a = await import("@/lib/processors/video/args");
      const ext = (/\.(mp4|mov|mkv|webm)$/i.exec(file.name)?.[1].toLowerCase() ?? "mp4") as "mp4" | "mov" | "mkv" | "webm";
      const container = accurate === "copy" ? ext : ext === "webm" ? "webm" : "mp4";
      const outs = [];
      for (let i = 0; i < ranges.length; i++) {
        const span: [number, number] = [i / ranges.length, (i + 1) / ranges.length];
        const out = `part${i}.${container}`;
        await s.exec(a.trimArgs(input, out, ranges[i], accurate, container), { duration: ranges[i].end - ranges[i].start, span, label: `Part ${i + 1} of ${ranges.length}…` });
        outs.push({ blob: await s.readBlob(out, a.VIDEO_CONTAINERS[container].mime), name: `${baseOf(file.name)}-part${String(i + 1).padStart(2, "0")}.${container}` });
        await s.remove(out);
        ctx.progress(span[1]);
      }
      return outs;
    });

  return (
    <VideoShell
      tool={t}
      runLabel={ranges.length > 1 ? `Split into ${ranges.length} parts` : "Split video"}
      onRun={run}
      canRun={ranges.length > 1 && !tooMany}
      resultLabel="Parts"
      zipName={`${t.file ? baseOf(t.file.name) : "video"}-parts.zip`}
      settings={
        <div className="space-y-4">
          <Segmented label="Split by" value={mode} onChange={setMode} options={[{ value: "duration", label: "Every N seconds" }, { value: "count", label: "Equal parts" }, { value: "points", label: "At timestamps" }]} />
          {mode === "duration" ? <Field label="Segment length (seconds)">{(id) => <Input id={id} type="number" min={1} value={segment} onChange={(e) => setSegment(e.target.value)} />}</Field> : null}
          {mode === "count" ? <Field label="Number of parts">{(id) => <Input id={id} type="number" min={2} max={100} value={count} onChange={(e) => setCount(e.target.value)} />}</Field> : null}
          {mode === "points" ? <Field label="Split at" hint="Comma-separated, e.g. 0:30, 1:45, 3:00" error={pts.some(Number.isNaN) ? "One of the timestamps is not valid." : null}>{(id) => <Input id={id} value={points} onChange={(e) => setPoints(e.target.value)} placeholder="0:30, 1:45" />}</Field> : null}
          <Segmented label="Accuracy" value={accurate} onChange={setAccurate} options={[{ value: "copy", label: "Fast (keyframe cuts)" }, { value: "encode", label: "Frame-accurate (re-encode)" }]} />
          {duration && ranges.length ? (
            <p className="text-xs text-fg-muted">
              {ranges.length} parts: {ranges.slice(0, 6).map((r) => `${formatTimecode(r.start, 1)}–${formatTimecode(r.end, 1)}`).join(", ")}
              {ranges.length > 6 ? " …" : ""}
            </p>
          ) : null}
          {tooMany ? <Alert tone="warning">That would create {ranges.length} parts; the maximum is 100.</Alert> : null}
        </div>
      }
    />
  );
}
