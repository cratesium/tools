"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Segmented, Select, Slider } from "@/components/ui/field";
import { Settings } from "@/components/tools/shared";
import { EQ_BANDS, EQ_MAX_DB, EQ_MIN_DB, EQ_PRESETS, eqHeadroom, eqResponse, logFrequencies } from "@/lib/processors/audio/eq";
import type { AudioFormat } from "@/lib/processors/audio/args";
import { baseOf } from "../video/media-common";
import { VideoShell, useVideoTool, type JobInput } from "../video/shell";
import { BitrateSelect, FormatSelect, Waveform, resolveFormat } from "./common";

/** Runs one -af filter over the input and writes `suffix` output in the chosen format. */
async function filterJob({ s, input, file, probe }: JobInput, filter: string, format: AudioFormat | "same", bitrate: number, suffix: string, outDuration?: number, label = "Processing…") {
  const a = await import("@/lib/processors/audio/args");
  const fmtKey = resolveFormat(format, file.name);
  const fmt = a.AUDIO_FORMATS[fmtKey];
  const out = `out.${fmt.ext}`;
  await s.exec(a.audioFilterArgs(input, out, filter, fmtKey, { bitrate }), { duration: outDuration ?? probe.duration, label });
  return { blob: await s.readBlob(out, fmt.mime), name: `${baseOf(file.name)}-${suffix}.${fmt.ext}` };
}

function OutputSettings({ format, setFormat, bitrate, setBitrate }: { format: AudioFormat | "same"; setFormat: (f: AudioFormat | "same") => void; bitrate: number; setBitrate: (b: number) => void }) {
  return (
    <Settings>
      <FormatSelect value={format} onChange={setFormat} allowSame />
      <BitrateSelect value={bitrate} onChange={setBitrate} />
    </Settings>
  );
}

/** Audio Speed Changer: 0.25×–4×, pitch preserved (time-stretch) or tape-style. */
export function AudioSpeed(_: ToolComponentProps) {
  const t = useVideoTool("audio");
  const [speed, setSpeed] = useState(1.25);
  const [pitch, setPitch] = useState(true);
  const [format, setFormat] = useState<AudioFormat | "same">("same");
  const [bitrate, setBitrate] = useState(192);
  const run = () =>
    t.run(
      async (j) => {
        const { audioSpeedFilter } = await import("@/lib/processors/audio/args");
        const { firstAudio } = await import("@/lib/processors/media/probe");
        const sr = firstAudio(j.probe)?.sampleRate ?? 44100;
        return filterJob(j, audioSpeedFilter(speed, pitch, sr), format, bitrate, `${speed}x`, j.probe.duration ? j.probe.duration / speed : undefined, `Changing speed to ${speed}×…`);
      },
      { requireAudio: true },
    );
  return (
    <VideoShell
      tool={t}
      kind="audio"
      runLabel={`Change speed to ${speed}×`}
      onRun={run}
      resultLabel="Audio"
      settings={
        <div className="space-y-4">
          <Slider label="Speed" value={speed} min={0.25} max={4} step={0.05} onChange={setSpeed} format={(v) => `${v.toFixed(2)}×`} />
          <div className="flex flex-wrap gap-2">{[0.5, 0.75, 0.9, 1.1, 1.25, 1.5, 2].map((v) => <button key={v} type="button" className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-bg-muted" onClick={() => setSpeed(v)}>{v}×</button>)}</div>
          <Checkbox label="Preserve pitch" description="Off = tape-style: faster also sounds higher (chipmunk/slowed effect)" checked={pitch} onChange={setPitch} />
          <OutputSettings format={format} setFormat={setFormat} bitrate={bitrate} setBitrate={setBitrate} />
          {t.meta?.duration ? <p className="text-xs text-fg-muted">New length ≈ {(t.meta.duration / speed).toFixed(1)} s.</p> : null}
        </div>
      }
    />
  );
}

/** Audio Volume Changer: gain in dB with an optional limiter to prevent clipping. */
export function AudioVolume(_: ToolComponentProps) {
  const t = useVideoTool("audio");
  const [db, setDb] = useState(6);
  const [limit, setLimit] = useState(true);
  const [format, setFormat] = useState<AudioFormat | "same">("same");
  const [bitrate, setBitrate] = useState(192);
  const run = () =>
    t.run((j) => filterJob(j, `volume=${db}dB${limit && db > 0 ? ",alimiter=limit=0.97:attack=5:release=50:level=disabled" : ""}`, format, bitrate, `${db > 0 ? "+" : ""}${db}dB`, undefined, "Changing volume…"), { requireAudio: true });
  return (
    <VideoShell
      tool={t}
      kind="audio"
      runLabel={`Apply ${db > 0 ? "+" : ""}${db} dB`}
      onRun={run}
      canRun={db !== 0}
      resultLabel="Audio"
      settings={
        <div className="space-y-4">
          <Slider label="Volume change" value={db} min={-30} max={30} step={1} onChange={setDb} format={(v) => `${v > 0 ? "+" : ""}${v} dB (${Math.round(10 ** (v / 20) * 100)}%)`} />
          <Checkbox label="Prevent clipping (limiter)" description="Stops loud peaks from distorting when boosting" checked={limit} onChange={setLimit} />
          <OutputSettings format={format} setFormat={setFormat} bitrate={bitrate} setBitrate={setBitrate} />
        </div>
      }
    />
  );
}

/** Audio Normalizer: two-pass EBU R128 loudness (loudnorm) or peak normalisation. */
export function AudioNormalize(_: ToolComponentProps) {
  const t = useVideoTool("audio");
  const [mode, setMode] = useState<"loudness" | "peak">("loudness");
  const [target, setTarget] = useState(-16);
  const [peakDb, setPeakDb] = useState(-1);
  const [format, setFormat] = useState<AudioFormat | "same">("same");
  const [bitrate, setBitrate] = useState(192);
  const run = () =>
    t.run(
      async (j) => {
        const { s, input, probe } = j;
        const d = probe.duration;
        if (mode === "peak") {
          const start = s.logs.length;
          await s.exec(["-i", input, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"], { duration: d, span: [0, 0.4], label: "Measuring peak level…" });
          const m = s.logs.slice(start).join("\n").match(/max_volume:\s*(-?[\d.]+) dB/);
          if (!m) throw new Error("Could not measure the audio level.");
          const gain = peakDb - Number(m[1]);
          const r = await filterJob(j, `volume=${gain.toFixed(2)}dB`, format, bitrate, "normalized", d, "Applying gain…");
          return { ...r, note: `Peak was ${Number(m[1]).toFixed(1)} dBFS; applied ${gain >= 0 ? "+" : ""}${gain.toFixed(1)} dB.` };
        }
        const start = s.logs.length;
        await s.exec(["-i", input, "-map", "0:a:0", "-af", `loudnorm=I=${target}:TP=-1.5:LRA=11:print_format=json`, "-f", "null", "-"], { duration: d, span: [0, 0.45], label: "Pass 1: measuring loudness…" });
        const log = s.logs.slice(start).join("\n");
        const json = log.slice(log.lastIndexOf("{"), log.lastIndexOf("}") + 1);
        let m: Record<string, string>;
        try {
          m = JSON.parse(json);
        } catch {
          throw new Error("Could not measure loudness (the file may be silent or too short).");
        }
        if (!Number.isFinite(Number(m.input_i))) throw new Error("The audio is silent, so there is nothing to normalise.");
        const filter = `loudnorm=I=${target}:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=${(await import("@/lib/processors/media/probe")).firstAudio(probe)?.sampleRate ?? 48000}`;
        const a = await import("@/lib/processors/audio/args");
        const fmtKey = resolveFormat(format, j.file.name);
        const fmt = a.AUDIO_FORMATS[fmtKey];
        const out = `out.${fmt.ext}`;
        await s.exec(a.audioFilterArgs(input, out, filter, fmtKey, { bitrate }), { duration: d, span: [0.45, 1], label: "Pass 2: normalising…" });
        return { blob: await s.readBlob(out, fmt.mime), name: `${baseOf(j.file.name)}-normalized.${fmt.ext}`, note: `Measured ${Number(m.input_i).toFixed(1)} LUFS (true peak ${Number(m.input_tp).toFixed(1)} dBTP) → target ${target} LUFS.` };
      },
      { requireAudio: true },
    );
  return (
    <VideoShell
      tool={t}
      kind="audio"
      runLabel="Normalize audio"
      onRun={run}
      resultLabel="Normalized audio"
      settings={
        <div className="space-y-4">
          <Segmented label="Method" value={mode} onChange={setMode} options={[{ value: "loudness", label: "Loudness (LUFS)" }, { value: "peak", label: "Peak level" }]} />
          {mode === "loudness" ? (
            <Field label="Target loudness" hint="EBU R128, two-pass">{(id) => <Select id={id} value={target} onChange={(e) => setTarget(Number(e.target.value))}><option value={-14}>−14 LUFS (Spotify, YouTube)</option><option value={-16}>−16 LUFS (Apple Music, podcasts)</option><option value={-19}>−19 LUFS (mono podcasts)</option><option value={-23}>−23 LUFS (EBU broadcast)</option></Select>}</Field>
          ) : (
            <Slider label="Target peak" value={peakDb} min={-12} max={0} step={0.5} onChange={setPeakDb} format={(v) => `${v} dBFS`} />
          )}
          <OutputSettings format={format} setFormat={setFormat} bitrate={bitrate} setBitrate={setBitrate} />
        </div>
      }
    />
  );
}

/** Audio Reverse: plays the whole file backwards. */
export function AudioReverse(_: ToolComponentProps) {
  const t = useVideoTool("audio");
  const [format, setFormat] = useState<AudioFormat | "same">("same");
  const [bitrate, setBitrate] = useState(192);
  const tooLong = (t.meta?.duration ?? 0) > 1800;
  const run = () => t.run((j) => filterJob(j, "areverse", format, bitrate, "reversed", undefined, "Reversing…"), { requireAudio: true });
  return (
    <VideoShell
      tool={t}
      kind="audio"
      runLabel="Reverse audio"
      onRun={run}
      canRun={!tooLong}
      resultLabel="Reversed audio"
      before={<Waveform file={t.file} playerRef={t.playerRef} />}
      settings={
        <div className="space-y-3">
          <OutputSettings format={format} setFormat={setFormat} bitrate={bitrate} setBitrate={setBitrate} />
          {tooLong ? <p className="text-sm text-warning">Files over 30 minutes can exhaust browser memory when reversed. Trim the audio first.</p> : null}
        </div>
      }
    />
  );
}

/** FFmpeg filter chain equivalent to the 10-band EQ (shelves at the ends, peaking in between). */
function eqFilter(gains: number[]): string {
  const parts = EQ_BANDS.map((b, i) => {
    const g = gains[i];
    if (!g) return null;
    if (b.type === "lowshelf") return `bass=g=${g}:f=${b.frequency}:t=q:w=0.707`;
    if (b.type === "highshelf") return `treble=g=${g}:f=${b.frequency}:t=q:w=0.707`;
    return `equalizer=f=${b.frequency}:t=q:w=${b.q}:g=${g}`;
  }).filter(Boolean) as string[];
  const head = eqHeadroom(gains);
  if (head > 0) parts.unshift(`volume=${(-head).toFixed(1)}dB`);
  return parts.join(",") || "anull";
}

const CURVE_F = logFrequencies(120);

function EqCurve({ gains }: { gains: number[] }) {
  const resp = eqResponse(gains, CURVE_F);
  const W = 600;
  const H = 120;
  const y = (db: number) => H / 2 - (Math.max(-15, Math.min(15, db)) / 15) * (H / 2 - 6);
  const d = resp.map((v, i) => `${i ? "L" : "M"}${((i / (resp.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full rounded-lg border border-border bg-card" role="img" aria-label="Equalizer frequency response">
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="stroke-border" strokeDasharray="4 4" />
      <path d={d} fill="none" className="stroke-accent" strokeWidth={2.5} />
    </svg>
  );
}

/** Audio Equalizer: 10-band graphic EQ with presets and a live frequency-response curve. */
export function AudioEqualizer(_: ToolComponentProps) {
  const t = useVideoTool("audio");
  const [gains, setGains] = useState<number[]>(EQ_PRESETS.flat.gains);
  const [preset, setPreset] = useState("flat");
  const [format, setFormat] = useState<AudioFormat | "same">("same");
  const [bitrate, setBitrate] = useState(192);
  const flat = gains.every((g) => g === 0);
  const run = () => t.run((j) => filterJob(j, eqFilter(gains), format, bitrate, "eq", undefined, "Applying equalizer…"), { requireAudio: true });
  return (
    <VideoShell
      tool={t}
      kind="audio"
      runLabel="Apply equalizer"
      onRun={run}
      canRun={!flat}
      resultLabel="Equalized audio"
      settings={
        <div className="space-y-4">
          <Field label="Preset">{(id) => <Select id={id} value={preset} onChange={(e) => (setPreset(e.target.value), setGains(EQ_PRESETS[e.target.value].gains))}>{Object.entries(EQ_PRESETS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}{preset === "custom" ? <option value="custom">Custom</option> : null}</Select>}</Field>
          <EqCurve gains={gains} />
          <div className="grid grid-cols-5 gap-x-4 gap-y-3 sm:grid-cols-10">
            {EQ_BANDS.map((b, i) => (
              <label key={b.frequency} className="flex flex-col items-center gap-1 text-[11px] text-fg-muted">
                <span className="font-mono text-fg">{gains[i] > 0 ? "+" : ""}{gains[i]}</span>
                <input
                  type="range"
                  aria-label={`${b.label} Hz gain`}
                  min={EQ_MIN_DB}
                  max={EQ_MAX_DB}
                  step={1}
                  value={gains[i]}
                  onChange={(e) => {
                    const g = [...gains];
                    g[i] = Number(e.target.value);
                    setGains(g);
                    setPreset("custom");
                  }}
                  className="h-24 cursor-pointer accent-[var(--accent)] [writing-mode:vertical-lr] [direction:rtl]"
                />
                <span>{b.label}</span>
              </label>
            ))}
          </div>
          {eqHeadroom(gains) > 0 ? <p className="text-xs text-fg-muted">Overall level is lowered by {eqHeadroom(gains).toFixed(1)} dB to make room for the boost and avoid clipping.</p> : null}
          <OutputSettings format={format} setFormat={setFormat} bitrate={bitrate} setBitrate={setBitrate} />
        </div>
      }
    />
  );
}
