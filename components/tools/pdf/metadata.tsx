"use client";

import { useEffect, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ActionBar, ErrorMessage, KeyValueTable, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import type { PdfInfo, PdfMetadata } from "@/lib/processors/pdf/metadata";
import { errorMessage, useTask } from "@/lib/utils/hooks";
import { PdfPicker, outName, usePdfLoader } from "./common";
import { PdfOutput } from "./helpers";

const toLocal = (d: Date | null) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export default function PdfMetadataEditor(_props: ToolComponentProps) {
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [info, setInfo] = useState<{ for: Uint8Array; info: PdfInfo | null; error: string | null } | null>(null);
  const [meta, setMeta] = useState<PdfMetadata | null>(null);
  const [removeXmp, setRemoveXmp] = useState(true);
  const task = useTask<Uint8Array>();
  useEffect(() => {
    if (!L) return;
    let alive = true;
    import("@/lib/processors/pdf/metadata")
      .then((m) => m.readPdfInfo(L.bytes, L.password))
      .then((i) => alive && (setInfo({ for: L.bytes, info: i, error: null }), setMeta({ title: i.title, author: i.author, subject: i.subject, keywords: i.keywords, creator: i.creator, producer: i.producer, creationDate: i.creationDate, modificationDate: i.modificationDate })))
      .catch((e) => alive && setInfo({ for: L.bytes, info: null, error: errorMessage(e) }));
    return () => {
      alive = false;
    };
  }, [L]);
  const i = info && L && info.for === L.bytes ? info.info : null;
  const set = <K extends keyof PdfMetadata>(k: K, v: PdfMetadata[K]) => setMeta((m) => (m ? { ...m, [k]: v } : m));
  const run = () =>
    task.run(async () => {
      if (!L || !meta) throw new Error("Add a PDF first.");
      const { writePdfMetadata } = await import("@/lib/processors/pdf/metadata");
      return writePdfMetadata(L.bytes, meta, { password: L.password, removeXmp });
    });
  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      {info?.error ? <ErrorMessage error={info.error} /> : null}
      {i && meta ? (
        <>
          <Panel title="Document">
            <KeyValueTable rows={[["Pages", String(i.pageCount)], ["PDF version", i.version], ["Page size", i.pageSize ? `${Math.round(i.pageSize.width)} × ${Math.round(i.pageSize.height)} pt` : "—"], ["XMP metadata", i.hasXmp ? "present" : "none"]]} />
          </Panel>
          <Panel title="Properties" actions={<Button size="sm" variant="ghost" onClick={() => setMeta({ title: "", author: "", subject: "", keywords: "", creator: "", producer: "", creationDate: null, modificationDate: null })}>Clear all</Button>}>
            <Settings>
              {(["title", "author", "subject", "keywords", "creator", "producer"] as const).map((k) => (
                <Field key={k} label={k[0].toUpperCase() + k.slice(1)} hint={k === "keywords" ? "comma-separated" : k === "creator" ? "authoring app" : undefined}>
                  {(id) => <Input id={id} value={meta[k]} onChange={(e) => set(k, e.target.value)} data-testid={k === "title" ? "input" : undefined} />}
                </Field>
              ))}
              <Field label="Created">{(id) => <Input id={id} type="datetime-local" value={toLocal(meta.creationDate)} onChange={(e) => set("creationDate", e.target.value ? new Date(e.target.value) : null)} />}</Field>
              <Field label="Modified">{(id) => <Input id={id} type="datetime-local" value={toLocal(meta.modificationDate)} onChange={(e) => set("modificationDate", e.target.value ? new Date(e.target.value) : null)} />}</Field>
            </Settings>
            <div className="mt-4"><Checkbox label="Remove XMP metadata stream" description="Prevents old values from lingering in the XMP copy" checked={removeXmp} onChange={setRemoveXmp} /></div>
          </Panel>
        </>
      ) : null}
      <ActionBar onRun={run} runLabel="Save metadata" running={task.running} disabled={!meta} onReset={() => (loader.reset(), setMeta(null), task.reset())} />
      <TaskProgress running={task.running} progress={null} label="Saving…" />
      <ErrorMessage error={task.error} />
      {task.result && L ? <PdfOutput bytes={task.result} name={outName(L.file.name, "-metadata")} label="Updated PDF" /> : null}
    </div>
  );
}
