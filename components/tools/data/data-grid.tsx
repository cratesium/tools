"use client";

import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Panel } from "@/components/tools/shared";
import { sortTable } from "@/lib/processors/data/ops";
import { cellText, type Table } from "@/lib/processors/data/table";
import { formatNumber } from "@/lib/utils/format";

/**
 * Paginated, searchable, sortable read-only table. Only the visible page is rendered,
 * so files with hundreds of thousands of rows stay responsive.
 */
export function DataGrid({
  table,
  title = "Preview",
  actions,
  searchable = true,
  sortable = true,
  defaultPageSize = 50,
}: {
  table: Table;
  title?: ReactNode;
  actions?: ReactNode;
  searchable?: boolean;
  sortable?: boolean;
  defaultPageSize?: number;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ col: number; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const q = useDeferredValue(query.trim().toLowerCase());

  const view = useMemo(() => {
    let rows = table.rows;
    if (q) rows = rows.filter((r) => r.some((v) => cellText(v).toLowerCase().includes(q)));
    let t: Table = { headers: table.headers, rows };
    if (sort && sort.col < table.headers.length) t = sortTable(t, [{ column: sort.col, direction: sort.dir, type: "auto" }]);
    return t.rows;
  }, [table, q, sort]);

  const pages = Math.max(1, Math.ceil(view.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = view.slice(current * pageSize, (current + 1) * pageSize);

  const toggleSort = (col: number) => {
    setPage(0);
    setSort((s) => (!s || s.col !== col ? { col, dir: "asc" } : s.dir === "asc" ? { col, dir: "desc" } : null));
  };

  return (
    <Panel
      title={
        <>
          {title}{" "}
          <span className="font-normal text-fg-subtle">
            {formatNumber(view.length, 0)}
            {view.length !== table.rows.length ? ` of ${formatNumber(table.rows.length, 0)}` : ""} rows × {table.headers.length} columns
          </span>
        </>
      }
      actions={actions}
    >
      <div className="space-y-3" data-testid="output">
        {searchable ? (
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-fg-subtle" aria-hidden />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search all columns…"
              aria-label="Search rows"
              className="pl-8"
            />
          </div>
        ) : null}
        <div className="max-h-[560px] overflow-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-bg-muted">
              <tr>
                <th className="w-12 border-b border-border px-2 py-2 text-right font-normal text-fg-subtle">#</th>
                {table.headers.map((h, i) => (
                  <th key={i} className="border-b border-border px-3 py-2 text-left font-medium whitespace-nowrap text-fg">
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(i)}
                        className="inline-flex items-center gap-1 hover:text-fg-muted"
                        aria-label={`Sort by ${h}`}
                      >
                        {h}
                        {sort?.col === i ? (
                          sort.dir === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                          )
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
                        )}
                      </button>
                    ) : (
                      h
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i} className="even:bg-bg-subtle">
                  <td className="border-b border-border px-2 py-1.5 text-right font-mono text-[11px] text-fg-subtle">
                    {current * pageSize + i + 1}
                  </td>
                  {table.headers.map((_, j) => {
                    const v = cellText(r[j] ?? null);
                    return (
                      <td
                        key={j}
                        className="max-w-[320px] truncate border-b border-border px-3 py-1.5 whitespace-nowrap text-fg-muted"
                        title={v.length > 40 ? v : undefined}
                      >
                        {v}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!shown.length ? (
                <tr>
                  <td colSpan={table.headers.length + 1} className="px-3 py-6 text-center text-fg-subtle">
                    No rows to show.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pager page={current} pages={pages} onPage={setPage} pageSize={pageSize} onPageSize={(n) => (setPageSize(n), setPage(0))} />
      </div>
    </Panel>
  );
}

export function Pager({
  page,
  pages,
  onPage,
  pageSize,
  onPageSize,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
  pageSize: number;
  onPageSize: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
      <label className="flex items-center gap-2">
        Rows per page
        <Select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="h-8 w-20" aria-label="Rows per page">
          {[25, 50, 100, 250, 500].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </label>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 0} onClick={() => onPage(page - 1)} aria-label="Previous page" icon={<ChevronLeft className="h-3.5 w-3.5" />} />
        <span className="font-mono tabular-nums">
          {page + 1} / {pages}
        </span>
        <Button size="sm" variant="secondary" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page" icon={<ChevronRight className="h-3.5 w-3.5" />} />
      </div>
    </div>
  );
}
