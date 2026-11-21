"use client";

/**
 * Common layout for single-file FFmpeg video tools: picker, player, settings, run bar,
 * progress, error, result, log and the FFmpeg notice.
 */

import { useRef, useState, type ReactNode, type RefObject } from "react";
import { ActionBar, ErrorMessage, FileResult, FileResults, Panel, TaskProgress } from "@/components/tools/shared";
import type { FFmpegSession } from "@/lib/processors/media/ffmpeg";
import type { ProbeResult } from "@/lib/processors/media/probe";
import type { TaskContext } from "@/lib/utils/hooks";
import { FFmpegNotice, LogPanel, MediaPicker, Player, useFFmpegTask, useMedia, type NativeMeta } from "./media-common";

export interface OutFile {
  blob: Blob;
  name: string;
  note?: string;
}

export interface JobInput {
  s: FFmpegSession;
  ctx: TaskContext;
  file: File;
  /** VFS path of the input. */
  input: string;
  probe: ProbeResult;
}

/** Hook bundling file state, media URL/metadata, a player ref and the FFmpeg task. */
export function useVideoTool(kind: "video" | "audio" = "video") {
  const [file, setFileState] = useState<File | null>(null);
  const { url, meta } = useMedia(file, kind);
  const playerRef = useRef<HTMLMediaElement | null>(null);
  const task = useFFmpegTask<OutFile[]>();
  const setFile = (f: File | null) => {
    setFileState(f);
    task.reset();
  };
  /** Runs a job with the input already written and probed. */
  const run = (job: (j: JobInput) => Promise<OutFile | OutFile[]>, opts: { requireVideo?: boolean; requireAudio?: boolean } = {}) =>
    task.run(async (s, ctx) => {
      if (!file) throw new Error(`Add a ${kind} file first.`);
      const input = await s.input(file, file.name);
      const probe = await s.probe(input);
      const needVideo = opts.requireVideo ?? kind === "video";
      if (needVideo && !probe.streams.some((x) => x.kind === "video" && !x.attachedPic)) throw new Error("No video stream found in this file.");
      if (opts.requireAudio && !probe.streams.some((x) => x.kind === "audio")) throw new Error("This file has no audio track.");
      const r = await job({ s, ctx, file, input, probe });
      ctx.progress(1, "Done");
      return Array.isArray(r) ? r : [r];
    });
  return { file, setFile, url, meta, playerRef, task, run };
}

export type VideoTool = ReturnType<typeof useVideoTool>;

export function VideoShell({
  tool,
  kind = "video",
  settings,
  runLabel,
  onRun,
  canRun = true,
  resultLabel = "Result",
  zipName = "results.zip",
  before,
  after,
  notice,
  showPlayer = true,
  accept,
  formatsLabel,
}: {
  tool: VideoTool;
  kind?: "video" | "audio";
  settings?: ReactNode;
  runLabel: string;
  onRun: () => void;
  canRun?: boolean;
  resultLabel?: string;
  zipName?: string;
  before?: ReactNode;
  after?: ReactNode;
  notice?: ReactNode;
  showPlayer?: boolean;
  accept?: string;
  formatsLabel?: string;
}) {
  const { file, setFile, url, playerRef, task } = tool;
  const results = task.result;
  return (
    <div className="space-y-4">
      <MediaPicker file={file} onFile={setFile} kind={kind} accept={accept} label={formatsLabel} />
      {showPlayer ? <Player url={url} kind={kind} playerRef={playerRef as RefObject<HTMLMediaElement | null>} /> : null}
      {before}
      {settings ? <Panel title="Settings">{settings}</Panel> : null}
      <ActionBar onRun={onRun} runLabel={runLabel} running={task.running} disabled={!file || !canRun} onCancel={task.cancel} onReset={() => setFile(null)} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {results && results.length === 1 ? (
        <FileResult blob={results[0].blob} filename={results[0].name} originalSize={file?.size} label={resultLabel}>
          {results[0].note ? <p className="text-xs text-fg-muted">{results[0].note}</p> : null}
        </FileResult>
      ) : null}
      {results && results.length > 1 ? <FileResults files={results} zipName={zipName} label={resultLabel} /> : null}
      {after}
      <LogPanel logs={task.logs} />
      <FFmpegNotice extra={notice} />
    </div>
  );
}

/** Duration helper: probe duration, else native metadata. */
export function durationOf(probe: ProbeResult, meta: NativeMeta | null): number | undefined {
  return probe.duration ?? meta?.duration ?? undefined;
}
