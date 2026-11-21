"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Segmented, Select } from "@/components/ui/field";
import { Settings } from "@/components/tools/shared";
import { formatBytes } from "@/lib/utils/format";
import type { Quality, X264Preset } from "@/lib/processors/video/args";
import { baseOf } from "./media-common";
import { VideoShell, useVideoTool } from "./shell";

/** Video Compressor: CRF quality presets or a target file size (bitrate calculated from duration). */
export default function VideoCompress(_: ToolComponentProps) {
  const t = useVideoTool();
  const [mode, setMode] = useState<"quality" | "size">("quality");
  const [quality, setQuality] = useState<Quality>("balanced");
  const [targetMB, setTargetMB] = useState("10");
  const [maxHeight, setMaxHeight] = useState(0);
  const [audioKbps, setAudioKbps] = useState(96);
  const [noAudio, setNoAudio] = useState(false);
  const [container, setContainer] = useState<"mp4" | "webm">("mp4");
  const [preset, setPreset] = useState<X264Preset>("veryfast");

  const run = () =>
    t.run(async ({ s, input, probe, file }) => {
      const a = await import("@/lib/processors/video/args");
      const duration = probe.duration ?? t.meta?.duration;
      let videoKbps: number | undefined;
      if (mode === "size") {
        const mb = Number(targetMB);
        if (!duration) throw new Error("Could not read the video duration, so a target size cannot be calculated. Use quality mode.");
        const k = a.targetVideoKbps(mb, duration, noAudio ? 0 : audioKbps);
        if (k == null) throw new Error(`${mb} MB is too small for a ${Math.round(duration)}-second video. Try a larger target or a lower resolution.`);
        videoKbps = k;
      }
      const out = `out.${container}`;
      await s.exec(a.compressArgs({ input, output: out, container, quality, preset, maxHeight: maxHeight || undefined, audioKbps, videoKbps, noAudio }), { duration, label: "Compressing…" });
      const blob = await s.readBlob(out, container === "mp4" ? "video/mp4" : "video/webm");
      let note = videoKbps ? `Encoded at ${videoKbps} kbit/s video to target about ${targetMB} MB.` : undefined;
      if (blob.size >= file.size && mode === "quality") {
        note = `The compressed file (${formatBytes(blob.size)}) was not smaller than the original, so try "Smaller file" quality or a lower resolution.`;
      }
      return { blob, name: `${baseOf(file.name)}-compressed.${container}`, note };
    });

  return (
    <VideoShell
      tool={t}
      runLabel="Compress video"
      onRun={run}
      canRun={mode === "quality" || Number(targetMB) > 0}
      resultLabel="Compressed video"
      settings={
        <div className="space-y-4">
          <Segmented label="Mode" value={mode} onChange={setMode} options={[{ value: "quality", label: "By quality" }, { value: "size", label: "Target file size" }]} />
          <Settings>
            {mode === "quality" ? (
              <Field label="Quality">{(id) => <Select id={id} value={quality} onChange={(e) => setQuality(e.target.value as Quality)}><option value="high">High (light compression)</option><option value="balanced">Balanced</option><option value="small">Smallest file</option></Select>}</Field>
            ) : (
              <Field label="Target size (MB)" hint={t.meta ? `Original ${formatBytes(t.file?.size ?? 0)}` : undefined}>{(id) => <Input id={id} type="number" min={1} step={1} value={targetMB} onChange={(e) => setTargetMB(e.target.value)} />}</Field>
            )}
            <Field label="Max resolution">{(id) => <Select id={id} value={maxHeight} onChange={(e) => setMaxHeight(Number(e.target.value))}><option value={0}>Keep original</option>{[1080, 720, 540, 480, 360].map((h) => <option key={h} value={h}>{h}p</option>)}</Select>}</Field>
            <Field label="Audio bitrate">{(id) => <Select id={id} value={audioKbps} disabled={noAudio} onChange={(e) => setAudioKbps(Number(e.target.value))}>{[64, 96, 128, 160].map((k) => <option key={k} value={k}>{k} kbit/s</option>)}</Select>}</Field>
            <Field label="Format">{(id) => <Select id={id} value={container} onChange={(e) => setContainer(e.target.value as "mp4" | "webm")}><option value="mp4">MP4 (H.264, fastest)</option><option value="webm">WebM (VP8, slow)</option></Select>}</Field>
            {container === "mp4" ? (
              <Field label="Speed">{(id) => <Select id={id} value={preset} onChange={(e) => setPreset(e.target.value as X264Preset)}><option value="ultrafast">Fastest (larger)</option><option value="veryfast">Fast</option><option value="fast">Slower (smaller)</option><option value="medium">Slowest (smallest)</option></Select>}</Field>
            ) : null}
          </Settings>
          <Checkbox label="Remove audio" checked={noAudio} onChange={setNoAudio} />
        </div>
      }
    />
  );
}
