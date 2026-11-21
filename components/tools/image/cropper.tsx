"use client";

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResult, Panel, Settings } from "@/components/tools/shared";
import { aspectPresets, centeredAspectRect, clampCrop, dragCrop, type Handle } from "@/lib/processors/image/geometry";
import type { Rect } from "@/lib/processors/image/pixels";
import type { OutputFormat } from "@/lib/processors/image/formats";
import { useObjectUrl, useTask } from "@/lib/utils/hooks";
import { FormatSelect, IMAGE_ACCEPT, MAX_IMAGE_BYTES, inferFormat, useDecoded } from "./common";
import { cn } from "@/lib/utils/cn";

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const POS: Record<string, string> = { nw: "-left-1.5 -top-1.5 cursor-nwse-resize", n: "left-1/2 -top-1.5 -translate-x-1/2 cursor-ns-resize", ne: "-right-1.5 -top-1.5 cursor-nesw-resize", e: "-right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize", se: "-right-1.5 -bottom-1.5 cursor-nwse-resize", s: "left-1/2 -bottom-1.5 -translate-x-1/2 cursor-ns-resize", sw: "-left-1.5 -bottom-1.5 cursor-nesw-resize", w: "-left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize" };

export default function ImageCropper(_props: ToolComponentProps) {
  const [file, setFile] = useState<File | null>(null);
  const { img, error } = useDecoded(file);
  const url = useObjectUrl(file);
  const [rect, setRect] = useState<Rect | null>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  const [format, setFormat] = useState<OutputFormat | "keep">("keep");
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: Handle; start: Rect; x: number; y: number } | null>(null);
  const task = useTask<Blob>();

  useEffect(() => {
    if (img) setRect(centeredAspectRect(img.width, img.height, img.width / img.height, 0.8)); // eslint-disable-line react-hooks/set-state-in-effect
  }, [img]);

  const scale = () => (box.current && img ? img.width / box.current.getBoundingClientRect().width : 1);
  const onDown = (e: RPointerEvent<HTMLElement>) => {
    if (!rect) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { handle: (e.currentTarget.dataset.handle as Handle) ?? "move", start: rect, x: e.clientX, y: e.clientY };
  };
  const onMove = (e: RPointerEvent) => {
    if (!drag.current || !img) return;
    const s = scale();
    setRect(dragCrop(drag.current.start, drag.current.handle, (e.clientX - drag.current.x) * s, (e.clientY - drag.current.y) * s, { width: img.width, height: img.height }, aspect));
  };
  const setAspectPreset = (a: number | null) => {
    setAspect(a);
    if (img && a) setRect(centeredAspectRect(img.width, img.height, a, 0.9));
  };
  const setNum = (k: keyof Rect, v: number) => img && rect && setRect(clampCrop({ ...rect, [k]: Math.round(v) }, img.width, img.height));

  const run = () =>
    task.run(async () => {
      if (!img || !rect || !file) throw new Error("Add an image first.");
      const { createCanvas, context2d, encodeCanvas } = await import("@/lib/processors/image/canvas");
      const c = createCanvas(rect.width, rect.height);
      context2d(c).drawImage(img.source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      return encodeCanvas(c, { format: inferFormat(file, format), quality: 0.92 });
    });

  return (
    <div className="space-y-4">
      {file ? <FileList files={[file]} onClear={() => (setFile(null), setRect(null), task.reset())} /> : <Dropzone accept={IMAGE_ACCEPT} maxSize={MAX_IMAGE_BYTES} formatsLabel="JPG, PNG, WebP, HEIC, GIF" onFiles={([f]) => (setFile(f), task.reset())} />}
      <ErrorMessage error={error} />
      {img && url && rect ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {aspectPresets.map((p) => (
              <Button key={p.label} size="sm" variant={aspect === p.value ? "primary" : "secondary"} onClick={() => setAspectPreset(p.value)}>
                {p.label}
              </Button>
            ))}
          </div>
          <div className="checkerboard flex justify-center rounded-xl border border-border p-2">
            <div ref={box} className="relative touch-none select-none" onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Image to crop" className="block max-h-[520px] max-w-full" draggable={false} />
              <div
                className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                style={{ left: `${(rect.x / img.width) * 100}%`, top: `${(rect.y / img.height) * 100}%`, width: `${(rect.width / img.width) * 100}%`, height: `${(rect.height / img.height) * 100}%` }}
                data-handle="move"
                onPointerDown={onDown}
              >
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="border border-white/30" />
                  ))}
                </div>
                {HANDLES.map((h) => (
                  <span key={h} data-handle={h} onPointerDown={onDown} className={cn("absolute h-3 w-3 rounded-sm border border-black/40 bg-white", POS[h])} />
                ))}
              </div>
            </div>
          </div>
          <Panel title="Crop area (pixels)">
            <Settings className="lg:grid-cols-5">
              {(["x", "y", "width", "height"] as const).map((k) => (
                <Field key={k} label={k === "x" ? "Left" : k === "y" ? "Top" : k[0].toUpperCase() + k.slice(1)}>
                  {(id) => <Input id={id} type="number" value={rect[k]} onChange={(e) => setNum(k, Number(e.target.value))} />}
                </Field>
              ))}
              <FormatSelect value={format} onChange={setFormat} />
            </Settings>
          </Panel>
        </>
      ) : null}
      <ActionBar onRun={run} runLabel="Crop image" running={task.running} disabled={!img} onReset={() => (setFile(null), setRect(null), task.reset())} />
      <ErrorMessage error={task.error} />
      {task.result && file ? <FileResult blob={task.result} filename={`${file.name.replace(/\.[^.]+$/, "")}-cropped.${task.result.type.split("/")[1].replace("jpeg", "jpg")}`} originalSize={file.size} label={`Cropped image (${rect?.width} × ${rect?.height})`} /> : null}
    </div>
  );
}
