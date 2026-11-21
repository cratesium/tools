"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Stat } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, KeyValueTable, Panel } from "@/components/tools/shared";
import { TableInput, type LoadedTable } from "./table-input";
import { DataGrid } from "./data-grid";
import { ExportButtons } from "./export-buttons";
import { DELIMITER_LABELS } from "@/lib/processors/data/csv";
import { CSV_ACCEPT } from "@/lib/processors/data/load";
import { detectColumnType } from "@/lib/processors/data/ops";
import { cellText } from "@/lib/processors/data/table";
import { baseName, formatNumber } from "@/lib/utils/format";

export default function CsvViewer(_props: ToolComponentProps) {
  const [inputKey, setInputKey] = useState(0);
  const [loaded, setLoaded] = useState<LoadedTable | null>(null);
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo(() => {
    if (!loaded) return [];
    const t = loaded.table;
    return t.headers.map((h, i) => {
      let empty = 0;
      const distinct = new Set<string>();
      for (const r of t.rows) {
        const v = cellText(r[i] ?? null).trim();
        if (!v) empty++;
        else if (distinct.size <= 10_000) distinct.add(v);
      }
      const type = detectColumnType(t, i);
      return [h, `${type} · ${formatNumber(distinct.size, 0)}${distinct.size > 10_000 ? "+" : ""} distinct · ${formatNumber(empty, 0)} empty`] as [string, string];
    });
  }, [loaded]);

  return (
    <div className="space-y-4">
      <Panel title="CSV file">
        <TableInput key={inputKey} onChange={setLoaded} accept={CSV_ACCEPT} formatsLabel="CSV, TSV or TXT" />
      </Panel>
      {loaded ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Rows" value={formatNumber(loaded.table.rows.length, 0)} />
            <Stat label="Columns" value={loaded.table.headers.length} />
            <Stat label="Delimiter" value={loaded.delimiter ? DELIMITER_LABELS[loaded.delimiter].split(" ")[0] : "—"} />
            <Stat label="Empty cells" value={formatNumber(loaded.table.rows.reduce((n, r) => n + r.filter((v) => cellText(v).trim() === "").length, 0), 0)} />
          </div>
          <DataGrid
            table={loaded.table}
            title="Data"
            actions={<ExportButtons table={loaded.table} baseName={baseName(loaded.name)} formats={["csv", "xlsx", "json"]} onError={setError} />}
          />
          <Panel title="Columns">
            <KeyValueTable rows={columns} />
          </Panel>
        </>
      ) : null}
      <ErrorMessage error={error} />
      <ActionBar
        onReset={() => {
          setInputKey((k) => k + 1);
          setLoaded(null);
          setError(null);
        }}
      />
    </div>
  );
}
