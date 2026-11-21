"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Segmented, Select, Slider } from "@/components/ui/field";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import type { FontChoice, WatermarkOptions } from "@/lib/processors/pdf/stamp";
import { useTask } from "@/lib/utils/hooks";
import { PdfPicker, outName, usePdfLoader } from "./common";
import { PdfOutput, ReplacedCharsNotice, pagesFrom } from "./helpers";

const POSITIONS: WatermarkOptions["position"][] = ["center", "tile", "top-left", "top-center", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-center", "bottom-right"];

export default function PdfWatermark(_props: ToolComponentProps) {
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [kind, setKind] = useState<"text" | "image">("text");
  const [text, setText] = useState("CONFIDENTIAL");
  const [font, setFont] = useState<FontChoice>("helvetica-bold");
  const [size, setSize] = useState(60);
  const [color, setColor] = useState("#9ca3af");
  const [img, setImg] = useState<File | null>(null);
  const [scale, setScale] = useState(40);
  const [opacity, setOpacity] = useState(30);
  const [angle, setAngle] = useState(45);
  const [pos, setPos] = useState<WatermarkOptions["position"]>("center");
  const [behind, setBehind] = useState(false);
  const [pages, setPages] = useState("");
  const task = useTask<{ bytes: Uint8Array; replacedChars: number }>();
  const run = () =>
    task.run(async () => {
      if (!L) throw new Error("Add a PDF first.");
      const { addWatermark } = await import("@/lib/processors/pdf/stamp");
      let image: WatermarkOptions["image"];
      if (kind === "image") {
        if (!img) throw new Error("Choose an image.");
        const bytes = new Uint8Array(await img.arrayBuffer());
        const mime = img.type === "image/png" ? "image/png" : "image/jpeg";
        if (!["image/png", "image/jpeg"].includes(img.type)) throw new Error("Use a PNG or JPG image.");
        image = { bytes, mime };
      }
      return addWatermark(L.bytes, { kind, text, font, fontSize: size, color, image, imageScale: scale / 100, opacity: opacity / 100, angle, position: pos, behind, pages: await pagesFrom(pages, L.pageCount), password: L.password });
    });
  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      <Panel title="Watermark">
        <div className="space-y-4">
          <Segmented label="Type" value={kind} onChange={setKind} options={[{ value: "text", label: "Text" }, { value: "image", label: "Image / logo" }]} />
          {kind === "text" ? (
            <Settings>
              <Field label="Text">{(id) => <Input id={id} value={text} onChange={(e) => setText(e.target.value)} data-testid="input" />}</Field>
              <Field label="Font">
                {(id) => (
                  <Select id={id} value={font} onChange={(e) => setFont(e.target.value as FontChoice)}>
                    <option value="helvetica">Helvetica</option>
                    <option value="helvetica-bold">Helvetica Bold</option>
                    <option value="times">Times</option>
                    <option value="times-bold">Times Bold</option>
                    <option value="courier">Courier</option>
                  </Select>
                )}
              </Field>
              <Field label="Colour">{(id) => <Input id={id} type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-20 p-1" />}</Field>
              <Slider label="Font size" value={size} min={10} max={200} onChange={setSize} format={(v) => `${v}pt`} />
            </Settings>
          ) : img ? (
            <FileList files={[img]} onClear={() => setImg(null)} />
          ) : (
            <Dropzone accept="image/png,image/jpeg" formatsLabel="PNG (transparent recommended) or JPG" onFiles={([f]) => setImg(f)} />
          )}
          {kind === "image" ? <Slider label="Image width" value={scale} min={5} max={100} onChange={setScale} format={(v) => `${v}% of page`} /> : null}
          <Settings>
            <Slider label="Opacity" value={opacity} min={5} max={100} onChange={setOpacity} format={(v) => `${v}%`} />
            <Slider label="Angle" value={angle} min={-90} max={90} onChange={setAngle} format={(v) => `${v}°`} />
            <Field label="Position">
              {(id) => (
                <Select id={id} value={pos} onChange={(e) => setPos(e.target.value as WatermarkOptions["position"])}>
                  {POSITIONS.map((p) => <option key={p} value={p}>{p === "tile" ? "Tiled across page" : p.replace("-", " ")}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Pages" hint="empty = all">{(id) => <Input id={id} value={pages} onChange={(e) => setPages(e.target.value)} placeholder="e.g. 1-3, odd" />}</Field>
            <div className="pt-6"><Checkbox label="Place behind page content" checked={behind} onChange={setBehind} /></div>
          </Settings>
        </div>
      </Panel>
      <ActionBar onRun={run} runLabel="Add watermark" running={task.running} disabled={!L} onReset={() => (loader.reset(), task.reset())} />
      <TaskProgress running={task.running} progress={null} label="Stamping pages…" />
      <ErrorMessage error={task.error} />
      {task.result && L ? (
        <PdfOutput bytes={task.result.bytes} name={outName(L.file.name, "-watermarked")} original={L.file.size} label="Watermarked PDF">
          <ReplacedCharsNotice count={task.result.replacedChars} />
        </PdfOutput>
      ) : null}
    </div>
  );
}
