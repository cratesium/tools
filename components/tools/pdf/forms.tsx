"use client";

import { useEffect, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, Panel, TaskProgress } from "@/components/tools/shared";
import { errorMessage, useTask } from "@/lib/utils/hooks";
import { PdfPicker, outName, usePdfLoader } from "./common";
import { PdfOutput } from "./helpers";

type FieldInfo =
  | { name: string; type: "text"; value: string; multiline: boolean; readOnly: boolean }
  | { name: string; type: "checkbox"; value: boolean; readOnly: boolean }
  | { name: string; type: "dropdown" | "radio" | "list"; value: string; options: string[]; readOnly: boolean }
  | { name: string; type: "button" | "signature" | "unknown"; readOnly: boolean };

async function readFields(bytes: Uint8Array, password?: string): Promise<FieldInfo[]> {
  const [{ loadPdf }, lib] = await Promise.all([import("@/lib/processors/pdf/load"), import("@cantoo/pdf-lib")]);
  const form = (await loadPdf(bytes, { password })).getForm();
  return form.getFields().map((f) => {
    const name = f.getName();
    const readOnly = f.isReadOnly();
    if (f instanceof lib.PDFTextField) return { name, type: "text", value: f.getText() ?? "", multiline: f.isMultiline(), readOnly };
    if (f instanceof lib.PDFCheckBox) return { name, type: "checkbox", value: f.isChecked(), readOnly };
    if (f instanceof lib.PDFDropdown) return { name, type: "dropdown", value: f.getSelected()[0] ?? "", options: f.getOptions(), readOnly };
    if (f instanceof lib.PDFOptionList) return { name, type: "list", value: f.getSelected()[0] ?? "", options: f.getOptions(), readOnly };
    if (f instanceof lib.PDFRadioGroup) return { name, type: "radio", value: f.getSelected() ?? "", options: f.getOptions(), readOnly };
    if (f instanceof lib.PDFButton) return { name, type: "button", readOnly };
    if (f instanceof lib.PDFSignature) return { name, type: "signature", readOnly };
    return { name, type: "unknown", readOnly };
  });
}

export default function FillPdfForms(_props: ToolComponentProps) {
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [state, setState] = useState<{ for: Uint8Array; fields: FieldInfo[] | null; error: string | null } | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [flatten, setFlatten] = useState(false);
  const task = useTask<Uint8Array>();
  useEffect(() => {
    if (!L) return;
    let alive = true;
    readFields(L.bytes, L.password)
      .then((fields) => {
        if (!alive) return;
        setState({ for: L.bytes, fields, error: null });
        setValues(Object.fromEntries(fields.filter((f) => "value" in f).map((f) => [f.name, (f as { value: string | boolean }).value])));
      })
      .catch((e) => alive && setState({ for: L.bytes, fields: null, error: errorMessage(e) }));
    return () => {
      alive = false;
    };
  }, [L]);
  const fields = state && L && state.for === L.bytes ? state.fields : null;
  const fillable = fields?.filter((f) => ["text", "checkbox", "dropdown", "radio", "list"].includes(f.type)) ?? [];

  const run = () =>
    task.run(async () => {
      if (!L) throw new Error("Add a PDF first.");
      const [{ loadPdf, savePdf }, lib] = await Promise.all([import("@/lib/processors/pdf/load"), import("@cantoo/pdf-lib")]);
      const doc = await loadPdf(L.bytes, { password: L.password });
      const form = doc.getForm();
      for (const f of form.getFields()) {
        const v = values[f.getName()];
        if (v === undefined || f.isReadOnly()) continue;
        if (f instanceof lib.PDFTextField) f.setText(String(v));
        else if (f instanceof lib.PDFCheckBox) {
          if (v) f.check();
          else f.uncheck();
        }
        else if ((f instanceof lib.PDFDropdown || f instanceof lib.PDFOptionList) && v) f.select(String(v));
        else if (f instanceof lib.PDFRadioGroup && v) f.select(String(v));
      }
      const font = await doc.embedFont(lib.StandardFonts.Helvetica);
      form.updateFieldAppearances(font);
      if (flatten) form.flatten();
      return savePdf(doc);
    });

  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} hint="PDF with fillable form fields" />
      {state?.error ? <ErrorMessage error={state.error} /> : null}
      {fields ? (
        fillable.length ? (
          <Panel title={`Form fields (${fillable.length})`}>
            <div className="grid gap-4 sm:grid-cols-2" data-testid="output">
              {fillable.map((f) => (
                <div key={f.name}>
                  {f.type === "checkbox" ? (
                    <Checkbox label={f.name} checked={!!values[f.name]} onChange={(v) => setValues((x) => ({ ...x, [f.name]: v }))} disabled={f.readOnly} />
                  ) : f.type === "text" ? (
                    <Field label={f.name} hint={f.readOnly ? "read-only" : undefined}>{(id) => (f.multiline ? <textarea id={id} value={String(values[f.name] ?? "")} onChange={(e) => setValues((x) => ({ ...x, [f.name]: e.target.value }))} disabled={f.readOnly} className="min-h-[70px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" /> : <Input id={id} value={String(values[f.name] ?? "")} onChange={(e) => setValues((x) => ({ ...x, [f.name]: e.target.value }))} disabled={f.readOnly} />)}</Field>
                  ) : "options" in f ? (
                    <Field label={f.name}>{(id) => <Select id={id} value={String(values[f.name] ?? "")} onChange={(e) => setValues((x) => ({ ...x, [f.name]: e.target.value }))} disabled={f.readOnly}><option value="">—</option>{f.options.map((o) => <option key={o}>{o}</option>)}</Select>}</Field>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-4"><Checkbox label="Flatten after filling" description="Makes the answers part of the page so they can't be edited" checked={flatten} onChange={setFlatten} /></div>
          </Panel>
        ) : (
          <Alert tone="warning" title="No fillable fields found">This PDF has no interactive (AcroForm) fields. To write on a flat form, use Edit PDF to add text boxes. XFA forms (from some government sites) aren&apos;t supported.</Alert>
        )
      ) : L && !state?.error ? <p className="text-sm text-fg-subtle">Reading form fields…</p> : null}
      <ActionBar onRun={run} runLabel="Save filled PDF" running={task.running} disabled={!fillable.length} onReset={() => (loader.reset(), setValues({}), task.reset())} />
      <TaskProgress running={task.running} progress={null} label="Filling…" />
      <ErrorMessage error={task.error} />
      {task.result && L ? <PdfOutput bytes={task.result} name={outName(L.file.name, "-filled")} label="Filled PDF" /> : null}
    </div>
  );
}
