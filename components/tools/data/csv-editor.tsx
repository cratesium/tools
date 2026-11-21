"use client";

import { useCallback, useState } from "react";
import { Plus, Trash2, Columns3, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, Panel } from "@/components/tools/shared";
import { TableInput, type LoadedTable } from "./table-input";
import { Pager } from "./data-grid";
import { ExportButtons } from "./export-buttons";
import { CSV_ACCEPT } from "@/lib/processors/data/load";
import { cellText, type Table } from "@/lib/processors/data/table";
import { baseName, formatNumber } from "@/lib/utils/format";

interface Sheet {
  headers: string[];
  rows: string[][];
}

const blank = (): Sheet => ({ headers: ["Column 1", "Column 2", "Column 3"], rows: [["", "", ""], ["", "", ""], ["", "", ""]] });

export default function CsvEditor() {
  const [inputKey, setInputKey] = useState(0);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [name, setName] = useState("edited");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [error, setError] = useState<string | null>(null);

  const onLoad = useCallback((v: LoadedTable | null) => {
    if (!v) return;
    setSheet({ headers: [...v.table.headers], rows: v.table.rows.map((r) => r.map((c) => cellText(c))) });
    setName(`${baseName(v.name)}-edited`);
    setPage(0);
  }, []);

  const pages = sheet ? Math.max(1, Math.ceil(sheet.rows.length / pageSize)) : 1;
  const current = Math.min(page, pages - 1);
  const start = current * pageSize;

  const update = (fn: (s: Sheet) => Sheet) => setSheet((s) => (s ? fn(s) : s));
  const setCell = (r: number, c: number, v: string) =>
    update((s) => {
      const rows = s.rows.slice();
      rows[r] = rows[r].slice();
      rows[r][c] = v;
      return { ...s, rows };
    });
  const setHeader = (c: number, v: string) => update((s) => ({ ...s, headers: s.headers.map((h, i) => (i === c ? v : h)) }));
  const insertRow = (at: number) =>
    update((s) => {
      const rows = s.rows.slice();
      rows.splice(at, 0, s.headers.map(() => ""));
      return { ...s, rows };
    });
  const deleteRow = (r: number) => update((s) => ({ ...s, rows: s.rows.filter((_, i) => i !== r) }));
  const addColumn = () =>
    update((s) => ({ headers: [...s.headers, `Column ${s.headers.length + 1}`], rows: s.rows.map((r) => [...r, ""]) }));
  const deleteColumn = (c: number) =>
    update((s) => (s.headers.length <= 1 ? s : { headers: s.headers.filter((_, i) => i !== c), rows: s.rows.map((r) => r.filter((_, i) => i !== c)) }));

  const table: Table | null = sheet ? { headers: sheet.headers.map((h, i) => h.trim() || `Column ${i + 1}`), rows: sheet.rows } : null;

  return (
    <div className="space-y-4">
      <Panel title="Open a CSV" actions={<Button size="sm" variant="secondary" onClick={() => (setSheet(blank()), setName("new-table"), setPage(0))}>Start with a blank table</Button>}>
        <TableInput key={inputKey} onChange={onLoad} accept={CSV_ACCEPT} formatsLabel="CSV, TSV or TXT" />
        {sheet ? (
          <p className="mt-3 text-xs text-fg-subtle">Changing the input options above reloads the file and discards unsaved edits.</p>
        ) : null}
      </Panel>

      {sheet && table ? (
        <Panel
          title={
            <>
              Editor <span className="font-normal text-fg-subtle">{formatNumber(sheet.rows.length, 0)} rows × {sheet.headers.length} columns</span>
            </>
          }
          actions={<ExportButtons table={table} baseName={name} formats={["csv", "xlsx", "tsv", "json"]} onError={setError} />}
        >
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={<Rows3 className="h-3.5 w-3.5" />} onClick={() => (insertRow(sheet.rows.length), setPage(Math.floor(sheet.rows.length / pageSize)))}>
                Add row
              </Button>
              <Button size="sm" variant="secondary" icon={<Columns3 className="h-3.5 w-3.5" />} onClick={addColumn}>
                Add column
              </Button>
            </div>
            <div className="max-h-[600px] overflow-auto rounded-lg border border-border" data-testid="output">
              <table className="border-collapse text-[13px]">
                <thead className="sticky top-0 z-10 bg-bg-muted">
                  <tr>
                    <th className="w-20 border-b border-border px-2 py-1.5 text-right font-normal text-fg-subtle">#</th>
                    {sheet.headers.map((h, c) => (
                      <th key={c} className="min-w-[160px] border-b border-l border-border p-1">
                        <div className="flex items-center gap-1">
                          <input
                            value={h}
                            onChange={(e) => setHeader(c, e.target.value)}
                            aria-label={`Header of column ${c + 1}`}
                            className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 font-medium text-fg hover:border-border focus:border-border-strong focus:bg-card focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => deleteColumn(c)}
                            disabled={sheet.headers.length <= 1}
                            className="rounded p-1 text-fg-subtle hover:bg-card hover:text-danger disabled:opacity-30"
                            aria-label={`Delete column ${h || c + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.slice(start, start + pageSize).map((row, i) => {
                    const r = start + i;
                    return (
                      <tr key={r} className="group even:bg-bg-subtle">
                        <td className="border-b border-border px-1 py-0.5 text-right whitespace-nowrap">
                          <span className="inline-flex items-center gap-0.5">
                            <button type="button" onClick={() => insertRow(r + 1)} className="rounded p-1 text-fg-subtle opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-fg" aria-label={`Insert row below ${r + 1}`}>
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => deleteRow(r)} className="rounded p-1 text-fg-subtle opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-danger" aria-label={`Delete row ${r + 1}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-8 font-mono text-[11px] text-fg-subtle">{r + 1}</span>
                          </span>
                        </td>
                        {sheet.headers.map((_, c) => (
                          <td key={c} className="border-b border-l border-border p-0.5">
                            {/\r|\n/.test(row[c] ?? "") ? (
                              <textarea
                                value={row[c] ?? ""}
                                onChange={(e) => setCell(r, c, e.target.value)}
                                rows={2}
                                aria-label={`Row ${r + 1}, ${sheet.headers[c] || `column ${c + 1}`}`}
                                className="block w-full resize-y rounded border border-transparent bg-transparent px-2 py-1 text-fg hover:border-border focus:border-border-strong focus:bg-card focus:outline-none"
                              />
                            ) : (
                              <input
                                value={row[c] ?? ""}
                                onChange={(e) => setCell(r, c, e.target.value)}
                                aria-label={`Row ${r + 1}, ${sheet.headers[c] || `column ${c + 1}`}`}
                                className="h-7 w-full rounded border border-transparent bg-transparent px-2 text-fg hover:border-border focus:border-border-strong focus:bg-card focus:outline-none"
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {!sheet.rows.length ? (
                    <tr>
                      <td colSpan={sheet.headers.length + 1} className="px-3 py-6 text-center text-fg-subtle">
                        No rows. Click “Add row”.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <Pager page={current} pages={pages} onPage={setPage} pageSize={pageSize} onPageSize={(n) => (setPageSize(n), setPage(0))} />
            <Alert tone="info">Cells that contain line breaks open as multi-line fields. Exports quote delimiters, quotes and line breaks correctly.</Alert>
          </div>
        </Panel>
      ) : null}
      <ErrorMessage error={error} />
      <ActionBar
        onReset={() => {
          setInputKey((k) => k + 1);
          setSheet(null);
          setError(null);
          setPage(0);
        }}
      />
    </div>
  );
}
