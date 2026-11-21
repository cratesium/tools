"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Input, Segmented, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ActionBar, ErrorMessage, Panel } from "@/components/tools/shared";
import { TABLE_ACCEPT } from "@/lib/processors/data/load";
import { FILTER_OPS, filterTable, type FilterCondition, type FilterOp } from "@/lib/processors/data/ops";
import { baseName, formatNumber } from "@/lib/utils/format";
import { errorMessage, useDebounced } from "@/lib/utils/hooks";
import { DataGrid } from "./data-grid";
import { ExportButtons } from "./export-buttons";
import { TableInput, type LoadedTable } from "./table-input";

const blank = (): FilterCondition => ({ column: -1, op: "contains", value: "" });

export default function DataFilter(_props: ToolComponentProps) {
  const [inputKey, setInputKey] = useState(0);
  const [loaded, setLoaded] = useState<LoadedTable | null>(null);
  const [conds, setConds] = useState<FilterCondition[]>([blank()]);
  const [match, setMatch] = useState<"all" | "any">("all");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const dc = useDebounced(conds, 200);
  const t = loaded?.table;
  const result = useMemo(() => {
    if (!t) return null;
    const active = dc.filter((c) => (FILTER_OPS.find((o) => o.value === c.op)?.args ?? 1) === 0 || (c.value ?? "") !== "");
    try {
      return { table: active.length ? filterTable(t, active, { match, caseSensitive }) : t, error: null };
    } catch (e) {
      return { table: null, error: errorMessage(e) };
    }
  }, [t, dc, match, caseSensitive]);
  const upd = (i: number, patch: Partial<FilterCondition>) => setConds((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <div className="space-y-4">
      <Panel title="Data">
        <TableInput key={inputKey} onChange={setLoaded} accept={TABLE_ACCEPT} formatsLabel="CSV, TSV, Excel or JSON" allowJson />
      </Panel>
      {t ? (
        <Panel
          title="Conditions"
          actions={
            <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setConds((c) => [...c, blank()])}>
              Add condition
            </Button>
          }
        >
          <div className="mb-3 flex flex-wrap items-center gap-4">
            <Segmented label="Match" value={match} onChange={setMatch} options={[{ value: "all", label: "Match all (AND)" }, { value: "any", label: "Match any (OR)" }]} />
            <Checkbox label="Case-sensitive" checked={caseSensitive} onChange={setCaseSensitive} />
          </div>
          <ul className="space-y-2">
            {conds.map((c, i) => {
              const args = FILTER_OPS.find((o) => o.value === c.op)?.args ?? 1;
              return (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <Select aria-label="Column" value={c.column} onChange={(e) => upd(i, { column: Number(e.target.value) })} className="w-44">
                    <option value={-1}>Any column</option>
                    {t.headers.map((h, j) => (
                      <option key={j} value={j}>
                        {h}
                      </option>
                    ))}
                  </Select>
                  <Select aria-label="Operator" value={c.op} onChange={(e) => upd(i, { op: e.target.value as FilterOp })} className="w-48">
                    {FILTER_OPS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                  {args >= 1 ? <Input aria-label="Value" value={c.value ?? ""} onChange={(e) => upd(i, { value: e.target.value })} className="w-44" data-testid={i === 0 ? "input" : undefined} /> : null}
                  {args === 2 ? (
                    <>
                      <span className="text-xs text-fg-subtle">and</span>
                      <Input aria-label="Second value" value={c.value2 ?? ""} onChange={(e) => upd(i, { value2: e.target.value })} className="w-36" />
                    </>
                  ) : null}
                  {conds.length > 1 ? (
                    <Button size="icon" variant="ghost" aria-label="Remove condition" onClick={() => setConds((cs) => cs.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-fg-subtle">Numbers and dates are compared by value for greater/less than; everything else compares as text.</p>
        </Panel>
      ) : null}
      <ErrorMessage error={result?.error ?? exportError} />
      {result?.table && t ? (
        <DataGrid
          table={result.table}
          title={`${formatNumber(result.table.rows.length, 0)} of ${formatNumber(t.rows.length, 0)} rows match`}
          searchable={false}
          actions={<ExportButtons table={result.table} baseName={`${baseName(loaded!.name)}-filtered`} onError={setExportError} />}
        />
      ) : null}
      <ActionBar onReset={() => (setInputKey((x) => x + 1), setLoaded(null), setConds([blank()]))} />
    </div>
  );
}
