"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Select } from "@/components/ui/field";
import { Settings } from "@/components/tools/shared";
import { aspectCrop, normalizeCrop, type CropRect } from "@/lib/processors/video/args";
import { baseOf } from "./media-common";
import { VideoShell, useVideoTool } from "./shell";

const ASPECTS: [string, number][] = [["16:9", 16 / 9], ["9:16", 9 / 16], ["1:1", 1], ["4:3", 4 / 3], ["4:5", 4 / 5], ["21:9", 21 / 9]];

/** Video Cropper: aspect-ratio presets or exact pixel rectangle, with a live overlay preview. */
export default function VideoCrop(_: ToolComponentProps) {
  const t = useVideoTool();
  const [preset, setPreset] = useState("custom");
  const [rect, setRect] = useState<CropRect | null>(null);
  const W = t.meta?.width ?? 0;
  const H = t.meta?.height ?? 0;
  const r = rect ?? (W && H ? { x: 0, y: 0, width: W, height: H } : null);
  const nr = r && W && H ? normalizeCrop(r, W, H) : null;

  const choose = (p: string) => {
    setPreset(p);
    const a = ASPECTS.find(([k]) => k === p);
    if (a && W && H) setRect(aspectCrop(W, H, a[1]));
  };
  const set = (k: keyof CropRect, v: string) => {
    setPreset("custom");
    setRect({ ...(r ?? { x: 0, y: 0, width: W, height: H }), [k]: Number(v) || 0 });
  };

  const run = () =>
    t.run(async ({ s, input, file }) => {
      if (!nr) throw new Error("Could not read the video dimensions.");
      const a = await import("@/lib/processors/video/args");
      await s.exec(a.cropArgs(input, "out.mp4", nr), { duration: t.meta?.duration, label: "Cropping…" });
      return { blob: await s.readBlob("out.mp4", "video/mp4"), name: `${baseOf(file.name)}-cropped.mp4`, note: `Cropped to ${nr.width}×${nr.height}.` };
    });

  return (
    <VideoShell
      tool={t}
      showPlayer={false}
      runLabel="Crop video"
      onRun={run}
      canRun={!!nr}
      resultLabel="Cropped video"
      before={
        t.url ? (
          <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-lg border border-border bg-black">
            <video src={t.url} controls playsInline className="block max-h-[420px] max-w-full" />
            {nr && W && H ? (
              <div
                aria-hidden
                className="pointer-events-none absolute border-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                style={{ left: `${(nr.x / W) * 100}%`, top: `${(nr.y / H) * 100}%`, width: `${(nr.width / W) * 100}%`, height: `${(nr.height / H) * 100}%` }}
              />
            ) : null}
          </div>
        ) : null
      }
      settings={
        <div className="space-y-4">
          <Field label="Aspect ratio">{(id) => <Select id={id} value={preset} onChange={(e) => choose(e.target.value)}><option value="custom">Custom</option>{ASPECTS.map(([k]) => <option key={k} value={k}>{k}</option>)}</Select>}</Field>
          <Settings>
            {(["x", "y", "width", "height"] as const).map((k) => (
              <Field key={k} label={k === "x" ? "Left (px)" : k === "y" ? "Top (px)" : k === "width" ? "Width (px)" : "Height (px)"}>{(id) => <Input id={id} type="number" min={0} value={r?.[k] ?? 0} onChange={(e) => set(k, e.target.value)} />}</Field>
            ))}
          </Settings>
          {W ? <p className="text-xs text-fg-muted">Source {W}×{H}. Values are snapped to even numbers{nr ? `: output ${nr.width}×${nr.height} at ${nr.x},${nr.y}` : ""}.</p> : null}
        </div>
      }
    />
  );
}
