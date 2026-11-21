"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Segmented } from "@/components/ui/field";
import { ActionBar, ErrorMessage, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import type { CropMargins } from "@/lib/processors/pdf/organize";
import { useTask } from "@/lib/utils/hooks";
import { PageThumbnail, PdfPicker, outName, usePdfLoader } from "./common";
import { PdfOutput, pagesFrom } from "./helpers";

const UNITS = { mm: 72 / 25.4, in: 72, pt: 1 } as const;

export default function CropPdf(_props: ToolComponentProps) {
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [unit, setUnit] = useState<keyof typeof UNITS>("mm");
  const [m, setM] = useState<CropMargins>({ top: 10, right: 10, bottom: 10, left: 10 });
  const [pages, setPages] = useState("");
  const [media, setMedia] = useState(true);
  const task = useTask<Uint8Array>();
  const W = 220;
  const pct = (v: number, dim: "w" | "h") => `${Math.min(45, (v * UNITS[unit]) / (dim === "w" ? 595 : 842) * 100)}%`;
  const run = () =>
    task.run(async () => {
      if (!L) throw new Error("Add a PDF first.");
      const { cropPdf } = await import("@/lib/processors/pdf/organize");
      const f = UNITS[unit];
      return cropPdf(L.bytes, { top: m.top * f, right: m.right * f, bottom: m.bottom * f, left: m.left * f }, { pages: await pagesFrom(pages, L.pageCount), password: L.password, setMediaBox: media });
    });
  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      {L ? (
        <div className="grid gap-4 md:grid-cols-[auto_1fr]">
          <div className="relative mx-auto w-fit">
            <PageThumbnail doc={L.doc} pageNumber={1} width={W} />
            <div className="pointer-events-none absolute border-2 border-dashed border-danger bg-danger/5" style={{ top: pct(m.top, "h"), bottom: pct(m.bottom, "h"), left: pct(m.left, "w"), right: pct(m.right, "w") }} />
          </div>
          <Panel title="Margins to remove">
            <div className="space-y-4">
              <Segmented label="Unit" value={unit} onChange={setUnit} options={[{ value: "mm", label: "mm" }, { value: "in", label: "inches" }, { value: "pt", label: "points" }]} />
              <Settings className="lg:grid-cols-4">
                {(["top", "right", "bottom", "left"] as const).map((k) => (
                  <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>{(id) => <Input id={id} type="number" min={0} step="any" value={m[k]} onChange={(e) => setM((x) => ({ ...x, [k]: Math.max(0, Number(e.target.value) || 0) }))} data-testid={k === "top" ? "input" : undefined} />}</Field>
                ))}
              </Settings>
              <Field label="Pages" hint="empty = all" className="max-w-xs">{(id) => <Input id={id} value={pages} onChange={(e) => setPages(e.target.value)} />}</Field>
              <Checkbox label="Also shrink the page size (MediaBox)" description="Otherwise only the visible area (CropBox) changes, which some printers ignore" checked={media} onChange={setMedia} />
              <p className="text-xs text-fg-subtle">The preview outline is approximate (based on an A4 page); margins are applied as entered to each page.</p>
            </div>
          </Panel>
        </div>
      ) : null}
      <ActionBar onRun={run} runLabel="Crop PDF" running={task.running} disabled={!L} onReset={() => (loader.reset(), task.reset())} />
      <TaskProgress running={task.running} progress={null} label="Cropping…" />
      <ErrorMessage error={task.error} />
      {task.result && L ? <PdfOutput bytes={task.result} name={outName(L.file.name, "-cropped")} label="Cropped PDF" /> : null}
    </div>
  );
}
