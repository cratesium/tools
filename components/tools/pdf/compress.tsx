"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Segmented, Slider } from "@/components/ui/field";
import { Alert, Stat } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import type { CompressReport } from "@/lib/processors/pdf/compress";
import { formatBytes } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";
import { PdfPicker, outName, usePdfLoader } from "./common";
import { PdfOutput } from "./helpers";

const LEVELS = { low: { q: 0.82, dpi: 200 }, medium: { q: 0.7, dpi: 150 }, high: { q: 0.55, dpi: 110 }, extreme: { q: 0.4, dpi: 72 } } as const;

export default function CompressPdf(_props: ToolComponentProps) {
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [level, setLevel] = useState<keyof typeof LEVELS | "custom">("medium");
  const [q, setQ] = useState(70);
  const [dpi, setDpi] = useState(150);
  const [gray, setGray] = useState(false);
  const [strip, setStrip] = useState(true);
  const task = useTask<{ bytes: Uint8Array; report: CompressReport }>();
  const run = () =>
    task.run(async (ctx) => {
      if (!L) throw new Error("Add a PDF first.");
      const { compressPdf, canvasEncoder } = await import("@/lib/processors/pdf/compress");
      const p = level === "custom" ? { q: q / 100, dpi } : LEVELS[level];
      return compressPdf(L.bytes, { password: L.password, quality: p.q, maxDpi: p.dpi, grayscale: gray, stripMetadata: strip, encoder: canvasEncoder(), signal: ctx.signal, onProgress: (f, l) => ctx.progress(f, l) });
    });
  const r = task.result;
  const worse = r && r.bytes.byteLength >= (L?.file.size ?? 0);
  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      <Panel title="Compression level">
        <div className="space-y-4">
          <Segmented label="Level" value={level} onChange={setLevel} options={[{ value: "low", label: "Light" }, { value: "medium", label: "Recommended" }, { value: "high", label: "Strong" }, { value: "extreme", label: "Extreme" }, { value: "custom", label: "Custom" }]} />
          {level === "custom" ? (
            <Settings>
              <Slider label="Image quality" value={q} min={20} max={95} onChange={setQ} format={(v) => `${v}%`} />
              <Slider label="Max image resolution" value={dpi} min={50} max={300} step={10} onChange={setDpi} format={(v) => `${v} dpi`} />
            </Settings>
          ) : null}
          <div className="flex flex-wrap gap-5">
            <Checkbox label="Convert images to grayscale" checked={gray} onChange={setGray} />
            <Checkbox label="Remove metadata" checked={strip} onChange={setStrip} />
          </div>
        </div>
      </Panel>
      <ActionBar onRun={run} runLabel="Compress PDF" running={task.running} disabled={!L} onCancel={task.cancel} onReset={() => (loader.reset(), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {r && L ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Before" value={formatBytes(r.report.before)} />
            <Stat label="After" value={formatBytes(r.report.after)} />
            <Stat label="Saved" value={`${Math.max(0, (1 - r.report.after / r.report.before) * 100).toFixed(1)}%`} />
            <Stat label="Images recompressed" value={`${r.report.recompressed} / ${r.report.images}`} />
          </div>
          {worse ? (
            <Alert tone="warning" title="This PDF is already well optimised">The compressed version isn&apos;t smaller. Mostly-text PDFs or already-compressed images can&apos;t shrink much – keep your original.</Alert>
          ) : null}
          <PdfOutput bytes={r.bytes} name={outName(L.file.name, "-compressed")} original={L.file.size} label="Compressed PDF" />
        </>
      ) : null}
      <Alert tone="info">Compression re-encodes embedded images at lower resolution and quality and repacks the file structure. Text and vector graphics stay sharp and selectable.</Alert>
    </div>
  );
}
