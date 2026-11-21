"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Select, Slider } from "@/components/ui/field";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { defaultSheetPdfOptions, type SheetPdfOptions } from "@/lib/processors/pdf/office-excel";
import { PAGE_SIZES } from "@/lib/processors/pdf/layout";
import { useTask } from "@/lib/utils/hooks";
import { outName } from "./common";
import { PdfOutput, ReplacedCharsNotice } from "./helpers";

export default function ExcelToPdf(_props: ToolComponentProps) {
  const [file, setFile] = useState<File | null>(null);
  const [o, setO] = useState<SheetPdfOptions>(defaultSheetPdfOptions);
  const set = <K extends keyof SheetPdfOptions>(k: K, v: SheetPdfOptions[K]) => setO((x) => ({ ...x, [k]: v }));
  const task = useTask<{ bytes: Uint8Array; pages: number; replacedChars: number; sheets: number }>();
  const run = () =>
    task.run(async (ctx) => {
      if (!file) throw new Error("Choose a spreadsheet.");
      ctx.progress(null, "Reading workbook…");
      const { readWorkbook, sheetsToPdf } = await import("@/lib/processors/pdf/office-excel");
      const sheets = (await readWorkbook(await file.arrayBuffer())).filter((s) => s.rows.length);
      if (!sheets.length) throw new Error("The workbook has no data.");
      ctx.progress(null, "Drawing tables…");
      return { ...(await sheetsToPdf(sheets, o)), sheets: sheets.length };
    });
  return (
    <div className="space-y-4">
      {file ? <FileList files={[file]} onClear={() => (setFile(null), task.reset())} /> : <Dropzone accept=".xlsx,.xls,.xlsm,.ods,.csv" formatsLabel="XLSX, XLS, ODS or CSV" onFiles={([f]) => (setFile(f), task.reset())} />}
      <Panel title="Layout">
        <Settings>
          <Field label="Page size">{(id) => <Select id={id} value={o.pageSize} onChange={(e) => set("pageSize", e.target.value as SheetPdfOptions["pageSize"])}>{Object.keys(PAGE_SIZES).map((k) => <option key={k} value={k}>{k.toUpperCase()}</option>)}</Select>}</Field>
          <Field label="Orientation">{(id) => <Select id={id} value={o.orientation} onChange={(e) => set("orientation", e.target.value as SheetPdfOptions["orientation"])}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></Select>}</Field>
          <Slider label="Font size" value={o.fontSize} min={6} max={14} onChange={(v) => set("fontSize", v)} format={(v) => `${v}pt`} />
        </Settings>
        <div className="mt-4 flex flex-wrap gap-5">
          <Checkbox label="Fit all columns to page width" checked={o.fitWidth} onChange={(v) => set("fitWidth", v)} />
          <Checkbox label="Gridlines" checked={o.gridlines} onChange={(v) => set("gridlines", v)} />
          <Checkbox label="Repeat header row on each page" checked={o.repeatHeader} onChange={(v) => set("repeatHeader", v)} />
          <Checkbox label="Sheet titles" checked={o.sheetTitles} onChange={(v) => set("sheetTitles", v)} />
        </div>
      </Panel>
      <ActionBar onRun={run} runLabel="Convert to PDF" running={task.running} disabled={!file} onReset={() => (setFile(null), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result && file ? (
        <PdfOutput bytes={task.result.bytes} name={outName(file.name, "")} label={`PDF – ${task.result.sheets} sheet(s), ${task.result.pages} page(s)`}>
          <ReplacedCharsNotice count={task.result.replacedChars} />
        </PdfOutput>
      ) : null}
    </div>
  );
}
