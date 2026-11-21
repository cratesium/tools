"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Checkbox, Field, Input, Segmented, Select } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, Panel, Settings } from "@/components/tools/shared";
import { DataGrid } from "./data-grid";
import { ExportButtons } from "./export-buttons";
import { useTablesFromFiles } from "./use-files";
import { TABLE_ACCEPT } from "@/lib/processors/data/load";
import { joinTables, stackTables, type JoinType } from "@/lib/processors/data/ops";
import { formatNumber } from "@/lib/utils/format";
import { errorMessage } from "@/lib/utils/hooks";

export default function CsvMerger() {
  const [files, setFiles] = useState<File[]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mode, setMode] = useState<"stack" | "join">("stack");
  const [loose, setLoose] = useState(true);
  const [addSource, setAddSource] = useState(false);
  const [sourceName, setSourceName] = useState("source_file");
  const [keys, setKeys] = useState<Record<number, string>>({});
  const [joinType, setJoinType] = useState<JoinType>("inner");
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { tables, error: loadError, loading } = useTablesFromFiles(files, hasHeader);

  const result = useMemo(() => {
    if (tables.length < 2) return { table: null, error: null };
    try {
      if (mode === "stack")
        return { table: stackTables(tables, { looseHeaders: loose, sourceColumn: addSource ? sourceName.trim() || "source_file" : null }), error: null };
      const k = tables.map((t, i) => keys[i] ?? t.table.headers[0] ?? "");
      return { table: joinTables(tables, { keys: k, type: joinType, ignoreCase }), error: null };
    } catch (e) {
      return { table: null, error: errorMessage(e) };
    }
  }, [tables, mode, loose, addSource, sourceName, keys, joinType, ignoreCase]);

  const move = (i: number, d: -1 | 1) =>
    setFiles((fs) => {
      const j = i + d;
      if (j < 0 || j >= fs.length) return fs;
      const c = fs.slice();
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  return (
    <div className="space-y-4">
      <Panel title="Files to merge">
        <div className="space-y-3">
          <Dropzone multiple onFiles={(f) => setFiles((p) => [...p, ...f])} accept={TABLE_ACCEPT} formatsLabel="CSV, TSV, JSON or Excel (first sheet) · two or more files" />
          <FileList files={files} onRemove={(i) => setFiles((p) => p.filter((_, j) => j !== i))} onClear={() => setFiles([])} />
          {files.length > 1 ? (
            <div className="flex flex-wrap gap-2 text-xs text-fg-muted">
              <span className="py-1">Order:</span>
              {files.map((f, i) => (
                <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1">
                  {i + 1}. <span className="max-w-[160px] truncate">{f.name}</span>
                  <button type="button" onClick={() => move(i, -1)} aria-label={`Move ${f.name} up`} className="hover:text-fg">
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} aria-label={`Move ${f.name} down`} className="hover:text-fg">
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <Checkbox label="First row of each file is a header" checked={hasHeader} onChange={setHasHeader} />
          {loading ? <p className="text-xs text-fg-subtle">Reading files…</p> : null}
        </div>
      </Panel>

      <Panel title="How to merge">
        <div className="space-y-4">
          <Segmented
            label="Merge mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "stack", label: "Stack rows (append)" },
              { value: "join", label: "Join on a key column" },
            ]}
          />
          {mode === "stack" ? (
            <Settings>
              <Checkbox label="Match headers ignoring case and spaces" checked={loose} onChange={setLoose} />
              <Checkbox label="Add a column with the source file name" checked={addSource} onChange={setAddSource} />
              {addSource ? (
                <Field label="Source column name">{(id) => <Input id={id} value={sourceName} onChange={(e) => setSourceName(e.target.value)} />}</Field>
              ) : null}
            </Settings>
          ) : (
            <div className="space-y-4">
              <Settings>
                {tables.map((t, i) => (
                  <Field key={`${t.name}-${i}`} label={`Key in ${t.name}`}>
                    {(id) => (
                      <Select id={id} value={keys[i] ?? t.table.headers[0] ?? ""} onChange={(e) => setKeys((k) => ({ ...k, [i]: e.target.value }))}>
                        {t.table.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                ))}
              </Settings>
              <Settings>
                <Field label="Join type">
                  {(id) => (
                    <Select id={id} value={joinType} onChange={(e) => setJoinType(e.target.value as JoinType)}>
                      <option value="inner">Inner: only keys found in every file</option>
                      <option value="left">Left: every row of the first file</option>
                      <option value="outer">Full outer: every key from all files</option>
                    </Select>
                  )}
                </Field>
                <div className="pt-6">
                  <Checkbox label="Ignore case when matching keys" checked={ignoreCase} onChange={setIgnoreCase} />
                </div>
              </Settings>
            </div>
          )}
        </div>
      </Panel>

      <ErrorMessage error={loadError ?? result.error ?? exportError} />
      {files.length === 1 ? <p className="text-sm text-fg-muted">Add at least one more file to merge.</p> : null}

      {result.table ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Input rows" value={formatNumber(tables.reduce((n, t) => n + t.table.rows.length, 0), 0)} sub={`${tables.length} files`} />
            <Stat label="Merged rows" value={formatNumber(result.table.rows.length, 0)} />
            <Stat label="Columns" value={result.table.headers.length} />
          </div>
          <DataGrid table={result.table} title="Merged data" actions={<ExportButtons table={result.table} baseName="merged" formats={["csv", "xlsx", "json"]} onError={setExportError} />} />
        </>
      ) : null}
      <ActionBar
        onReset={() => {
          setFiles([]);
          setKeys({});
          setExportError(null);
          setMode("stack");
        }}
      />
    </div>
  );
}
