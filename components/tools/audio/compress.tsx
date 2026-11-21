"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Settings } from "@/components/tools/shared";
import { formatBytes } from "@/lib/utils/format";
import { AUDIO_FORMATS } from "@/lib/processors/audio/args";
import { baseOf } from "../video/media-common";
import { VideoShell, useVideoTool } from "../video/shell";

type Target = "mp3" | "m4a" | "opus";

/** Audio Compressor: re-encodes at a lower bitrate (MP3, AAC or Opus), optionally mono and lower sample rate. */
export default function AudioCompress(_: ToolComponentProps) {
  const t = useVideoTool("audio");
  const [format, setFormat] = useState<Target>("mp3");
  const [bitrate, setBitrate] = useState(96);
  const [mono, setMono] = useState(false);
  const [voice, setVoice] = useState(false);
  const dur = t.meta?.duration;
  const est = dur ? (dur * bitrate * 1000) / 8 : null;

  const run = () =>
    t.run(
      async ({ s, input, file, probe }) => {
        const a = await import("@/lib/processors/audio/args");
        const fmt = a.AUDIO_FORMATS[format];
        const out = `out.${fmt.ext}`;
        await s.exec(a.convertAudioArgsNoCover(input, out, format, { bitrate, channels: mono ? 1 : undefined, sampleRate: voice ? (format === "opus" ? 48000 : 22050) : undefined }), { duration: probe.duration, label: "Compressing…" });
        const blob = await s.readBlob(out, fmt.mime);
        const note = blob.size >= file.size ? "The result is not smaller than the original, which is already compressed at a similar or lower bitrate. Try a lower bitrate or mono." : undefined;
        return { blob, name: `${baseOf(file.name)}-compressed.${fmt.ext}`, note };
      },
      { requireAudio: true },
    );

  return (
    <VideoShell
      tool={t}
      kind="audio"
      runLabel="Compress audio"
      onRun={run}
      resultLabel="Compressed audio"
      settings={
        <div className="space-y-4">
          <Settings>
            <Field label="Format">{(id) => <Select id={id} value={format} onChange={(e) => setFormat(e.target.value as Target)}><option value="mp3">MP3 (most compatible)</option><option value="m4a">M4A / AAC (better quality per byte)</option><option value="opus">Opus (best for speech, smallest)</option></Select>}</Field>
            <Field label="Bitrate">{(id) => <Select id={id} value={bitrate} onChange={(e) => setBitrate(Number(e.target.value))}>{[32, 48, 64, 96, 128, 160].map((b) => <option key={b} value={b}>{b} kbit/s{b === 64 ? " (speech)" : b === 128 ? " (music)" : ""}</option>)}</Select>}</Field>
          </Settings>
          <Checkbox label="Convert to mono" description="Halves the data needed; ideal for voice recordings and podcasts" checked={mono} onChange={setMono} />
          <Checkbox label="Voice mode (lower sample rate)" description="22 kHz is plenty for speech and frees bits for clarity" checked={voice} onChange={setVoice} />
          {est && t.file ? <p className="text-xs text-fg-muted">Estimated size ≈ {formatBytes(est)} (original {formatBytes(t.file.size)}) · {AUDIO_FORMATS[format].label}</p> : null}
        </div>
      }
    />
  );
}
