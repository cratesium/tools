"use client";

import { useMemo, useState } from "react";
import { RotateCcw, RotateCw } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Button } from "@/components/ui/button";
import { ActionBar, ErrorMessage, Panel, TaskProgress } from "@/components/tools/shared";
import { useTask } from "@/lib/utils/hooks";
import { PageGrid, PdfPicker, outName, usePdfLoader } from "./common";
import { PdfOutput } from "./helpers";

export default function RotatePdf(_props: ToolComponentProps) {
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [rot, setRot] = useState<Record<number, number>>({});
  const items = useMemo(() => (L ? Array.from({ length: L.pageCount }, (_, i) => ({ key: String(i + 1), pageNumber: i + 1, doc: L.doc, rotation: rot[i + 1] ?? 0 })) : []), [L, rot]);
  const task = useTask<Uint8Array>();
  const all = (d: number) => L && setRot(Object.fromEntries(Array.from({ length: L.pageCount }, (_, i) => [i + 1, ((rot[i + 1] ?? 0) + d + 360) % 360])));
  const run = () =>
    task.run(async () => {
      if (!L) throw new Error("Add a PDF first.");
      const { rotatePdf } = await import("@/lib/processors/pdf/organize");
      return rotatePdf(L.bytes, new Map(Object.entries(rot).map(([k, v]) => [Number(k), v])), L.password);
    });
  const changed = Object.values(rot).some((v) => v % 360);
  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      {L ? (
        <Panel
          title="Click the rotate icon on a page, or rotate all"
          actions={
            <>
              <Button size="sm" variant="secondary" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => all(-90)}>All left</Button>
              <Button size="sm" variant="secondary" icon={<RotateCw className="h-3.5 w-3.5" />} onClick={() => all(90)}>All right</Button>
            </>
          }
        >
          <PageGrid items={items} onRotate={(k) => setRot((r) => ({ ...r, [Number(k)]: ((r[Number(k)] ?? 0) + 90) % 360 }))} />
        </Panel>
      ) : null}
      <ActionBar onRun={run} runLabel="Apply rotation" running={task.running} disabled={!L || !changed} onReset={() => (loader.reset(), setRot({}), task.reset())} />
      <TaskProgress running={task.running} progress={null} label="Rotating…" />
      <ErrorMessage error={task.error} />
      {task.result && L ? <PdfOutput bytes={task.result} name={outName(L.file.name, "-rotated")} label="Rotated PDF" /> : null}
    </div>
  );
}
