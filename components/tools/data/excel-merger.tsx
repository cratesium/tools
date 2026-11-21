"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Segmented, Select } from "@/components/ui/field";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResult, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { DataGrid } from "./data-grid";
import { EXCEL_ACCEPT } from "@/lib/processors/data/excel";
import { stackTables, type NamedTable } from "@/lib/processors/data/ops";
import type { Table } from "@/lib/processors/data/table";
import { baseName } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";

type Naming = "file-sheet" | "file" | "sheet";

export default function ExcelMerger() {
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<"sheets" | "append">("sheets");
  const [naming, setNaming] = useState<Naming>("file-sheet");
  const [which, setWhich] = useState<"first" | "all">("first");
  const [loose, setLoose] = useState(true);
  const [addSource, setAddSource] = useState(true);
  const task = useTask<{ blob: Blob; sheets: number; preview: Table | null }>();

  const run = () =>
    task.run(async (ctx) => {
      if (files.length < 2) throw new Error("Add at least two workbooks.");
      const excel = await import("@/lib/processors/data/excel");
      const X = await excel.loadXlsx();
      const books = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        try {
          books.push({ name: f.name, wb: excel.readWorkbook(X, await f.arrayBuffer()) });
        } catch (e) {
          throw new Error(`${f.name}: ${(e as Error).message}`);
        }
        ctx.progress(((i + 1) / files.length) * 0.7);
      }
      if (mode === "sheets") {
        const items = books.flatMap(({ name, wb }) =>
          wb.SheetNames.map((s) => ({
            ws: wb.Sheets[s],
            name: naming === "sheet" ? s : naming === "file" && wb.SheetNames.length === 1 ? baseName(name) : `${baseName(name)} - ${s}`,
          })),
        );
        const out = excel.copySheetsToWorkbook(X, items);
        ctx.progress(0.9);
        return { blob: excel.writeWorkbook(X, out), sheets: items.length, preview: null };
      }
      const tables: NamedTable[] = books.flatMap(({ name, wb }) =>
        (which === "first" ? wb.SheetNames.slice(0, 1) : wb.SheetNames).map((s) => ({
          name: which === "first" ? name : `${name} / ${s}`,
          table: excel.sheetToTable(X, wb.Sheets[s], true),
        })),
      );
      const merged = stackTables(tables, { looseHeaders: loose, sourceColumn: addSource ? "Source" : null });
      const out = excel.tableToWorkbook(X, merged, "Merged");
      ctx.progress(0.9);
      return { blob: excel.writeWorkbook(X, out), sheets: 1, preview: merged };
    });

  return (
    <div className="space-y-4">
      <Panel title="Workbooks">
        <div className="space-y-3">
          <Dropzone multiple onFiles={(f) => setFiles((p) => [...p, ...f])} accept={EXCEL_ACCEPT} formatsLabel="XLSX, XLS, XLSM, XLSB or ODS · two or more files" />
          <FileList files={files} onRemove={(i) => setFiles((p) => p.filter((_, j) => j !== i))} onClear={() => setFiles([])} />
        </div>
      </Panel>
      <Panel title="Merge mode">
        <div className="space-y-4">
          <Segmented
            label="Merge mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "sheets", label: "Each sheet as its own tab" },
              { value: "append", label: "Append rows into one sheet" },
            ]}
          />
          <Settings>
            {mode === "sheets" ? (
              <Field label="Sheet names">
                {(id) => (
                  <Select id={id} value={naming} onChange={(e) => setNaming(e.target.value as Naming)}>
                    <option value="file-sheet">File name - sheet name</option>
                    <option value="file">File name (single-sheet files)</option>
                    <option value="sheet">Original sheet name</option>
                  </Select>
                )}
              </Field>
            ) : (
              <>
                <Field label="Sheets to append">
                  {(id) => (
                    <Select id={id} value={which} onChange={(e) => setWhich(e.target.value as "first" | "all")}>
                      <option value="first">First sheet of each file</option>
                      <option value="all">Every sheet of every file</option>
                    </Select>
                  )}
                </Field>
                <div className="space-y-2 pt-6">
                  <Checkbox label="Match headers ignoring case and spaces" checked={loose} onChange={setLoose} />
                  <Checkbox label='Add a "Source" column' checked={addSource} onChange={setAddSource} />
                </div>
              </>
            )}
          </Settings>
          <Alert tone="info">
            {mode === "sheets"
              ? "Sheets are copied with values, formulas, merged cells and column widths. Names longer than 31 characters are shortened and duplicates numbered. Cell styling (fonts, fills) is not carried over."
              : "Rows are aligned by header name; columns missing from a file are left empty. The first row of each sheet is treated as its header."}
          </Alert>
        </div>
      </Panel>
      <ActionBar
        onRun={run}
        runLabel="Merge workbooks"
        running={task.running}
        disabled={files.length < 2}
        onReset={() => {
          setFiles([]);
          task.reset();
        }}
      />
      <TaskProgress running={task.running} progress={task.progress} label="Merging…" />
      <ErrorMessage error={task.error} />
      {task.result ? (
        <FileResult blob={task.result.blob} filename="merged.xlsx" preview={false} label={`Merged workbook · ${task.result.sheets} sheet${task.result.sheets > 1 ? "s" : ""}`} />
      ) : null}
      {task.result?.preview ? <DataGrid table={task.result.preview} title="Merged rows" /> : null}
    </div>
  );
}
