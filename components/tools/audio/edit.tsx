"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Segmented, Slider } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, FileResult, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { Dropzone } from "@/components/upload/dropzone";
import { formatBytes } from "@/lib/utils/format";
import { formatTimecode, parseTimecodeList, splitAtPoints, splitByCount, splitByDuration, validateRange } from "@/lib/processors/media/timecode";
import type { AudioFormat } from "@/lib/processors/audio/args";
import { AUDIO_ACCEPT, FFmpegNotice, LogPanel, MAX_MEDIA_BYTES, TimeField, baseOf, seconds, useFFmpegTask } from "../video/media-common";
import { VideoShell, useVideoTool, type OutFile } from "../video/shell";
import { BitrateSelect, FormatSelect, Waveform, resolveFormat, sameOrMp3 } from "./common";

/** Audio Trimmer (keep a range) / Audio Cutter (remove a range) via processorOptions { mode }, with fades. */
export function AudioTrim({ tool }: ToolComponentProps) {
  const cut = tool.processorOptions?.mode === "cut";
  const t = useVideoTool("audio");
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("");
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [format, setFormat] = useState<AudioFormat | "same">("same");
  const [bitrate, setBitrate] = useState(192);
  const [lossless, setLossless] = useState(false);
  const duration = t.meta?.duration;
  const endValue = end || (duration ? formatTimecode(duration) : "");
  const range = { start: seconds(start), end: seconds(endValue, duration ?? 0) };
  const invalid = t.file ? validateRange(range, duration) : null;
  const copyable = !cut && format === "same" && fadeIn === 0 && fadeOut === 0 && !!t.file && /\.(mp3|m4a|aac|ogg|opus|flac|wav)$/i.test(t.file.name);

  const run = () =>
    t.run(
      async ({ s, input, file, probe }) => {
        const a = await import("@/lib/processors/audio/args");
        const fmtKey = resolveFormat(format, file.name);
        const fmt = a.AUDIO_FORMATS[fmtKey];
        const out = `out.${fmt.ext}`;
        const total = probe.duration ?? duration ?? range.end;
        if (lossless && copyable) {
          await s.exec(a.audioTrimCopyArgs(input, out, range.start, range.end), { duration: range.end - range.start, label: "Trimming (no re-encoding)…" });
          return { blob: await s.readBlob(out, fmt.mime), name: `${baseOf(file.name)}-trimmed.${fmt.ext}`, note: "Copied without re-encoding." };
        }
        const a0 = range.start.toFixed(3);
        const b0 = range.end.toFixed(3);
        const filters: string[] = cut ? [`aselect='not(between(t,${a0},${b0}))'`, "asetpts=N/SR/TB"] : [`atrim=start=${a0}:end=${b0}`, "asetpts=PTS-STARTPTS"];
        const outLen = cut ? total - (range.end - range.start) : range.end - range.start;
        if (fadeIn > 0) filters.push(`afade=t=in:st=0:d=${fadeIn}`);
        if (fadeOut > 0) filters.push(`afade=t=out:st=${Math.max(0, outLen - fadeOut).toFixed(3)}:d=${fadeOut}`);
        await s.exec(a.audioFilterArgs(input, out, filters.join(","), fmtKey, { bitrate }), { duration: outLen, label: cut ? "Removing section…" : "Trimming…" });
        return { blob: await s.readBlob(out, fmt.mime), name: `${baseOf(file.name)}-${cut ? "cut" : "trimmed"}.${fmt.ext}` };
      },
      { requireAudio: true },
    );

  return (
    <VideoShell
      tool={t}
      kind="audio"
      runLabel={cut ? "Cut out section" : "Trim audio"}
      onRun={run}
      canRun={!invalid}
      resultLabel={cut ? "Edited audio" : "Trimmed audio"}
      before={<Waveform file={t.file} selection={invalid ? undefined : range} mode={cut ? "remove" : "keep"} playerRef={t.playerRef} />}
      settings={
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">{cut ? "Choose the section to remove; the audio before and after is joined." : "Choose the part to keep."} Click the waveform to move the playhead, then use the target buttons.</p>
          <Settings>
            <TimeField label={cut ? "Remove from" : "Start"} value={start} onChange={setStart} playerRef={t.playerRef} />
            <TimeField label={cut ? "Remove until" : "End"} value={endValue} onChange={setEnd} playerRef={t.playerRef} hint={duration ? `Length ${formatTimecode(duration)}` : undefined} />
            <FormatSelect value={format} onChange={setFormat} allowSame />
            <BitrateSelect value={bitrate} onChange={setBitrate} disabled={lossless && copyable} />
          </Settings>
          <Slider label="Fade in" value={fadeIn} min={0} max={10} step={0.5} onChange={setFadeIn} format={(v) => `${v} s`} />
          <Slider label="Fade out" value={fadeOut} min={0} max={10} step={0.5} onChange={setFadeOut} format={(v) => `${v} s`} />
          {copyable ? <Checkbox label="Lossless (no re-encoding)" description="Instant and keeps original quality; cuts align to audio frames (~26 ms)" checked={lossless} onChange={setLossless} /> : null}
          {invalid ? <Alert tone="warning">{invalid}</Alert> : null}
        </div>
      }
    />
  );
}

/** Audio Splitter: every N seconds, N equal parts or at timestamps; stream copy where possible. */
export function AudioSplit(_: ToolComponentProps) {
  const t = useVideoTool("audio");
  const [mode, setMode] = useState<"duration" | "count" | "points">("duration");
  const [segment, setSegment] = useState("60");
  const [count, setCount] = useState("2");
  const [points, setPoints] = useState("");
  const duration = t.meta?.duration ?? 0;
  const pts = parseTimecodeList(points);
  const ranges = mode === "duration" ? splitByDuration(duration, Number(segment)) : mode === "count" ? splitByCount(duration, Number(count)) : pts.some(Number.isNaN) ? [] : splitAtPoints(duration, pts);
  const tooMany = ranges.length > 200;

  const run = () =>
    t.run(
      async ({ s, input, file, ctx }) => {
        if (ranges.length < 2) throw new Error("These settings produce fewer than two parts.");
        const a = await import("@/lib/processors/audio/args");
        const fmtKey = sameOrMp3(file.name);
        const fmt = a.AUDIO_FORMATS[fmtKey];
        const copy = !!/\.(mp3|m4a|aac|ogg|opus|flac|wav)$/i.exec(file.name);
        const outs: OutFile[] = [];
        for (let i = 0; i < ranges.length; i++) {
          const r = ranges[i];
          const out = `part${i}.${fmt.ext}`;
          const span: [number, number] = [i / ranges.length, (i + 1) / ranges.length];
          const args = copy ? a.audioTrimCopyArgs(input, out, r.start, r.end) : a.audioFilterArgs(input, out, `atrim=start=${r.start}:end=${r.end},asetpts=PTS-STARTPTS`, fmtKey, { bitrate: 192 });
          await s.exec(args, { duration: r.end - r.start, span, label: `Part ${i + 1} of ${ranges.length}…` });
          outs.push({ blob: await s.readBlob(out, fmt.mime), name: `${baseOf(file.name)}-part${String(i + 1).padStart(2, "0")}.${fmt.ext}` });
          await s.remove(out);
          ctx.progress(span[1]);
        }
        return outs;
      },
      { requireAudio: true },
    );

  return (
    <VideoShell
      tool={t}
      kind="audio"
      runLabel={ranges.length > 1 ? `Split into ${ranges.length} parts` : "Split audio"}
      onRun={run}
      canRun={ranges.length > 1 && !tooMany}
      resultLabel="Parts"
      zipName={`${t.file ? baseOf(t.file.name) : "audio"}-parts.zip`}
      before={<Waveform file={t.file} playerRef={t.playerRef} />}
      settings={
        <div className="space-y-4">
          <Segmented label="Split by" value={mode} onChange={setMode} options={[{ value: "duration", label: "Every N seconds" }, { value: "count", label: "Equal parts" }, { value: "points", label: "At timestamps" }]} />
          {mode === "duration" ? <Field label="Segment length (seconds)">{(id) => <Input id={id} type="number" min={1} value={segment} onChange={(e) => setSegment(e.target.value)} />}</Field> : null}
          {mode === "count" ? <Field label="Number of parts">{(id) => <Input id={id} type="number" min={2} max={200} value={count} onChange={(e) => setCount(e.target.value)} />}</Field> : null}
          {mode === "points" ? <Field label="Split at" hint="Comma-separated, e.g. 3:15, 7:02" error={pts.some(Number.isNaN) ? "One of the timestamps is not valid." : null}>{(id) => <Input id={id} value={points} onChange={(e) => setPoints(e.target.value)} placeholder="3:15, 7:02" />}</Field> : null}
          {duration && ranges.length ? <p className="text-xs text-fg-muted">{ranges.length} parts: {ranges.slice(0, 6).map((r) => `${formatTimecode(r.start, 1)}–${formatTimecode(r.end, 1)}`).join(", ")}{ranges.length > 6 ? " …" : ""}</p> : null}
          {tooMany ? <Alert tone="warning">That would create {ranges.length} parts; the maximum is 200.</Alert> : null}
        </div>
      }
    />
  );
}

/** Audio Merger: joins files in order (any formats), optional gap or crossfade. */
export function AudioMerge(_: ToolComponentProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<AudioFormat | "same">("mp3");
  const [bitrate, setBitrate] = useState(192);
  const [joint, setJoint] = useState<"none" | "gap" | "crossfade">("none");
  const [secs, setSecs] = useState(1);
  const task = useFFmpegTask<OutFile>();
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
      if (files.length < 2) throw new Error("Add at least two audio files.");
      const a = await import("@/lib/processors/audio/args");
      const { hasAudio } = await import("@/lib/processors/media/probe");
      const fmtKey = format === "same" ? sameOrMp3(files[0].name) : format;
      const fmt = a.AUDIO_FORMATS[fmtKey];
      const args: string[] = [];
      let total = 0;
      for (let i = 0; i < files.length; i++) {
        ctx.progress(null, `Reading file ${i + 1} of ${files.length}…`);
        const p = await s.input(files[i], `in${i}-${files[i].name}`);
        const pr = await s.probe(p);
        if (!hasAudio(pr)) throw new Error(`"${files[i].name}" has no audio.`);
        total += pr.duration ?? 0;
        args.push("-i", p);
      }
      const norm = files.map((_, i) => `[${i}:a:0]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
      let graph: string;
      if (joint === "crossfade") {
        let prev = "a0";
        const xf: string[] = [];
        for (let i = 1; i < files.length; i++) {
          const o = i === files.length - 1 ? "out" : `x${i}`;
          xf.push(`[${prev}][a${i}]acrossfade=d=${secs}:c1=tri:c2=tri[${o}]`);
          prev = o;
        }
        graph = [...norm, ...xf].join(";");
        total -= secs * (files.length - 1);
      } else if (joint === "gap") {
        const parts: string[] = [];
        const seq: string[] = [];
        files.forEach((_, i) => {
          seq.push(`[a${i}]`);
          if (i < files.length - 1) {
            parts.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${secs},aformat=sample_fmts=fltp:channel_layouts=stereo[g${i}]`);
            seq.push(`[g${i}]`);
          }
        });
        graph = [...norm, ...parts, `${seq.join("")}concat=n=${seq.length}:v=0:a=1[out]`].join(";");
        total += secs * (files.length - 1);
      } else graph = [...norm, `${files.map((_, i) => `[a${i}]`).join("")}concat=n=${files.length}:v=0:a=1[out]`].join(";");
      const out = `merged.${fmt.ext}`;
      await s.exec([...args, "-filter_complex", graph, "-map", "[out]", ...a.audioCodecArgs(fmtKey, { bitrate }), out], { duration: total, label: "Merging…" });
      return { blob: await s.readBlob(out, fmt.mime), name: out };
    });

  return (
    <div className="space-y-4">
      <Dropzone accept={AUDIO_ACCEPT} multiple maxSize={MAX_MEDIA_BYTES} formatsLabel="Add two or more audio files (MP3, WAV, M4A, FLAC, OGG…)" onFiles={(f) => (setFiles((x) => [...x, ...f]), task.reset())} />
      {files.length ? (
        <Panel title={`Files in order (${files.length})`}>
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
        <div className="space-y-4">
          <Settings>
            <FormatSelect value={format} onChange={setFormat} allowSame sameLabel="Same as first file" />
            <BitrateSelect value={bitrate} onChange={setBitrate} />
          </Settings>
          <Segmented label="Between files" value={joint} onChange={setJoint} options={[{ value: "none", label: "Join directly" }, { value: "gap", label: "Silence gap" }, { value: "crossfade", label: "Crossfade" }]} />
          {joint !== "none" ? <Slider label={joint === "gap" ? "Gap length" : "Crossfade length"} value={secs} min={0.5} max={10} step={0.5} onChange={setSecs} format={(v) => `${v} s`} /> : null}
        </div>
      </Panel>
      <ActionBar onRun={run} runLabel="Merge audio" running={task.running} disabled={files.length < 2} onCancel={task.cancel} onReset={() => (setFiles([]), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? <FileResult blob={task.result.blob} filename={task.result.name} label="Merged audio" /> : null}
      <LogPanel logs={task.logs} />
      <FFmpegNotice />
    </div>
  );
}
