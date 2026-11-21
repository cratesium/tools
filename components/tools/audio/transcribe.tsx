"use client";

import { useEffect, useRef, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Segmented, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, DownloadButton, ErrorMessage, Panel, Settings, TaskProgress, TextOutput } from "@/components/tools/shared";
import { formatBytes } from "@/lib/utils/format";
import { formatClock, formatSrtTime, formatTimecode } from "@/lib/processors/media/timecode";
import { useTask } from "@/lib/utils/hooks";
import { MediaPicker, Player, baseOf, useMedia } from "../video/media-common";

interface Segment {
  start: number;
  end: number;
  text: string;
}

const MODELS = [
  { id: "onnx-community/whisper-tiny", label: "Tiny: fastest (~40 MB)" },
  { id: "onnx-community/whisper-base", label: "Base: more accurate (~80 MB)" },
  { id: "onnx-community/whisper-small", label: "Small: most accurate, slow (~250 MB)" },
];

const LANGS: [string, string][] = [["", "Detect automatically"], ["english", "English"], ["hindi", "Hindi"], ["spanish", "Spanish"], ["french", "French"], ["german", "German"], ["portuguese", "Portuguese"], ["italian", "Italian"], ["japanese", "Japanese"], ["korean", "Korean"], ["chinese", "Chinese"], ["arabic", "Arabic"], ["russian", "Russian"], ["bengali", "Bengali"], ["tamil", "Tamil"], ["telugu", "Telugu"], ["marathi", "Marathi"], ["urdu", "Urdu"], ["turkish", "Turkish"], ["dutch", "Dutch"], ["indonesian", "Indonesian"]];

export function toSrt(segs: Segment[]): string {
  return segs.map((s, i) => `${i + 1}\n${formatSrtTime(s.start)} --> ${formatSrtTime(s.end)}\n${s.text}\n`).join("\n");
}
export function toVtt(segs: Segment[]): string {
  return `WEBVTT\n\n${segs.map((s) => `${formatTimecode(s.start)} --> ${formatTimecode(s.end)}\n${s.text}\n`).join("\n")}`;
}

/** Audio to Text: Whisper speech recognition in a Web Worker (WebGPU when available). */
export default function AudioToText(_: ToolComponentProps) {
  const [file, setFile] = useState<File | null>(null);
  const { url } = useMedia(file, "audio");
  const [model, setModel] = useState(MODELS[0].id);
  const [language, setLanguage] = useState("");
  const [mode, setMode] = useState<"transcribe" | "translate">("transcribe");
  const [view, setView] = useState<"text" | "timed">("text");
  const [partial, setPartial] = useState<Segment[]>([]);
  const worker = useRef<Worker | null>(null);
  const task = useTask<{ segments: Segment[]; device: string }>();
  useEffect(() => () => worker.current?.terminate(), []);

  const run = () =>
    task.run(async ({ signal, progress }) => {
      if (!file) throw new Error("Add an audio or video file first.");
      setPartial([]);
      progress(null, "Decoding audio…");
      const { decodeToMono } = await import("@/lib/processors/audio/browser");
      const { quietChunks } = await import("@/lib/processors/audio/pcm");
      const mono = await decodeToMono(file, 16000);
      if (mono.length < 1600) throw new Error("The audio is too short to transcribe.");
      const chunks = quietChunks(mono, 16000, 28, 4).map(([a, b]) => ({ offset: a / 16000, buffer: mono.slice(a, b).buffer }));
      if (!worker.current) worker.current = new Worker(new URL("../../../workers/audio/transcribe.worker.ts", import.meta.url), { type: "module" });
      const w = worker.current;
      const id = Date.now();
      return new Promise((resolve, reject) => {
        const onAbort = () => {
          w.terminate();
          worker.current = null;
          reject(new DOMException("Cancelled", "AbortError"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        w.onmessage = (e: MessageEvent) => {
          const m = e.data;
          if (m.id !== id) return;
          if (m.type === "download") progress(m.total ? (m.loaded / m.total) * 0.3 : null, `Downloading model… ${formatBytes(m.loaded)}${m.total ? ` of ${formatBytes(m.total)}` : ""}`);
          else if (m.type === "progress") progress(0.3 + (m.done / m.total) * 0.7, `Transcribing on ${m.device}: part ${m.done + 1} of ${m.total}`);
          else if (m.type === "partial") setPartial(m.segments);
          else if (m.type === "done") {
            signal.removeEventListener("abort", onAbort);
            resolve({ segments: m.segments, device: m.device });
          } else if (m.type === "error") {
            signal.removeEventListener("abort", onAbort);
            reject(new Error(m.message));
          }
        };
        w.onerror = (e) => {
          signal.removeEventListener("abort", onAbort);
          w.terminate();
          worker.current = null;
          reject(new Error(e.message || "The speech-recognition worker crashed (possibly out of memory). Try the Tiny model."));
        };
        w.postMessage({ id, model, language: language || null, task: mode, chunks }, chunks.map((c) => c.buffer));
      });
    });

  const segs = task.result?.segments ?? (task.running ? partial : []);
  const plain = segs.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
  const timed = segs.map((s) => `[${formatClock(s.start, 0)}] ${s.text}`).join("\n");
  const base = file ? baseOf(file.name) : "transcript";

  return (
    <div className="space-y-4">
      <MediaPicker file={file} onFile={(f) => (setFile(f), task.reset(), setPartial([]))} kind="audio" label="Audio or video: MP3, WAV, M4A, OGG, WebM, MP4…" />
      <Player url={url} kind="audio" />
      <Panel title="Settings">
        <div className="space-y-4">
          <Settings>
            <Field label="Model">{(id) => <Select id={id} value={model} onChange={(e) => setModel(e.target.value)}>{MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select>}</Field>
            <Field label="Spoken language">{(id) => <Select id={id} value={language} onChange={(e) => setLanguage(e.target.value)}>{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
          </Settings>
          <Segmented label="Output" value={mode} onChange={setMode} options={[{ value: "transcribe", label: "Transcribe (same language)" }, { value: "translate", label: "Translate to English" }]} />
        </div>
      </Panel>
      <ActionBar onRun={run} runLabel="Transcribe" running={task.running} disabled={!file} onCancel={task.cancel} onReset={() => (setFile(null), task.reset(), setPartial([]))} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {segs.length ? (
        <div className="space-y-3">
          <Segmented label="View" value={view} onChange={setView} options={[{ value: "text", label: "Plain text" }, { value: "timed", label: "With timestamps" }]} />
          <TextOutput
            label={task.running ? "Transcript (in progress)" : "Transcript"}
            value={view === "text" ? plain : timed}
            filename={`${base}.txt`}
            rows={12}
            extraActions={
              !task.running ? (
                <>
                  <DownloadButton text={toSrt(segs)} filename={`${base}.srt`} size="sm" variant="secondary" label="SRT" />
                  <DownloadButton text={toVtt(segs)} filename={`${base}.vtt`} mime="text/vtt" size="sm" variant="secondary" label="VTT" />
                </>
              ) : null
            }
          />
          {task.result ? <p className="text-xs text-fg-muted">Ran on {task.result.device}. Check names, numbers and technical terms, since automatic transcripts can contain mistakes.</p> : null}
        </div>
      ) : null}
      <Alert tone="info">
        Speech recognition runs on your device with OpenAI&apos;s open Whisper model. The model files are downloaded once from the Hugging Face Hub and cached; your audio is never uploaded. A WebGPU-capable browser (recent Chrome or Edge) is much faster. On CPU, expect roughly real time with Tiny.
      </Alert>
    </div>
  );
}
