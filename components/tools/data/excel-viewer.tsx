"use client";

import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, Panel } from "@/components/tools/shared";
import { DataGrid } from "./data-grid";
import { ExportButtons } from "./export-buttons";
import { useWorkbooks } from "./use-workbook";
import { EXCEL_ACCEPT, sheetToTable } from "@/lib/processors/data/excel";
import { cn } from "@/lib/utils/cn";
import { baseName, formatNumber } from "@/lib/utils/format";

export default function ExcelViewer() {
  const [file, setFile] = useState<File | null>(null);
  const files = useMemo(() => (file ? [file] : []), [file]);
  const { X, books, error, loading } = useWorkbooks(files);
  const [sheet, setSheet] = useState(0);
  const [hasHeader, setHasHeader] = useState(true);
  const [formatted, setFormatted] = useState(true);
  const [exportError, setExportError] = useState<string | null>(null);

  const wb = books[0]?.wb ?? null;
  const names = useMemo(() => wb?.SheetNames ?? [], [wb]);
  const idx = sheet < names.length ? sheet : 0;
  const table = useMemo(() => (X && wb && names.length ? sheetToTable(X, wb.Sheets[names[idx]], hasHeader, formatted) : null), [X, wb, names, idx, hasHeader, formatted]);
  const ws = wb && names.length ? wb.Sheets[names[idx]] : null;

  return (
    <div className="space-y-4">
      <Panel title="Workbook">
        <div className="space-y-3">
          {file ? (
            <FileList files={[file]} onClear={() => setFile(null)} onRemove={() => setFile(null)} />
          ) : (
            <Dropzone onFiles={(f) => (setFile(f[0] ?? null), setSheet(0))} accept={EXCEL_ACCEPT} formatsLabel="XLSX, XLS, XLSM, XLSB or ODS" maxSize={200 * 1024 * 1024} />
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Checkbox label="First row is a header" checked={hasHeader} onChange={setHasHeader} />
            <Checkbox label="Show formatted values (as in Excel)" checked={formatted} onChange={setFormatted} />
          </div>
          {loading ? <p className="text-xs text-fg-subtle">Reading workbook…</p> : null}
        </div>
      </Panel>
      <ErrorMessage error={error ?? exportError} />
      {wb && table ? (
        <>
          <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Sheets">
            {names.map((n, i) => (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={i === idx}
                onClick={() => setSheet(i)}
                className={cn(
                  "-mb-px shrink-0 border-b-2 px-3 py-2 text-[13px] whitespace-nowrap",
                  i === idx ? "border-fg font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Sheets" value={names.length} />
            <Stat label="Rows" value={formatNumber(table.rows.length, 0)} />
            <Stat label="Columns" value={table.headers.length} />
            <Stat label="Used range" value={ws?.["!ref"] ?? "—"} sub={ws?.["!merges"]?.length ? `${ws["!merges"].length} merged areas` : undefined} />
          </div>
          <DataGrid
            table={table}
            title={names[idx]}
            actions={<ExportButtons table={table} baseName={`${baseName(file?.name ?? "workbook")}-${names[idx]}`} formats={["csv", "json", "xlsx"]} onError={setExportError} />}
          />
        </>
      ) : null}
      <ActionBar
        onReset={() => {
          setFile(null);
          setSheet(0);
          setExportError(null);
        }}
      />
    </div>
  );
}
