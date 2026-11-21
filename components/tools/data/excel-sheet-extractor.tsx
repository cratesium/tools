"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResult, FileResults, Panel } from "@/components/tools/shared";
import { EXCEL_ACCEPT } from "@/lib/processors/data/excel";
import { safeFileName } from "@/lib/processors/data/table";
import { baseName } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";
import { useWorkbooks } from "./use-workbook";

type Out = { kind: "one"; blob: Blob; name: string } | { kind: "many"; files: { name: string; blob: Blob }[] };

/** Picks selected sheets out of a workbook into a new workbook or separate CSV files. */
export default function ExcelSheetExtractor(_props: ToolComponentProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const { X, books, error, loading } = useWorkbooks(files);
  const wb = books[0]?.wb;
  const names = useMemo(() => wb?.SheetNames ?? [], [wb]);
  const selected = names.filter((n) => picked[n]);
  const task = useTask<Out>();

  const run = () =>
    task.run(async () => {
      if (!X || !wb) throw new Error("Add an Excel file first.");
      if (!selected.length) throw new Error("Select at least one sheet.");
      const excel = await import("@/lib/processors/data/excel");
      const base = baseName(books[0].file.name);
      if (format === "xlsx") {
        const out = excel.copySheetsToWorkbook(X, selected.map((n) => ({ ws: wb.Sheets[n], name: n })));
        return { kind: "one", blob: excel.writeWorkbook(X, out), name: `${base}-extracted.xlsx` };
      }
      return {
        kind: "many",
        files: selected.map((n, i) => ({
          name: `${base}-${safeFileName(n, `sheet-${i + 1}`)}.csv`,
          blob: new Blob([X.utils.sheet_to_csv(wb.Sheets[n])], { type: "text/csv;charset=utf-8" }),
        })),
      };
    });

  return (
    <div className="space-y-4">
      {files.length ? (
        <FileList files={files} onClear={() => (setFiles([]), setPicked({}), task.reset())} />
      ) : (
        <Dropzone accept={EXCEL_ACCEPT} formatsLabel="XLSX, XLS, XLSM, XLSB or ODS" maxSize={200 * 1024 * 1024} onFiles={(f) => setFiles(f.slice(0, 1))} />
      )}
      {loading ? <p className="text-sm text-fg-subtle">Reading workbook…</p> : null}
      <ErrorMessage error={error} />
      {wb ? (
        <Panel
          title={`Sheets (${selected.length} of ${names.length} selected)`}
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={() => setPicked(Object.fromEntries(names.map((n) => [n, true])))}>
                Select all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPicked({})}>
                None
              </Button>
            </>
          }
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {names.map((n) => {
              const ref = wb.Sheets[n]?.["!ref"];
              return <Checkbox key={n} label={n} description={ref ? `Range ${ref}` : "Empty sheet"} checked={!!picked[n]} onChange={(v) => setPicked((p) => ({ ...p, [n]: v }))} />;
            })}
          </div>
          <Field label="Output" className="mt-4 max-w-xs">
            {(id) => (
              <Select id={id} value={format} onChange={(e) => setFormat(e.target.value as "xlsx" | "csv")}>
                <option value="xlsx">One Excel workbook with the selected sheets</option>
                <option value="csv">One CSV file per selected sheet</option>
              </Select>
            )}
          </Field>
        </Panel>
      ) : null}
      <ActionBar onRun={run} runLabel="Extract sheets" running={task.running} disabled={!wb || !selected.length} onReset={() => (setFiles([]), setPicked({}), task.reset())} />
      <ErrorMessage error={task.error} />
      {task.result?.kind === "one" ? <FileResult blob={task.result.blob} filename={task.result.name} preview={false} /> : null}
      {task.result?.kind === "many" ? <FileResults files={task.result.files} zipName="sheets.zip" label="CSV files" /> : null}
    </div>
  );
}
