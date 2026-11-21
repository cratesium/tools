"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Segmented } from "@/components/ui/field";
import { ActionBar, ErrorMessage, FileResults, Panel, TaskProgress } from "@/components/tools/shared";
import { useTask } from "@/lib/utils/hooks";
import { PdfPicker, outName, usePdfLoader } from "./common";
import { pdfBlob } from "./helpers";

type Mode = "each" | "every" | "ranges";

export default function SplitPdf(_props: ToolComponentProps) {
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [mode, setMode] = useState<Mode>("each");
  const [n, setN] = useState(2);
  const [ranges, setRanges] = useState("1-3, 4-6");
  const task = useTask<{ name: string; blob: Blob }[]>();
  const run = () =>
    task.run(async (ctx) => {
      if (!L) throw new Error("Add a PDF first.");
      const [{ splitGroups, splitPdf }, { parsePageRanges }] = await Promise.all([import("@/lib/processors/pdf/organize"), import("@/lib/processors/pdf/ranges")]);
      const groups =
        mode === "ranges"
          ? splitGroups({ kind: "groups", groups: ranges.split(/[;\n]|,(?=\s*\d+\s*-)/).map((g) => g.trim()).filter(Boolean).map((g) => parsePageRanges(g, L.pageCount, { dedupe: false })) }, L.pageCount)
          : splitGroups(mode === "each" ? { kind: "each" } : { kind: "every", n }, L.pageCount);
      if (groups.length > 1000) throw new Error("That would create more than 1,000 files.");
      const outs = await splitPdf(L.bytes, groups, { password: L.password, onProgress: (d, t) => ctx.progress(d / t, `Writing part ${d} of ${t}`) });
      const fmt = (g: number[]) => (g.length === 1 ? `page-${g[0]}` : `pages-${g[0]}-${g[g.length - 1]}`);
      return outs.map((b, i) => ({ name: outName(L.file.name, `-${fmt(groups[i])}`), blob: pdfBlob(b) }));
    });
  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      <Panel title="How to split">
        <div className="space-y-4">
          <Segmented label="Split mode" value={mode} onChange={setMode} options={[{ value: "each", label: "Every page" }, { value: "every", label: "Every N pages" }, { value: "ranges", label: "Custom ranges" }]} />
          {mode === "every" ? <Field label="Pages per file" className="w-40">{(id) => <Input id={id} type="number" min={1} value={n} onChange={(e) => setN(Math.max(1, Number(e.target.value) || 1))} />}</Field> : null}
          {mode === "ranges" ? (
            <Field label="Ranges" hint="one file per range: 1-3, 4-6; 8">
              {(id) => <Input id={id} value={ranges} onChange={(e) => setRanges(e.target.value)} data-testid="input" />}
            </Field>
          ) : null}
          {L && mode !== "ranges" ? <p className="text-sm text-fg-muted">→ {mode === "each" ? L.pageCount : Math.ceil(L.pageCount / n)} files</p> : null}
        </div>
      </Panel>
      <ActionBar onRun={run} runLabel="Split PDF" running={task.running} disabled={!L} onReset={() => (loader.reset(), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? <FileResults files={task.result} zipName={outName(L?.file.name, "-split", "zip")} label="Split files" /> : null}
    </div>
  );
}
