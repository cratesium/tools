"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Settings } from "@/components/tools/shared";
import { formatBytes } from "@/lib/utils/format";
import { AUDIO_FORMATS, type AudioFormat } from "@/lib/processors/audio/args";
import { baseOf } from "../video/media-common";
import { VideoShell, useVideoTool } from "../video/shell";
import { BitrateSelect, FormatSelect } from "./common";

/**
 * Audio Converter (any → any) and fixed converters via processorOptions { to, from? }:
 * MP3/WAV converters, MP3↔WAV, M4A/AAC/FLAC/OGG to MP3. Tags and MP3 cover art are kept.
 */
export default function AudioConvert({ tool }: ToolComponentProps) {
  const fixed = tool.processorOptions?.to as AudioFormat | undefined;
  const from = tool.processorOptions?.from as string | undefined;
  const t = useVideoTool("audio");
  const [to, setTo] = useState<AudioFormat>(fixed ?? "mp3");
  const [bitrate, setBitrate] = useState(192);
  const [vbr, setVbr] = useState(false);
  const [rate, setRate] = useState(0);
  const [channels, setChannels] = useState(0);
  const [depth, setDepth] = useState<16 | 24>(16);
  const target = fixed ?? to;
  const fmt = AUDIO_FORMATS[target];
  const dur = t.meta?.duration;

  const run = () =>
    t.run(
      async ({ s, input, file, probe }) => {
        const a = await import("@/lib/processors/audio/args");
        const o = { bitrate, vbr, sampleRate: rate || undefined, channels: (channels || undefined) as 1 | 2 | undefined, bitDepth: depth };
        const out = `out.${fmt.ext}`;
        const cover = probe.streams.some((x) => x.attachedPic);
        const args = target === "mp3" && cover ? a.convertAudioArgs(input, out, target, o) : a.convertAudioArgsNoCover(input, out, target, o);
        await s.exec(args, { duration: probe.duration, label: `Converting to ${fmt.label}…` });
        return { blob: await s.readBlob(out, fmt.mime), name: `${baseOf(file.name)}.${fmt.ext}` };
      },
      { requireAudio: true },
    );

  return (
    <VideoShell
      tool={t}
      kind="audio"
      formatsLabel={from ? `${from.toUpperCase()} files` : undefined}
      runLabel={`Convert to ${fmt.label.split(" ")[0]}`}
      onRun={run}
      resultLabel="Converted audio"
      settings={
        <div className="space-y-4">
          <Settings>
            {!fixed ? <FormatSelect value={to} onChange={(v) => setTo(v as AudioFormat)} /> : null}
            {!fmt.lossless ? <BitrateSelect value={bitrate} onChange={setBitrate} /> : null}
            {target === "wav" ? <Field label="Bit depth">{(id) => <Select id={id} value={depth} onChange={(e) => setDepth(Number(e.target.value) as 16 | 24)}><option value={16}>16-bit (CD)</option><option value={24}>24-bit (studio)</option></Select>}</Field> : null}
            <Field label="Sample rate">{(id) => <Select id={id} value={rate} onChange={(e) => setRate(Number(e.target.value))}><option value={0}>Keep original</option>{[8000, 16000, 22050, 32000, 44100, 48000].map((r) => <option key={r} value={r}>{r.toLocaleString()} Hz</option>)}</Select>}</Field>
            <Field label="Channels">{(id) => <Select id={id} value={channels} onChange={(e) => setChannels(Number(e.target.value))}><option value={0}>Keep original</option><option value={2}>Stereo</option><option value={1}>Mono</option></Select>}</Field>
          </Settings>
          {target === "mp3" || target === "ogg" ? <Checkbox label="Variable bitrate (VBR)" description="Better quality per byte; the bitrate setting becomes a quality target" checked={vbr} onChange={setVbr} /> : null}
          {dur && !fmt.lossless ? <p className="text-xs text-fg-muted">Estimated size ≈ {formatBytes((dur * bitrate * 1000) / 8)} for {Math.round(dur)} s.</p> : null}
        </div>
      }
    />
  );
}
