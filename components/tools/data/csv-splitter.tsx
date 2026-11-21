"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Segmented, Select } from "@/components/ui/field";
import { ActionBar, ErrorMessage, FileResults, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { TableInput, type LoadedTable } from "./table-input";
import { CSV_ACCEPT } from "@/lib/processors/data/load";
import { splitByColumn, splitByRows } from "@/lib/processors/data/ops";
import { tableToCsv } from "@/lib/processors/data/export";
import { inferTable } from "@/lib/processors/data/table";
import { baseName, formatNumber } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";

const MAX_PARTS = 2000;

export default function CsvSplitter() {
  const [inputKey, setInputKey] = useState(0);
  const [loaded, setLoaded] = useState<LoadedTable | null>(null);
  const [mode, setMode] = useState<"rows" | "column">("rows");
  const [rowsPerFile, setRowsPerFile] = useState(1000);
  const [column, setColumn] = useState(0);
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");
  const [bom, setBom] = useState(false);
  const task = useTask<{ name: string; blob: Blob }[]>();

  const run = () =>
    task.run(async (ctx) => {
      if (!loaded) throw new Error("Add a CSV file first.");
      const t = loaded.table;
      if (mode === "rows" && (!Number.isFinite(rowsPerFile) || rowsPerFile < 1)) throw new Error("Rows per file must be at least 1.");
      const parts = mode === "rows" ? splitByRows(t, rowsPerFile) : splitByColumn(t, Math.min(column, t.headers.length - 1));
      if (parts.length > MAX_PARTS) throw new Error(`That would create ${formatNumber(parts.length, 0)} files. Choose settings that produce at most ${MAX_PARTS}.`);
      const base = baseName(loaded.name);
      const out: { name: string; blob: Blob }[] = [];
      let X: typeof import("xlsx") | null = null;
      let excel: typeof import("@/lib/processors/data/excel") | null = null;
      if (format === "xlsx") {
        excel = await import("@/lib/processors/data/excel");
        X = await excel.loadXlsx();
      }
      for (let i = 0; i < parts.length; i++) {
        if (ctx.signal.aborted) break;
        const p = parts[i];
        const fname = `${base}-${p.name}`;
        if (format === "csv") out.push({ name: `${fname}.csv`, blob: new Blob([tableToCsv(p.table, { bom })], { type: "text/csv;charset=utf-8" }) });
        else if (X && excel) out.push({ name: `${fname}.xlsx`, blob: excel.writeWorkbook(X, excel.tableToWorkbook(X, inferTable(p.table), "Sheet1")) });
        ctx.progress((i + 1) / parts.length);
        if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
      }
      return out;
    });

  return (
    <div className="space-y-4">
      <Panel title="CSV file">
        <TableInput key={inputKey} onChange={setLoaded} accept={CSV_ACCEPT} formatsLabel="CSV, TSV or TXT" />
      </Panel>
      <Panel title="Split settings">
        <div className="space-y-4">
          <Segmented
            label="Split mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "rows", label: "By number of rows" },
              { value: "column", label: "By column value" },
            ]}
          />
          <Settings>
            {mode === "rows" ? (
              <Field label="Rows per file" hint="Header is repeated in every file">
                {(id) => <Input id={id} type="number" min={1} value={rowsPerFile} onChange={(e) => setRowsPerFile(Math.floor(Number(e.target.value)))} />}
              </Field>
            ) : (
              <Field label="Column" hint="One file per distinct value">
                {(id) => (
                  <Select id={id} value={column} onChange={(e) => setColumn(Number(e.target.value))} disabled={!loaded}>
                    {(loaded?.table.headers ?? []).map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            <Field label="Output format">
              {(id) => (
                <Select id={id} value={format} onChange={(e) => setFormat(e.target.value as "csv" | "xlsx")}>
                  <option value="csv">CSV</option>
                  <option value="xlsx">Excel (.xlsx)</option>
                </Select>
              )}
            </Field>
            {format === "csv" ? (
              <div className="pt-6">
                <Checkbox label="Add UTF-8 BOM" checked={bom} onChange={setBom} />
              </div>
            ) : null}
          </Settings>
          {loaded && mode === "rows" && rowsPerFile >= 1 ? (
            <Alert tone="info">
              {formatNumber(loaded.table.rows.length, 0)} rows → {formatNumber(Math.max(1, Math.ceil(loaded.table.rows.length / rowsPerFile)), 0)} files.
            </Alert>
          ) : null}
        </div>
      </Panel>
      <ActionBar
        onRun={run}
        runLabel="Split file"
        running={task.running}
        disabled={!loaded}
        onCancel={task.cancel}
        onReset={() => {
          setInputKey((k) => k + 1);
          setLoaded(null);
          task.reset();
        }}
      />
      <TaskProgress running={task.running} progress={task.progress} label="Writing files…" />
      <ErrorMessage error={task.error} />
      {task.result ? <FileResults files={task.result} zipName={`${loaded ? baseName(loaded.name) : "split"}-parts.zip`} label="Split files" /> : null}
    </div>
  );
}
