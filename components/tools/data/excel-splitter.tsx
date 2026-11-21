"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Segmented, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResults, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { EXCEL_ACCEPT } from "@/lib/processors/data/excel";
import { baseName, formatNumber } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";
import { safeFileName } from "@/lib/processors/data/table";
import { useWorkbooks } from "./use-workbook";

/** Splits a workbook into one file per sheet, or one sheet into files of N rows. */
export default function ExcelSplitter(_props: ToolComponentProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<"sheets" | "rows">("sheets");
  const [sheet, setSheet] = useState(0);
  const [rowsPerFile, setRowsPerFile] = useState(1000);
  const [hasHeader, setHasHeader] = useState(true);
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const { X, books, error, loading } = useWorkbooks(files);
  const wb = books[0]?.wb;
  const names = useMemo(() => wb?.SheetNames ?? [], [wb]);
  const task = useTask<{ name: string; blob: Blob }[]>();

  const run = () =>
    task.run(async (ctx) => {
      if (!X || !wb) throw new Error("Add an Excel file first.");
      const excel = await import("@/lib/processors/data/excel");
      const base = baseName(books[0].file.name);
      const out: { name: string; blob: Blob }[] = [];
      const toFile = (name: string, wbOut: typeof wb) =>
        format === "xlsx"
          ? { name: `${name}.xlsx`, blob: excel.writeWorkbook(X, wbOut) }
          : { name: `${name}.csv`, blob: new Blob([X.utils.sheet_to_csv(wbOut.Sheets[wbOut.SheetNames[0]])], { type: "text/csv;charset=utf-8" }) };
      if (mode === "sheets") {
        names.forEach((n, i) => {
          out.push(toFile(`${base}-${safeFileName(n, `sheet-${i + 1}`)}`, excel.copySheetsToWorkbook(X, [{ ws: wb.Sheets[n], name: n }])));
          ctx.progress((i + 1) / names.length);
        });
      } else {
        if (!Number.isFinite(rowsPerFile) || rowsPerFile < 1) throw new Error("Rows per file must be at least 1.");
        const name = names[Math.min(sheet, names.length - 1)];
        const parts = excel.splitSheetRows(excel.sheetRows(X, wb.Sheets[name]), rowsPerFile, hasHeader);
        if (parts.length > 2000) throw new Error(`That would create ${formatNumber(parts.length, 0)} files; increase rows per file.`);
        for (let i = 0; i < parts.length; i++) {
          out.push(toFile(`${base}-part-${String(i + 1).padStart(String(parts.length).length, "0")}`, excel.sheetsToWorkbook(X, [{ name, rows: parts[i] }])));
          ctx.progress((i + 1) / parts.length);
          if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
        }
      }
      return out;
    });

  return (
    <div className="space-y-4">
      {files.length ? (
        <FileList files={files} onClear={() => (setFiles([]), task.reset())} />
      ) : (
        <Dropzone accept={EXCEL_ACCEPT} formatsLabel="XLSX, XLS, XLSM, XLSB or ODS" maxSize={200 * 1024 * 1024} onFiles={(f) => setFiles(f.slice(0, 1))} />
      )}
      {loading ? <p className="text-sm text-fg-subtle">Reading workbook…</p> : null}
      <ErrorMessage error={error} />
      {wb ? (
        <Panel title="Split settings">
          <div className="space-y-4">
            <Segmented
              label="Split mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: "sheets", label: `One file per sheet (${names.length})` },
                { value: "rows", label: "By number of rows" },
              ]}
            />
            <Settings>
              {mode === "rows" ? (
                <>
                  <Field label="Sheet">
                    {(id) => (
                      <Select id={id} value={sheet} onChange={(e) => setSheet(Number(e.target.value))}>
                        {names.map((n, i) => (
                          <option key={n} value={i}>
                            {n}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Rows per file">
                    {(id) => <Input id={id} type="number" min={1} value={rowsPerFile} onChange={(e) => setRowsPerFile(Math.floor(Number(e.target.value)))} />}
                  </Field>
                  <div className="pt-6">
                    <Checkbox label="First row is a header (repeat it in every file)" checked={hasHeader} onChange={setHasHeader} />
                  </div>
                </>
              ) : null}
              <Field label="Output format">
                {(id) => (
                  <Select id={id} value={format} onChange={(e) => setFormat(e.target.value as "xlsx" | "csv")}>
                    <option value="xlsx">Excel (.xlsx)</option>
                    <option value="csv">CSV</option>
                  </Select>
                )}
              </Field>
            </Settings>
            {mode === "sheets" && format === "xlsx" ? <Alert tone="info">Each sheet is copied with its values, formulas, merged cells and column widths. Charts, images and macros are not carried over.</Alert> : null}
          </div>
        </Panel>
      ) : null}
      <ActionBar
        onRun={run}
        runLabel="Split workbook"
        running={task.running}
        disabled={!wb}
        onReset={() => {
          setFiles([]);
          task.reset();
        }}
      />
      <TaskProgress running={task.running} progress={task.progress} label="Writing files…" />
      <ErrorMessage error={task.error} />
      {task.result ? <FileResults files={task.result} zipName={`${files[0] ? baseName(files[0].name) : "workbook"}-split.zip`} label="Split files" /> : null}
    </div>
  );
}
