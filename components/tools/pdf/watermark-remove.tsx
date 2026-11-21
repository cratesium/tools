"use client";

import { useEffect, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Alert, Stat } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, Panel, TaskProgress } from "@/components/tools/shared";
import type { RemoveWatermarkReport, WatermarkAnalysis } from "@/lib/processors/pdf/watermark-remove";
import { errorMessage, useTask } from "@/lib/utils/hooks";
import { PdfPicker, outName, usePdfLoader } from "./common";
import { PdfOutput } from "./helpers";

export default function RemovePdfWatermark(_props: ToolComponentProps) {
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [analysis, setAnalysis] = useState<{ for: Uint8Array; a: WatermarkAnalysis | null; error: string | null } | null>(null);
  const [annots, setAnnots] = useState(true);
  const [artifacts, setArtifacts] = useState(true);
  const [layers, setLayers] = useState<Record<string, boolean>>({});
  const [text, setText] = useState("");
  const task = useTask<{ bytes: Uint8Array; report: RemoveWatermarkReport }>();

  useEffect(() => {
    if (!L) return;
    let alive = true;
    import("@/lib/processors/pdf/watermark-remove")
      .then((m) => m.analyzeWatermarks(L.bytes, L.password))
      .then((a) => {
        if (!alive) return;
        setAnalysis({ for: L.bytes, a, error: null });
        setLayers(Object.fromEntries(a.layers.filter((l) => /water|draft|confidential|stamp|background/i.test(l.name)).map((l) => [l.ref, true])));
      })
      .catch((e) => alive && setAnalysis({ for: L.bytes, a: null, error: errorMessage(e) }));
    return () => {
      alive = false;
    };
  }, [L]);
  const a = analysis && L && analysis.for === L.bytes ? analysis.a : null;

  const run = () =>
    task.run(async () => {
      if (!L) throw new Error("Add a PDF first.");
      const { removeWatermarks } = await import("@/lib/processors/pdf/watermark-remove");
      return removeWatermarks(L.bytes, { password: L.password, removeAnnotations: annots, removeArtifacts: artifacts, layers: Object.keys(layers).filter((k) => layers[k]), text: text.trim() || undefined });
    });
  const removed = task.result ? Object.values(task.result.report).reduce((s, n) => s + n, 0) : 0;

  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      {analysis?.error ? <ErrorMessage error={analysis.error} /> : null}
      {a ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Watermark annotations" value={a.watermarkAnnotations} />
            <Stat label="Tagged watermark artifacts" value={a.artifactWatermarks} />
            <Stat label="Watermark objects" value={a.watermarkXObjects} />
            <Stat label="Optional content layers" value={a.layers.length} />
          </div>
          <Panel title="What to remove">
            <div className="space-y-3">
              <Checkbox label="Watermark annotations" description="Added by Acrobat “Add Watermark” or as annotations" checked={annots} onChange={setAnnots} />
              <Checkbox label="Tagged watermark artifacts and objects" description="Content marked as /Artifact /Watermark or Acrobat watermark XObjects" checked={artifacts} onChange={setArtifacts} />
              {a.layers.length ? (
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-fg">Layers (optional content groups)</p>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {a.layers.map((l) => <Checkbox key={l.ref} label={l.name || l.ref} checked={!!layers[l.ref]} onChange={(v) => setLayers((p) => ({ ...p, [l.ref]: v }))} />)}
                  </div>
                </div>
              ) : null}
              <Field label="Also remove text objects containing" hint="exact text, e.g. DRAFT – use with care">{(id) => <Input id={id} value={text} onChange={(e) => setText(e.target.value)} data-testid="input" />}</Field>
            </div>
          </Panel>
        </>
      ) : L && !analysis?.error ? <p className="text-sm text-fg-subtle">Analysing the PDF…</p> : null}
      <ActionBar onRun={run} runLabel="Remove watermark" running={task.running} disabled={!L} onReset={() => (loader.reset(), task.reset())} />
      <TaskProgress running={task.running} progress={null} label="Removing…" />
      <ErrorMessage error={task.error} />
      {task.result && L ? (
        removed ? (
          <PdfOutput bytes={task.result.bytes} name={outName(L.file.name, "-no-watermark")} label="Cleaned PDF">
            <p className="text-xs text-fg-muted">Removed {task.result.report.annotations} annotations, {task.result.report.artifacts} artifacts, {task.result.report.layerSections} layer sections, {task.result.report.xobjects} objects and {task.result.report.textObjects} text objects.</p>
          </PdfOutput>
        ) : (
          <Alert tone="warning" title="No removable watermark found">The watermark is probably part of the page content itself (flattened text, vector shapes or baked into a scanned image). Try the “text objects containing” option with the exact watermark text, or edit the page in a full PDF editor.</Alert>
        )
      ) : null}
      <Alert tone="info">Only remove watermarks from documents you own or are authorised to modify.</Alert>
    </div>
  );
}
