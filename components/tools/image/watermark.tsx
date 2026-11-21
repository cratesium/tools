"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Segmented, Select, Slider } from "@/components/ui/field";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResults, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import type { OutputFormat } from "@/lib/processors/image/formats";
import { useTask } from "@/lib/utils/hooks";
import { CompareView, FormatSelect, IMAGE_ACCEPT, MAX_IMAGE_BYTES, decodeAny, inferFormat } from "./common";

const POSITIONS = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"] as const;
type Pos = (typeof POSITIONS)[number];

export default function ImageWatermark(_props: ToolComponentProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [kind, setKind] = useState<"text" | "logo">("text");
  const [text, setText] = useState("© Your Name");
  const [logo, setLogo] = useState<File | null>(null);
  const [color, setColor] = useState("#ffffff");
  const [size, setSize] = useState(5);
  const [opacity, setOpacity] = useState(50);
  const [pos, setPos] = useState<Pos>("bottom-right");
  const [tile, setTile] = useState(false);
  const [angle, setAngle] = useState(-30);
  const [shadow, setShadow] = useState(true);
  const [format, setFormat] = useState<OutputFormat | "keep">("keep");
  const task = useTask<{ name: string; blob: Blob; original: File }[]>();

  const run = () =>
    task.run(async (ctx) => {
      const { createCanvas, context2d, encodeCanvas, outputName } = await import("@/lib/processors/image/canvas");
      const mark = kind === "logo" && logo ? await decodeAny(logo) : null;
      if (kind === "logo" && !mark) throw new Error("Choose a logo image.");
      if (kind === "text" && !text.trim()) throw new Error("Enter watermark text.");
      const out = [];
      try {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const img = await decodeAny(f);
          try {
            const c = createCanvas(img.width, img.height);
            const g = context2d(c);
            g.drawImage(img.source, 0, 0);
            const unit = Math.min(img.width, img.height);
            const pad = unit * 0.03;
            g.globalAlpha = opacity / 100;
            let mw: number, mh: number;
            if (mark) {
              mw = (unit * size * 4) / 100;
              mh = (mark.height / mark.width) * mw;
            } else {
              g.font = `600 ${Math.max(10, (unit * size) / 100)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
              mw = g.measureText(text).width;
              mh = (unit * size) / 100;
            }
            const draw = (x: number, y: number) => {
              if (mark) g.drawImage(mark.source, x, y, mw, mh);
              else {
                g.fillStyle = color;
                g.textBaseline = "top";
                if (shadow) {
                  g.shadowColor = "rgba(0,0,0,0.45)";
                  g.shadowBlur = mh * 0.15;
                }
                g.fillText(text, x, y);
              }
            };
            if (tile) {
              g.save();
              g.translate(img.width / 2, img.height / 2);
              g.rotate((angle * Math.PI) / 180);
              const stepX = mw * 1.8;
              const stepY = mh * 3.5;
              const R = Math.hypot(img.width, img.height);
              for (let y = -R; y < R; y += stepY) for (let x = -R; x < R; x += stepX) draw(x, y);
              g.restore();
            } else {
              const col = pos.includes("left") ? 0 : pos.includes("right") ? 2 : 1;
              const row = pos.startsWith("top") ? 0 : pos.startsWith("bottom") ? 2 : 1;
              const x = col === 0 ? pad : col === 2 ? img.width - mw - pad : (img.width - mw) / 2;
              const y = row === 0 ? pad : row === 2 ? img.height - mh - pad : (img.height - mh) / 2;
              draw(x, y);
            }
            const fmt = inferFormat(f, format);
            out.push({ name: outputName(f.name, fmt, "-watermarked"), blob: await encodeCanvas(c, { format: fmt, quality: 0.92 }), original: f });
          } finally {
            img.close();
          }
          ctx.progress((i + 1) / files.length);
        }
      } finally {
        mark?.close();
      }
      return out;
    });

  return (
    <div className="space-y-4">
      <Dropzone multiple accept={IMAGE_ACCEPT} maxSize={MAX_IMAGE_BYTES} formatsLabel="Photos to watermark" onFiles={(f) => (setFiles((p) => [...p, ...f]), task.reset())} />
      <FileList files={files} onRemove={(i) => setFiles((p) => p.filter((_, j) => j !== i))} onClear={() => (setFiles([]), task.reset())} />
      <Panel title="Watermark">
        <div className="space-y-4">
          <Segmented label="Type" value={kind} onChange={setKind} options={[{ value: "text", label: "Text" }, { value: "logo", label: "Logo image" }]} />
          {kind === "text" ? (
            <Settings>
              <Field label="Text">{(id) => <Input id={id} value={text} onChange={(e) => setText(e.target.value)} data-testid="input" />}</Field>
              <Field label="Colour">{(id) => <Input id={id} type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-20 p-1" />}</Field>
              <div className="pt-6"><Checkbox label="Soft shadow for legibility" checked={shadow} onChange={setShadow} /></div>
            </Settings>
          ) : logo ? (
            <FileList files={[logo]} onClear={() => setLogo(null)} />
          ) : (
            <Dropzone accept="image/png,image/webp,image/svg+xml,image/jpeg" formatsLabel="Logo (transparent PNG recommended)" onFiles={([f]) => setLogo(f)} />
          )}
          <Settings>
            <Slider label="Size" value={size} min={1} max={25} onChange={setSize} format={(v) => `${v}%`} />
            <Slider label="Opacity" value={opacity} min={5} max={100} onChange={setOpacity} format={(v) => `${v}%`} />
            <FormatSelect value={format} onChange={setFormat} />
          </Settings>
          <Checkbox label="Repeat across the whole image (tiled)" checked={tile} onChange={setTile} />
          {tile ? (
            <Slider label="Tile angle" value={angle} min={-90} max={90} onChange={setAngle} format={(v) => `${v}°`} />
          ) : (
            <Field label="Position" className="max-w-xs">
              {(id) => (
                <Select id={id} value={pos} onChange={(e) => setPos(e.target.value as Pos)}>
                  {POSITIONS.map((p) => <option key={p} value={p}>{p.replace("-", " ")}</option>)}
                </Select>
              )}
            </Field>
          )}
        </div>
      </Panel>
      <ActionBar onRun={run} runLabel="Add watermark" running={task.running} disabled={!files.length} onReset={() => (setFiles([]), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label="Watermarking…" />
      <ErrorMessage error={task.error} />
      {task.result?.length ? (
        <>
          <CompareView before={task.result[0].original} after={task.result[0].blob} />
          <FileResults files={task.result} zipName="watermarked-images.zip" label="Watermarked images" />
        </>
      ) : null}
    </div>
  );
}
