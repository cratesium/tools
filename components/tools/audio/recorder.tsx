"use client";

import { useEffect, useRef, useState } from "react";
import { Circle, Pause, Play, Square } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ErrorMessage, FileResult, Panel, Settings, TaskProgress, UnsupportedNotice } from "@/components/tools/shared";
import { formatClock } from "@/lib/processors/media/timecode";
import { useObjectUrl, useSupport, useTask } from "@/lib/utils/hooks";

type Out = "original" | "mp3" | "wav";

function pickMime(): string {
  const options = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

/** Audio Recorder: records the microphone with MediaRecorder; export as recorded (WebM/MP4), MP3 or WAV. */
export default function AudioRecorder(_: ToolComponentProps) {
  const supported = useSupport(() => typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [state, setState] = useState<"idle" | "recording" | "paused">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [raw, setRaw] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<Out>("mp3");
  const [clean, setClean] = useState(true);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const ac = useRef<AudioContext | null>(null);
  const task = useTask<{ blob: Blob; name: string }>();
  const rawUrl = useObjectUrl(raw);

  const stopAll = () => {
    if (timer.current) clearInterval(timer.current);
    if (raf.current) cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    void ac.current?.close();
    ac.current = null;
    stream.current = null;
  };
  useEffect(() => () => stopAll(), []);

  const start = async () => {
    setError(null);
    setRaw(null);
    task.reset();
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: clean, noiseSuppression: clean, autoGainControl: clean } });
      stream.current = s;
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === "audioinput"));
      const mime = pickMime();
      const r = new MediaRecorder(s, mime ? { mimeType: mime, audioBitsPerSecond: 128000 } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        setRaw(new Blob(chunks.current, { type: r.mimeType || "audio/webm" }));
        stopAll();
        setState("idle");
        setLevel(0);
      };
      r.start(1000);
      rec.current = r;
      setState("recording");
      setElapsed(0);
      const t0 = performance.now();
      let pausedFor = 0;
      let pausedAt = 0;
      timer.current = window.setInterval(() => {
        if (rec.current?.state === "paused") {
          if (!pausedAt) pausedAt = performance.now();
          return;
        }
        if (pausedAt) {
          pausedFor += performance.now() - pausedAt;
          pausedAt = 0;
        }
        setElapsed((performance.now() - t0 - pausedFor) / 1000);
      }, 200);
      const ctx = new AudioContext();
      ac.current = ctx;
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      ctx.createMediaStreamSource(s).connect(an);
      const buf = new Float32Array(an.fftSize);
      const tick = () => {
        an.getFloatTimeDomainData(buf);
        let p = 0;
        for (const v of buf) p = Math.max(p, Math.abs(v));
        setLevel(p);
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      stopAll();
      const n = (e as { name?: string }).name;
      setError(n === "NotAllowedError" ? "Microphone access was denied. Allow it in your browser's site settings and try again." : n === "NotFoundError" ? "No microphone was found." : e instanceof Error ? e.message : String(e));
    }
  };

  const exportAs = () =>
    task.run(async ({ signal, progress }) => {
      if (!raw) throw new Error("Record something first.");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
      const ext0 = raw.type.includes("mp4") ? "m4a" : raw.type.includes("ogg") ? "ogg" : "webm";
      if (out === "original") return { blob: raw, name: `recording-${stamp}.${ext0}` };
      if (out === "wav") {
        const { decodeAudioFile, encodeChannels } = await import("@/lib/processors/audio/browser");
        const d = await decodeAudioFile(raw);
        return { blob: await encodeChannels(d.channels, d.sampleRate, { format: "wav" }), name: `recording-${stamp}.wav` };
      }
      const { withFFmpeg } = await import("@/lib/processors/media/ffmpeg");
      const { convertAudioArgsNoCover } = await import("@/lib/processors/audio/args");
      return withFFmpeg(
        async (s) => {
          const inp = await s.input(raw, `rec.${ext0}`);
          await s.exec(convertAudioArgsNoCover(inp, "rec.mp3", "mp3", { bitrate: 192 }), { duration: elapsed, label: "Encoding MP3…" });
          return { blob: await s.readBlob("rec.mp3", "audio/mpeg"), name: `recording-${stamp}.mp3` };
        },
        { signal, onProgress: (v, l) => progress(v, l) },
      );
    });

  if (supported === false) return <UnsupportedNotice feature="Audio recording">Your browser does not support microphone recording (MediaRecorder). Try recent Chrome, Edge, Firefox or Safari over HTTPS.</UnsupportedNotice>;

  return (
    <div className="space-y-4">
      <Panel title="Recorder">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {state === "idle" ? (
              <Button onClick={start} icon={<Circle className="h-4 w-4 fill-current text-danger" />} data-testid="run">Start recording</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={() => (state === "recording" ? (rec.current?.pause(), setState("paused")) : (rec.current?.resume(), setState("recording")))} icon={state === "recording" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}>{state === "recording" ? "Pause" : "Resume"}</Button>
                <Button onClick={() => rec.current?.stop()} icon={<Square className="h-4 w-4" />}>Stop</Button>
              </>
            )}
            <span className="font-mono text-2xl tabular-nums" aria-live="polite">{formatClock(elapsed, 0)}</span>
            {state === "recording" ? <span className="inline-flex items-center gap-1.5 text-xs text-danger"><span className="h-2 w-2 animate-pulse rounded-full bg-danger" />REC</span> : null}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-bg-muted" aria-label="Input level" role="meter" aria-valuenow={Math.round(level * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full transition-[width] duration-75 ${level > 0.95 ? "bg-danger" : "bg-accent"}`} style={{ width: `${Math.min(100, level * 100)}%` }} />
          </div>
          {state === "idle" ? (
            <Settings>
              {devices.length > 1 ? <Field label="Microphone">{(id) => <Select id={id} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}><option value="">Default</option>{devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Microphone"}</option>)}</Select>}</Field> : null}
            </Settings>
          ) : null}
          {state === "idle" ? <Checkbox label="Voice processing" description="Echo cancellation, noise suppression and auto gain. Turn off for music." checked={clean} onChange={setClean} /> : null}
        </div>
      </Panel>
      <ErrorMessage error={error} />
      {raw ? (
        <Panel title="Your recording">
          <div className="space-y-4">
            {rawUrl ? <audio src={rawUrl} controls className="w-full" /> : null}
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Save as">{(id) => <Select id={id} value={out} onChange={(e) => setOut(e.target.value as Out)}><option value="mp3">MP3</option><option value="wav">WAV (lossless)</option><option value="original">As recorded ({raw.type.split(";")[0]})</option></Select>}</Field>
              <Button onClick={exportAs} loading={task.running} data-testid="export">Prepare download</Button>
            </div>
          </div>
        </Panel>
      ) : null}
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? <FileResult blob={task.result.blob} filename={task.result.name} label="Recording" /> : null}
      <Alert tone="info">Recording happens entirely in your browser; audio is never uploaded. Keep this tab open while recording. Closing it discards the recording.</Alert>
    </div>
  );
}
