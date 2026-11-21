"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Segmented } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, Panel } from "@/components/tools/shared";
import { TABLE_ACCEPT } from "@/lib/processors/data/load";
import { dedupe } from "@/lib/processors/data/ops";
import { baseName, formatNumber } from "@/lib/utils/format";
import { DataGrid } from "./data-grid";
import { ExportButtons } from "./export-buttons";
import { TableInput, type LoadedTable } from "./table-input";

export default function DataDeduplicator(_props: ToolComponentProps) {
  const [inputKey, setInputKey] = useState(0);
  const [loaded, setLoaded] = useState<LoadedTable | null>(null);
  const [keyCols, setKeyCols] = useState<Record<number, boolean>>({});
  const [ignoreCase, setIgnoreCase] = useState(true);
  const [ws, setWs] = useState(true);
  const [keep, setKeep] = useState<"first" | "last">("first");
  const [exportError, setExportError] = useState<string | null>(null);
  const headers = loaded?.table.headers ?? [];
  const colKey = headers.map((_, i) => i).filter((i) => keyCols[i]).join(",");
  const columns = useMemo(() => (colKey ? colKey.split(",").map(Number) : []), [colKey]);
  const result = useMemo(() => (loaded ? dedupe(loaded.table, { columns, ignoreCase, normalizeWhitespace: ws, keep }) : null), [loaded, columns, ignoreCase, ws, keep]);

  return (
    <div className="space-y-4">
      <Panel title="Data">
        <TableInput key={inputKey} onChange={setLoaded} accept={TABLE_ACCEPT} formatsLabel="CSV, TSV, Excel or JSON" allowJson />
      </Panel>
      {loaded ? (
        <Panel title="Duplicate rules">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[13px] font-medium text-fg">Compare these columns {columns.length ? "" : <span className="font-normal text-fg-subtle">(none selected = whole row)</span>}</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {headers.map((h, i) => (
                  <Checkbox key={i} label={h} checked={!!keyCols[i]} onChange={(v) => setKeyCols((p) => ({ ...p, [i]: v }))} />
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <Checkbox label="Ignore case" checked={ignoreCase} onChange={setIgnoreCase} />
              <Checkbox label="Ignore extra whitespace" checked={ws} onChange={setWs} />
              <Segmented label="Keep" value={keep} onChange={setKeep} options={[{ value: "first", label: "Keep first" }, { value: "last", label: "Keep last" }]} />
            </div>
          </div>
        </Panel>
      ) : null}
      {result ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Original rows" value={formatNumber(loaded!.table.rows.length, 0)} />
            <Stat label="Duplicates removed" value={formatNumber(result.removed, 0)} />
            <Stat label="Rows kept" value={formatNumber(result.table.rows.length, 0)} sub={`${formatNumber(result.duplicateGroups, 0)} duplicated keys`} />
          </div>
          <DataGrid table={result.table} title="Deduplicated data" actions={<ExportButtons table={result.table} baseName={`${baseName(loaded!.name)}-deduped`} formats={["csv", "xlsx", "json"]} onError={setExportError} />} />
        </>
      ) : null}
      <ErrorMessage error={exportError} />
      <ActionBar onReset={() => (setInputKey((k) => k + 1), setLoaded(null), setKeyCols({}))} />
    </div>
  );
}
