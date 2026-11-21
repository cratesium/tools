"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Segmented, Select, Slider } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, FileResult, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { useTask } from "@/lib/utils/hooks";
import { OUTPUT_FORMATS, type OutputFormat } from "@/lib/processors/audio/browser";
import { MediaPicker, Player, baseOf, seconds, useMedia } from "../video/media-common";
import { Waveform } from "./common";

/**
 * Audio Noise Reducer: spectral gating (STFT) learned from the quietest part of the recording
 * or a noise-only region you choose. Runs on the main thread in chunks so progress is real.
 */
export default function AudioDenoise(_: ToolComponentProps) {
  const [file, setFile] = useState<File | null>(null);
  const { url } = useMedia(file, "audio");
  const [strength, setStrength] = useState(18);
  const [sensitivity, setSensitivity] = useState(1.5);
  const [profile, setProfile] = useState<"auto" | "manual">("auto");
  const [ns, setNs] = useState("0");
  const [ne, setNe] = useState("1");
  const [format, setFormat] = useState<OutputFormat>("wav");
  const task = useTask<{ blob: Blob; name: string }>();

  const run = () =>
    task.run(async ({ signal, progress }) => {
      if (!file) throw new Error("Add an audio file first.");
      const { decodeAudioFile, encodeChannels } = await import("@/lib/processors/audio/browser");
      const { spectralGateSteps } = await import("@/lib/processors/audio/denoise");
      progress(null, "Decoding audio…");
      const d = await decodeAudioFile(file);
      const region: [number, number] | undefined = profile === "manual" ? [Math.floor(seconds(ns) * d.sampleRate), Math.floor(seconds(ne) * d.sampleRate)] : undefined;
      if (region && region[1] - region[0] < 2048) throw new Error("The noise sample must be at least 0.05 seconds long.");
      const out: Float32Array[] = [];
      for (let c = 0; c < d.channels.length; c++) {
        const it = spectralGateSteps(d.channels[c], { reductionDb: strength, sensitivity, noiseRegion: region });
        for (;;) {
          if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
          const r = it.next();
          if (r.done) {
            out.push(r.value);
            break;
          }
          progress(((c + r.value) / d.channels.length) * 0.85, `Reducing noise (channel ${c + 1} of ${d.channels.length})…`);
          await new Promise((res) => setTimeout(res, 0));
        }
      }
      progress(0.9, "Encoding…");
      const blob = await encodeChannels(out, d.sampleRate, { format, bitrate: 192, session: { signal, onProgress: (v) => v != null && progress(0.9 + v * 0.1) } });
      const ext = format === "m4a" ? "m4a" : format;
      return { blob, name: `${baseOf(file.name)}-denoised.${ext}` };
    });

  return (
    <div className="space-y-4">
      <MediaPicker file={file} onFile={(f) => (setFile(f), task.reset())} kind="audio" />
      <Player url={url} kind="audio" />
      <Waveform file={file} selection={profile === "manual" ? { start: seconds(ns), end: seconds(ne) } : undefined} mode="remove" />
      <Panel title="Settings">
        <div className="space-y-4">
          <Slider label="Noise reduction" value={strength} min={6} max={36} onChange={setStrength} format={(v) => `${v} dB`} />
          <Slider label="Sensitivity" value={sensitivity} min={0.5} max={3} step={0.1} onChange={setSensitivity} format={(v) => (v < 1.2 ? `${v.toFixed(1)} (gentle)` : v > 2 ? `${v.toFixed(1)} (aggressive)` : v.toFixed(1))} />
          <Segmented label="Noise profile" value={profile} onChange={setProfile} options={[{ value: "auto", label: "Detect automatically" }, { value: "manual", label: "I'll pick a noise-only part" }]} />
          {profile === "manual" ? (
            <Settings>
              <Field label="Noise sample from (s)">{(id) => <Input id={id} value={ns} onChange={(e) => setNs(e.target.value)} className="font-mono" />}</Field>
              <Field label="Noise sample to (s)">{(id) => <Input id={id} value={ne} onChange={(e) => setNe(e.target.value)} className="font-mono" />}</Field>
            </Settings>
          ) : null}
          <Settings>
            <Field label="Output format">{(id) => <Select id={id} value={format} onChange={(e) => setFormat(e.target.value as OutputFormat)}>{OUTPUT_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</Select>}</Field>
          </Settings>
        </div>
      </Panel>
      <ActionBar onRun={run} runLabel="Reduce noise" running={task.running} disabled={!file} onCancel={task.cancel} onReset={() => (setFile(null), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? <FileResult blob={task.result.blob} filename={task.result.name} originalSize={file?.size} label="Cleaned audio" /> : null}
      <Alert tone="info">Best for steady background noise (hiss, hum, fans, air-conditioning, room tone). Noise that changes constantly, like traffic or chatter, cannot be separated this way. Too much reduction makes speech sound watery, so start around 12–18 dB. Everything runs locally.</Alert>
    </div>
  );
}
