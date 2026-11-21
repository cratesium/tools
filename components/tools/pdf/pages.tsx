"use client";

import { useEffect, useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ActionBar, ErrorMessage, Panel, TaskProgress } from "@/components/tools/shared";
import { useTask } from "@/lib/utils/hooks";
import { PageGrid, PdfPicker, moveItem, outName, usePdfLoader } from "./common";
import { PdfOutput } from "./helpers";

type Mode = "delete" | "extract" | "reorder";

/** Delete pages, Extract pages and Reorder pages (processorOptions.mode) on a thumbnail grid. */
export default function PagesTool({ tool }: ToolComponentProps) {
  const mode = (tool.processorOptions?.mode as Mode) ?? "extract";
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<number[]>([]);
  const [range, setRange] = useState("");
  const [last, setLast] = useState<string | null>(null);
  const task = useTask<Uint8Array>();

  useEffect(() => {
    setOrder(L ? Array.from({ length: L.pageCount }, (_, i) => i + 1) : []); // eslint-disable-line react-hooks/set-state-in-effect
    setSel(new Set());
  }, [L]);

  const items = useMemo(() => (L ? order.map((p) => ({ key: String(p), pageNumber: p, doc: L.doc })) : []), [L, order]);
  const toggle = (k: string, shift: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      if (shift && last) {
        const a = order.indexOf(Number(last));
        const b = order.indexOf(Number(k));
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) n.add(String(order[i]));
      } else if (n.has(k)) n.delete(k);
      else n.add(k);
      setLast(k);
      return n;
    });
  const applyRange = async () => {
    if (!L) return;
    const { parsePageRanges } = await import("@/lib/processors/pdf/ranges");
    try {
      setSel(new Set(parsePageRanges(range, L.pageCount).map(String)));
      task.setError(null);
    } catch (e) {
      task.setError((e as Error).message);
    }
  };

  const run = () =>
    task.run(async () => {
      if (!L) throw new Error("Add a PDF first.");
      const { selectPages, keepAfterDelete } = await import("@/lib/processors/pdf/organize");
      const chosen = order.filter((p) => sel.has(String(p)));
      const keep = mode === "delete" ? keepAfterDelete(chosen, L.pageCount) : mode === "extract" ? chosen.sort((a, b) => a - b) : order;
      if (!keep.length) throw new Error(mode === "delete" ? "You can't delete every page." : "Select at least one page.");
      return selectPages(L.bytes, keep, { password: L.password });
    });

  const ready = mode === "reorder" ? order.some((p, i) => p !== i + 1) : sel.size > 0;
  const label = { delete: `Delete ${sel.size || ""} page${sel.size === 1 ? "" : "s"}`, extract: `Extract ${sel.size || ""} page${sel.size === 1 ? "" : "s"}`, reorder: "Save new order" }[mode];

  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      {L ? (
        <Panel
          title={mode === "reorder" ? "Drag pages (or use the arrows) into the new order" : mode === "delete" ? "Click pages to delete (Shift+click for a range)" : "Click pages to extract (Shift+click for a range)"}
          actions={
            mode === "reorder" ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => setOrder((o) => [...o].reverse())}>Reverse</Button>
                <Button size="sm" variant="ghost" onClick={() => setOrder(Array.from({ length: L.pageCount }, (_, i) => i + 1))}>Original order</Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => setSel(new Set(order.map(String)))}>All</Button>
                <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>None</Button>
              </>
            )
          }
        >
          {mode !== "reorder" ? (
            <div className="mb-3 flex flex-wrap items-end gap-2">
              <Field label="Or type pages" className="w-64">{(id) => <Input id={id} value={range} onChange={(e) => setRange(e.target.value)} placeholder="e.g. 1-3, 7, odd" data-testid="input" />}</Field>
              <Button variant="secondary" onClick={applyRange} disabled={!range.trim()}>Select</Button>
            </div>
          ) : null}
          <PageGrid
            items={items}
            selected={mode === "reorder" ? undefined : sel}
            onToggle={mode === "reorder" ? undefined : toggle}
            onMove={mode === "reorder" ? (a, b) => setOrder((o) => moveItem(o, a, b)) : undefined}
            markSelected={mode === "delete" ? "cross" : "check"}
          />
        </Panel>
      ) : null}
      <ActionBar onRun={run} runLabel={label} running={task.running} disabled={!L || !ready} onReset={() => (loader.reset(), task.reset())} />
      <TaskProgress running={task.running} progress={null} label="Writing PDF…" />
      <ErrorMessage error={task.error} />
      {task.result && L ? <PdfOutput bytes={task.result} name={outName(L.file.name, mode === "delete" ? "-edited" : mode === "extract" ? "-extracted" : "-reordered")} label="Result" /> : null}
    </div>
  );
}
