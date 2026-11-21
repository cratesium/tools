"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Settings } from "@/components/tools/shared";
import { AUDIO_FORMATS, BITRATES, type AudioFormat } from "@/lib/processors/audio/args";
import { baseOf } from "./media-common";
import { VideoShell, useVideoTool } from "./shell";

/**
 * Video Audio Extractor (choose format, or copy the original track) and Video to MP3
 * (processorOptions { to: "mp3" }).
 */
export default function VideoExtractAudio({ tool }: ToolComponentProps) {
  const fixed = tool.processorOptions?.to as AudioFormat | undefined;
  const t = useVideoTool();
  const [format, setFormat] = useState<AudioFormat>(fixed ?? "mp3");
  const [bitrate, setBitrate] = useState(192);
  const [copy, setCopy] = useState(false);
  const target = fixed ?? format;
  const lossless = AUDIO_FORMATS[target].lossless;

  const run = () =>
    t.run(
      async ({ s, input, file, probe }) => {
        const v = await import("@/lib/processors/video/args");
        const a = await import("@/lib/processors/audio/args");
        const { firstAudio } = await import("@/lib/processors/media/probe");
        const track = firstAudio(probe)!;
        if (copy && !fixed) {
          const ext = v.audioCopyExtension(track.codec);
          if (ext) {
            const out = `out.${ext}`;
            await s.exec(v.extractAudioArgs(input, out, ["-c:a", "copy"]), { duration: probe.duration, label: "Copying audio track…" });
            return { blob: await s.readBlob(out, `audio/${ext === "m4a" ? "mp4" : ext}`), name: `${baseOf(file.name)}.${ext}`, note: `Original ${track.codec.toUpperCase()} track copied without re-encoding.` };
          }
        }
        const fmt = a.AUDIO_FORMATS[target];
        const out = `out.${fmt.ext}`;
        await s.exec(v.extractAudioArgs(input, out, a.audioCodecArgs(target, { bitrate })), { duration: probe.duration, label: `Extracting ${fmt.label}…` });
        return { blob: await s.readBlob(out, fmt.mime), name: `${baseOf(file.name)}.${fmt.ext}`, note: copy ? `The ${track.codec} track cannot be copied into a standalone file, so it was converted.` : undefined };
      },
      { requireAudio: true },
    );

  return (
    <VideoShell
      tool={t}
      runLabel={fixed ? "Convert to MP3" : "Extract audio"}
      onRun={run}
      resultLabel="Audio"
      settings={
        <div className="space-y-4">
          <Settings>
            {!fixed ? <Field label="Format">{(id) => <Select id={id} value={format} disabled={copy} onChange={(e) => setFormat(e.target.value as AudioFormat)}>{(Object.keys(AUDIO_FORMATS) as AudioFormat[]).map((k) => <option key={k} value={k}>{AUDIO_FORMATS[k].label}</option>)}</Select>}</Field> : null}
            {!lossless ? <Field label="Bitrate">{(id) => <Select id={id} value={bitrate} disabled={copy} onChange={(e) => setBitrate(Number(e.target.value))}>{BITRATES.map((b) => <option key={b} value={b}>{b} kbit/s{b === 192 ? " (recommended)" : ""}</option>)}</Select>}</Field> : null}
          </Settings>
          {!fixed ? <Checkbox label="Keep the original audio (no re-encoding)" description="Fastest and lossless; the file type depends on the video's audio codec" checked={copy} onChange={setCopy} /> : null}
        </div>
      }
    />
  );
}
