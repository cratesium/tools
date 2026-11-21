"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Select, Slider } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Settings } from "@/components/tools/shared";
import { formatTimecode } from "@/lib/processors/media/timecode";
import { TimeField, baseOf, seconds } from "./media-common";
import { VideoShell, useVideoTool } from "./shell";

/** Video to GIF: palette-optimised GIF from a section of the video. */
export function VideoToGif(_: ToolComponentProps) {
  const t = useVideoTool();
  const [start, setStart] = useState("0");
  const [len, setLen] = useState("5");
  const [fps, setFps] = useState(12);
  const [width, setWidth] = useState(480);
  const [loop, setLoop] = useState(0);
  const [colors, setColors] = useState(256);
  const [dither, setDither] = useState<"sierra2_4a" | "bayer" | "floyd_steinberg" | "none">("sierra2_4a");
  const d = Number(len);
  const long = d > 30;

  const run = () =>
    t.run(async ({ s, input, file }) => {
      const a = await import("@/lib/processors/video/args");
      if (!(d > 0)) throw new Error("Enter a duration in seconds.");
      await s.exec(a.videoToGifArgs(input, "out.gif", { fps, width, start: seconds(start), duration: d, loop, colors, dither }), { duration: d, label: "Creating GIF…" });
      return { blob: await s.readBlob("out.gif", "image/gif"), name: `${baseOf(file.name)}.gif` };
    });

  return (
    <VideoShell
      tool={t}
      runLabel="Create GIF"
      onRun={run}
      canRun={d > 0}
      resultLabel="GIF"
      settings={
        <div className="space-y-4">
          <Settings>
            <TimeField label="Start" value={start} onChange={setStart} playerRef={t.playerRef} />
            <Field label="Duration (seconds)" hint={t.meta?.duration ? `Video ${formatTimecode(t.meta.duration, 1)}` : undefined}>{(id) => <Input id={id} type="number" min={0.5} step={0.5} value={len} onChange={(e) => setLen(e.target.value)} />}</Field>
            <Field label="Width">{(id) => <Select id={id} value={width} onChange={(e) => setWidth(Number(e.target.value))}>{[240, 320, 480, 640, 800].map((w) => <option key={w} value={w}>{w}px</option>)}<option value={0}>Original</option></Select>}</Field>
            <Field label="Loop">{(id) => <Select id={id} value={loop} onChange={(e) => setLoop(Number(e.target.value))}><option value={0}>Forever</option><option value={-1}>Play once</option><option value={2}>3 times</option></Select>}</Field>
            <Field label="Dithering">{(id) => <Select id={id} value={dither} onChange={(e) => setDither(e.target.value as typeof dither)}><option value="sierra2_4a">Smooth (Sierra)</option><option value="floyd_steinberg">Floyd–Steinberg</option><option value="bayer">Pattern (smaller)</option><option value="none">None (smallest)</option></Select>}</Field>
          </Settings>
          <Slider label="Frame rate" value={fps} min={5} max={30} onChange={setFps} format={(v) => `${v} fps`} />
          <Slider label="Colours" value={colors} min={16} max={256} step={16} onChange={setColors} />
          {long ? <Alert tone="warning">GIFs longer than 30 seconds get very large. Consider a shorter section, a lower frame rate or a smaller width.</Alert> : null}
        </div>
      }
    />
  );
}

/** GIF to Video: MP4 (H.264) or WebM, optionally looped several times. */
export function GifToVideo(_: ToolComponentProps) {
  const t = useVideoTool();
  const [format, setFormat] = useState<"mp4" | "webm">("mp4");
  const [loops, setLoops] = useState(1);
  const run = () =>
    t.run(
      async ({ s, input, file, probe }) => {
        const a = await import("@/lib/processors/video/args");
        const out = `out.${format}`;
        await s.exec(a.gifToVideoArgs(input, out, format, loops), { duration: probe.duration ? probe.duration * loops : undefined, label: `Converting to ${format.toUpperCase()}…` });
        return { blob: await s.readBlob(out, format === "mp4" ? "video/mp4" : "video/webm"), name: `${baseOf(file.name)}.${format}` };
      },
      { requireVideo: true },
    );
  return (
      <VideoShell
        tool={t}
        showPlayer={false}
        accept="image/gif,.gif"
        formatsLabel="Animated GIF files"
        runLabel={`Convert to ${format.toUpperCase()}`}
        onRun={run}
        resultLabel="Video"
        before={
          t.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.url} alt="GIF preview" className="mx-auto max-h-[360px] rounded-lg border border-border" />
          ) : null
        }
        settings={
          <Settings>
            <Field label="Format">{(id) => <Select id={id} value={format} onChange={(e) => setFormat(e.target.value as "mp4" | "webm")}><option value="mp4">MP4 (H.264)</option><option value="webm">WebM (VP8)</option></Select>}</Field>
            <Field label="Repeat">{(id) => <Select id={id} value={loops} onChange={(e) => setLoops(Number(e.target.value))}>{[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n === 1 ? "Once" : `${n} times`}</option>)}</Select>}</Field>
          </Settings>
        }
      />
  );
}
