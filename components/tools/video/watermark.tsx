"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Segmented, Select, Slider } from "@/components/ui/field";
import { Settings } from "@/components/tools/shared";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import type { Corner } from "@/lib/processors/video/args";
import { baseOf } from "./media-common";
import { VideoShell, useVideoTool } from "./shell";

/** Renders text to a transparent PNG (FFmpeg.wasm has no fonts, so text is rasterised in the browser). */
async function textPng(text: string, size: number, color: string, opacity: number, shadow: boolean): Promise<Uint8Array> {
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const font = `600 ${size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  g.font = font;
  const lines = text.split("\n");
  const w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width))) + size;
  const lh = Math.round(size * 1.25);
  c.width = Math.max(2, w);
  c.height = Math.max(2, lh * lines.length + size / 2);
  g.font = font;
  g.textBaseline = "top";
  g.globalAlpha = opacity;
  if (shadow) {
    g.shadowColor = "rgba(0,0,0,0.6)";
    g.shadowBlur = size / 8;
    g.shadowOffsetY = size / 16;
  }
  g.fillStyle = color;
  lines.forEach((l, i) => g.fillText(l, size / 2, size / 4 + i * lh));
  const blob = await new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error("Could not render text."))), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Image logo → PNG at the requested width and opacity. */
async function logoPng(file: File, width: number, opacity: number): Promise<Uint8Array> {
  const bmp = await createImageBitmap(file);
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round((bmp.height / bmp.width) * w));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.globalAlpha = opacity;
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error("Could not process the logo."))), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

export default function VideoWatermark(_: ToolComponentProps) {
  const t = useVideoTool();
  const [kind, setKind] = useState<"text" | "image">("text");
  const [text, setText] = useState("© My Channel");
  const [logo, setLogo] = useState<File | null>(null);
  const [pos, setPos] = useState<Corner>("bottom-right");
  const [scale, setScale] = useState(5);
  const [opacity, setOpacity] = useState(0.8);
  const [color, setColor] = useState("#ffffff");
  const [margin, setMargin] = useState(3);

  const run = () =>
    t.run(async ({ s, input, file, probe }) => {
      const a = await import("@/lib/processors/video/args");
      const { firstVideo, displaySize } = await import("@/lib/processors/media/probe");
      const v = firstVideo(probe)!;
      const size = displaySize(v) ?? { width: v.width ?? 1280, height: v.height ?? 720 };
      const short = Math.min(size.width, size.height);
      let png: Uint8Array;
      if (kind === "text") {
        if (!text.trim()) throw new Error("Enter watermark text.");
        png = await textPng(text, Math.max(10, Math.round((short * scale) / 100)), color, opacity, true);
      } else {
        if (!logo) throw new Error("Add a logo image.");
        png = await logoPng(logo, (size.width * scale * 3) / 100, opacity);
      }
      const wm = await s.writeBytes("wm.png", png);
      await s.exec(a.watermarkArgs(input, wm, "out.mp4", pos, Math.round((short * margin) / 100)), { duration: probe.duration, label: "Adding watermark…" });
      return { blob: await s.readBlob("out.mp4", "video/mp4"), name: `${baseOf(file.name)}-watermarked.mp4` };
    });

  return (
    <VideoShell
      tool={t}
      runLabel="Add watermark"
      onRun={run}
      canRun={kind === "text" ? !!text.trim() : !!logo}
      resultLabel="Watermarked video"
      settings={
        <div className="space-y-4">
          <Segmented label="Watermark type" value={kind} onChange={setKind} options={[{ value: "text", label: "Text" }, { value: "image", label: "Logo image" }]} />
          {kind === "text" ? (
            <Settings>
              <Field label="Text">{(id) => <Input id={id} value={text} onChange={(e) => setText(e.target.value)} maxLength={120} />}</Field>
              <Field label="Colour">{(id) => <Input id={id} type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 p-1" />}</Field>
            </Settings>
          ) : logo ? (
            <FileList files={[logo]} onClear={() => setLogo(null)} />
          ) : (
            <Dropzone accept="image/png,image/jpeg,image/webp,image/svg+xml" formatsLabel="PNG with transparency works best" onFiles={(f) => setLogo(f[0])} />
          )}
          <Settings>
            <Field label="Position">{(id) => <Select id={id} value={pos} onChange={(e) => setPos(e.target.value as Corner)}><option value="top-left">Top left</option><option value="top-right">Top right</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option><option value="center">Centre</option></Select>}</Field>
          </Settings>
          <Slider label="Size" value={scale} min={2} max={20} onChange={setScale} format={(v) => `${v}%`} />
          <Slider label="Opacity" value={opacity} min={0.1} max={1} step={0.05} onChange={setOpacity} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Margin" value={margin} min={0} max={10} onChange={setMargin} format={(v) => `${v}%`} />
        </div>
      }
    />
  );
}
