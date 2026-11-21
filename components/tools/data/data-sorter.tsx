"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ActionBar, ErrorMessage, Panel } from "@/components/tools/shared";
import { TABLE_ACCEPT } from "@/lib/processors/data/load";
import { detectColumnType, sortTable, type ColumnType, type SortKey } from "@/lib/processors/data/ops";
import { baseName } from "@/lib/utils/format";
import { DataGrid } from "./data-grid";
import { ExportButtons } from "./export-buttons";
import { TableInput, type LoadedTable } from "./table-input";

export default function DataSorter(_props: ToolComponentProps) {
  const [inputKey, setInputKey] = useState(0);
  const [loaded, setLoaded] = useState<LoadedTable | null>(null);
  const [keys, setKeys] = useState<SortKey[]>([{ column: 0, direction: "asc", type: "auto" }]);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const t = loaded?.table;
  const detected = useMemo(() => (t ? t.headers.map((_, i) => detectColumnType(t, i)) : []), [t]);
  const sorted = useMemo(() => {
    const valid = t ? keys.filter((k) => k.column < t.headers.length) : [];
    return t && valid.length ? sortTable(t, valid, { caseSensitive }) : null;
  }, [t, keys, caseSensitive]);
  const upd = (i: number, patch: Partial<SortKey>) => setKeys((ks) => ks.map((k, j) => (j === i ? { ...k, ...patch } : k)));

  return (
    <div className="space-y-4">
      <Panel title="Data">
        <TableInput key={inputKey} onChange={setLoaded} accept={TABLE_ACCEPT} formatsLabel="CSV, TSV, Excel or JSON" allowJson />
      </Panel>
      {t ? (
        <Panel
          title="Sort by"
          actions={
            <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} disabled={keys.length >= 5} onClick={() => setKeys((k) => [...k, { column: 0, direction: "asc", type: "auto" }])}>
              Add level
            </Button>
          }
        >
          <ol className="space-y-2">
            {keys.map((k, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="w-16 text-xs text-fg-subtle">{i === 0 ? "Sort by" : "then by"}</span>
                <Select aria-label="Column" value={k.column} onChange={(e) => upd(i, { column: Number(e.target.value) })} className="w-48">
                  {t.headers.map((h, j) => (
                    <option key={j} value={j}>
                      {h}
                    </option>
                  ))}
                </Select>
                <Select aria-label="Compare as" value={k.type ?? "auto"} onChange={(e) => upd(i, { type: e.target.value as ColumnType | "auto" })} className="w-44">
                  <option value="auto">Auto ({detected[k.column] ?? "text"})</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="text">Text</option>
                </Select>
                <Button size="sm" variant="secondary" icon={k.direction === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />} onClick={() => upd(i, { direction: k.direction === "asc" ? "desc" : "asc" })}>
                  {k.direction === "asc" ? "Ascending" : "Descending"}
                </Button>
                {keys.length > 1 ? (
                  <Button size="icon" variant="ghost" aria-label="Remove level" onClick={() => setKeys((ks) => ks.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
          <div className="mt-4">
            <Checkbox label="Case-sensitive text comparison" checked={caseSensitive} onChange={setCaseSensitive} />
          </div>
        </Panel>
      ) : null}
      {sorted ? <DataGrid table={sorted} title="Sorted data" sortable={false} actions={<ExportButtons table={sorted} baseName={`${baseName(loaded!.name)}-sorted`} onError={setExportError} />} /> : null}
      <ErrorMessage error={exportError} />
      <ActionBar onReset={() => (setInputKey((x) => x + 1), setLoaded(null), setKeys([{ column: 0, direction: "asc", type: "auto" }]))} />
    </div>
  );
}
