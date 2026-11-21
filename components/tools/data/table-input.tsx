"use client";

import { useEffect, useMemo, useState } from "react";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ErrorMessage } from "@/components/tools/shared";
import { DELIMITER_LABELS, DELIMITERS, type Delimiter } from "@/lib/processors/data/csv";
import { looksLikeJson, sourceFromFile, sourceFromText, type DataSource, type SourceKind } from "@/lib/processors/data/load";
import { toTable, type Table } from "@/lib/processors/data/table";
import { errorMessage, useDebounced } from "@/lib/utils/hooks";
import { formatNumber } from "@/lib/utils/format";

export interface LoadedTable {
  table: Table;
  /** File name (or "pasted.csv"). */
  name: string;
  kind: SourceKind;
  delimiter?: Delimiter;
  sheetName?: string;
  /** All sheet names when the source is a workbook. */
  sheetNames?: string[];
  /** Every sheet as a table (workbook sources only), using the same header setting. */
  sheets?: { name: string; table: Table }[];
}

export interface TableInputProps {
  /** Receives the parsed table whenever input or options change. Pass a stable function (e.g. a state setter). */
  onChange: (v: LoadedTable | null) => void;
  accept: string;
  formatsLabel: string;
  allowPaste?: boolean;
  /** Parse pasted text that starts with { or [ as JSON. */
  allowJson?: boolean;
  defaultDelimiter?: Delimiter | "auto";
  pastePlaceholder?: string;
  /** Offer "use displayed values" for Excel inputs. */
  formattedToggle?: boolean;
  maxSize?: number;
}

const MAX = 200 * 1024 * 1024;

/**
 * Upload-or-paste input for tabular data with delimiter, header and sheet options.
 * Parsing happens on the main thread (the CSV parser handles ~25 MB in well under a second).
 */
export function TableInput({
  onChange,
  accept,
  formatsLabel,
  allowPaste = true,
  allowJson = false,
  defaultDelimiter = "auto",
  pastePlaceholder = "name,email,city\nAsha,asha@example.com,Delhi\nBen,ben@example.com,London",
  formattedToggle = false,
  maxSize = MAX,
}: TableInputProps) {
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [file, setFile] = useState<File | null>(null);
  // File parse results are tagged with the request key; loading/error are derived from it.
  const [parsed, setParsed] = useState<{ key: string; source: DataSource | null; error: string | null }>({ key: "", source: null, error: null });
  const [text, setText] = useState("");
  const [delimiter, setDelimiter] = useState<Delimiter | "auto">(defaultDelimiter);
  const [hasHeader, setHasHeader] = useState(true);
  const [sheet, setSheet] = useState(0);
  const [formatted, setFormatted] = useState(false);
  const debounced = useDebounced(text, 250);

  const fileKey = file ? `${file.name}|${file.size}|${file.lastModified}|${delimiter}|${formatted}` : "";
  useEffect(() => {
    if (!file) return;
    let alive = true;
    sourceFromFile(file, delimiter, { formatted })
      .then((s) => {
        if (!alive) return;
        setParsed({ key: fileKey, source: s, error: null });
        setSheet((i) => (i < s.sheets.length ? i : 0));
      })
      .catch((e) => alive && setParsed({ key: fileKey, source: null, error: errorMessage(e) }));
    return () => {
      alive = false;
    };
  }, [file, delimiter, formatted, fileKey]);
  const fileFresh = !!file && parsed.key === fileKey;
  const fileSource = fileFresh ? parsed.source : null;
  const fileError = fileFresh ? parsed.error : null;
  const loading = !!file && !fileFresh;

  const pasted = useMemo((): { source: DataSource | null; error: string | null } => {
    if (!debounced.trim()) return { source: null, error: null };
    try {
      const kind = allowJson && looksLikeJson(debounced) ? "json" : "csv";
      return { source: sourceFromText(debounced, kind === "json" ? "pasted.json" : "pasted.csv", kind, delimiter), error: null };
    } catch (e) {
      return { source: null, error: errorMessage(e) };
    }
  }, [debounced, delimiter, allowJson]);

  const source = mode === "file" ? fileSource : pasted.source;
  const error = mode === "file" ? fileError : pasted.error;
  const sheetIdx = source && sheet < source.sheets.length ? sheet : 0;

  const loaded = useMemo((): LoadedTable | null => {
    if (!source || !source.sheets.length) return null;
    const s = source.sheets[sheetIdx];
    const table = toTable(s.rows, source.headerFixed || hasHeader);
    return {
      table,
      name: source.name,
      kind: source.kind,
      delimiter: source.delimiter,
      sheetName: source.kind === "excel" ? s.name : undefined,
      sheetNames: source.kind === "excel" ? source.sheets.map((x) => x.name) : undefined,
      sheets:
        source.kind === "excel"
          ? source.sheets.map((x, i) => ({ name: x.name, table: i === sheetIdx ? table : toTable(x.rows, hasHeader) }))
          : undefined,
    };
  }, [source, sheetIdx, hasHeader]);

  useEffect(() => {
    onChange(loaded);
  }, [loaded, onChange]);

  const showDelimiter = source ? source.kind === "csv" : true;

  return (
    <div className="space-y-3">
      {allowPaste ? (
        <div className="flex flex-wrap gap-1 text-[13px]" role="tablist" aria-label="Input method">
          {(["file", "paste"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={
                mode === m
                  ? "rounded-md bg-bg-muted px-3 py-1.5 font-medium text-fg"
                  : "rounded-md px-3 py-1.5 text-fg-muted hover:text-fg"
              }
            >
              {m === "file" ? "Upload file" : "Paste data"}
            </button>
          ))}
        </div>
      ) : null}

      {mode === "file" ? (
        file ? (
          <FileList files={[file]} onClear={() => setFile(null)} onRemove={() => setFile(null)} />
        ) : (
          <Dropzone onFiles={(f) => setFile(f[0] ?? null)} accept={accept} formatsLabel={formatsLabel} maxSize={maxSize} />
        )
      ) : (
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={pastePlaceholder}
          aria-label="Paste data"
          data-testid="input"
          className="min-h-[200px]"
        />
      )}

      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        {showDelimiter ? (
          <Field label="Delimiter" className="w-44">
            {(id) => (
              <Select id={id} value={delimiter} onChange={(e) => setDelimiter(e.target.value as Delimiter | "auto")}>
                <option value="auto">Auto-detect</option>
                {DELIMITERS.map((d) => (
                  <option key={d} value={d}>
                    {DELIMITER_LABELS[d]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {source && source.kind === "excel" && source.sheets.length > 1 ? (
          <Field label="Sheet" className="w-56">
            {(id) => (
              <Select id={id} value={sheetIdx} onChange={(e) => setSheet(Number(e.target.value))}>
                {source.sheets.map((s, i) => (
                  <option key={i} value={i}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {!source?.headerFixed ? (
          <div className="pb-2">
            <Checkbox label="First row is a header" checked={hasHeader} onChange={setHasHeader} />
          </div>
        ) : null}
        {formattedToggle && source?.kind === "excel" ? (
          <div className="pb-2">
            <Checkbox label="Use displayed (formatted) values" checked={formatted} onChange={setFormatted} />
          </div>
        ) : null}
      </div>

      {loading ? <p className="text-xs text-fg-subtle">Reading file…</p> : null}
      <ErrorMessage error={error} />
      {source?.warnings.length ? (
        <Alert tone="warning" title="The data may be malformed">
          {source.warnings.slice(0, 3).join(" ")}
        </Alert>
      ) : null}
      {loaded ? (
        <p className="text-xs text-fg-muted" data-testid="input-summary">
          {formatNumber(loaded.table.rows.length, 0)} rows × {loaded.table.headers.length} columns
          {loaded.delimiter && loaded.kind === "csv" ? ` · ${DELIMITER_LABELS[loaded.delimiter]}` : ""}
          {loaded.sheetName ? ` · sheet "${loaded.sheetName}"` : ""}
        </p>
      ) : null}
    </div>
  );
}
