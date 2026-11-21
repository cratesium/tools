"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Dropzone } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResult, FileResults, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { TableInput, type LoadedTable } from "./table-input";
import { DataGrid } from "./data-grid";
import { TextResult } from "./text-result";
import { DELIMITER_LABELS, DELIMITERS, decodeText, type Delimiter } from "@/lib/processors/data/csv";
import { jsonToTable, parseJsonInput, tableToJson, type ArrayMode } from "@/lib/processors/data/json";
import { tableToXml } from "@/lib/processors/data/xml";
import { tableToCsv } from "@/lib/processors/data/export";
import { CSV_ACCEPT } from "@/lib/processors/data/load";
import { EXCEL_ACCEPT } from "@/lib/processors/data/excel";
import { inferTable, safeFileName, type Table } from "@/lib/processors/data/table";
import { baseName } from "@/lib/utils/format";
import { errorMessage, useDebounced, useTask } from "@/lib/utils/hooks";

type From = "csv" | "tsv" | "excel" | "json";
type To = "xlsx" | "csv" | "json" | "xml";

/**
 * Generic table converter. processorOptions: { from: "csv"|"tsv"|"excel"|"json", to: "xlsx"|"csv"|"json"|"xml" }.
 */
export default function DataConvert({ tool }: ToolComponentProps) {
  const from = (tool.processorOptions?.from as From) ?? "csv";
  const to = (tool.processorOptions?.to as To) ?? "json";
  const [inputKey, setInputKey] = useState(0);
  const [loaded, setLoaded] = useState<LoadedTable | null>(null);

  // JSON input (handled here so array flattening can be configured).
  const [jsonText, setJsonText] = useState("");
  const [jsonName, setJsonName] = useState("data");
  const [arrays, setArrays] = useState<ArrayMode>("index");
  const debouncedJson = useDebounced(jsonText, 250);
  const jsonParsed = useMemo((): { table: Table | null; error: string | null } => {
    if (from !== "json" || !debouncedJson.trim()) return { table: null, error: null };
    try {
      return { table: jsonToTable(parseJsonInput(debouncedJson), { arrays }), error: null };
    } catch (e) {
      return { table: null, error: errorMessage(e) };
    }
  }, [from, debouncedJson, arrays]);

  // Output options.
  const [delimiter, setDelimiter] = useState<Delimiter>(",");
  const [bom, setBom] = useState(false);
  const [eol, setEol] = useState<"\r\n" | "\n">("\r\n");
  const [allSheets, setAllSheets] = useState(false);
  const [inferTypes, setInferTypes] = useState(true);
  const [unflatten, setUnflatten] = useState(false);
  const [shape, setShape] = useState<"objects" | "arrays">("objects");
  const [indent, setIndent] = useState("2");
  const [root, setRoot] = useState("rows");
  const [rowTag, setRowTag] = useState("row");
  const [attributes, setAttributes] = useState(false);
  const [skipEmpty, setSkipEmpty] = useState(false);
  const [sheetName, setSheetName] = useState("");
  const [inferNumbers, setInferNumbers] = useState(true);
  const task = useTask<{ blob: Blob; name: string }>();

  const table = from === "json" ? jsonParsed.table : loaded?.table ?? null;
  const name = from === "json" ? jsonName : loaded ? baseName(loaded.name) : "data";
  const sheets = from === "excel" && allSheets && loaded?.sheets && loaded.sheets.length > 1 ? loaded.sheets : null;

  const text = useMemo((): { value: string; error: string | null } => {
    if (!table || to === "xlsx") return { value: "", error: null };
    try {
      if (to === "csv") return { value: tableToCsv(table, { delimiter, bom, eol }), error: null };
      if (to === "json") {
        const opts = { inferTypes, unflatten, shape };
        const sp = indent === "tab" ? "\t" : Number(indent);
        const data = sheets ? Object.fromEntries(sheets.map((s) => [s.name, tableToJson(s.table, opts)])) : tableToJson(table, opts);
        return { value: JSON.stringify(data, null, sp), error: null };
      }
      return { value: tableToXml(table, { root, row: rowTag, attributes, skipEmpty }), error: null };
    } catch (e) {
      return { value: "", error: errorMessage(e) };
    }
  }, [table, to, delimiter, bom, eol, inferTypes, unflatten, shape, indent, sheets, root, rowTag, attributes, skipEmpty]);

  const csvFiles = useMemo(() => {
    if (!sheets || to !== "csv") return null;
    return sheets.map((s) => ({
      name: `${safeFileName(s.name, "sheet")}.csv`,
      blob: new Blob([tableToCsv(s.table, { delimiter, bom, eol })], { type: "text/csv;charset=utf-8" }),
    }));
  }, [sheets, to, delimiter, bom, eol]);

  const toXlsx = () =>
    task.run(async () => {
      if (!table) throw new Error("Add some data first.");
      const { loadXlsx, tableToWorkbook, writeWorkbook } = await import("@/lib/processors/data/excel");
      const X = await loadXlsx();
      const data = inferNumbers ? inferTable(table) : table;
      const blob = writeWorkbook(X, tableToWorkbook(X, data, sheetName.trim() || name || "Sheet1"));
      return { blob, name: `${name}.xlsx` };
    });

  const reset = () => {
    setInputKey((k) => k + 1);
    setLoaded(null);
    setJsonText("");
    setJsonName("data");
    task.reset();
  };

  const ext = to === "csv" ? (delimiter === "\t" ? "tsv" : "csv") : to;
  const mime = to === "csv" ? "text/csv;charset=utf-8" : to === "json" ? "application/json" : "application/xml";

  return (
    <div className="space-y-4">
      <Panel title="Input">
        {from === "json" ? (
          <div className="space-y-3">
            <Dropzone
              accept=".json,.ndjson,application/json"
              formatsLabel="JSON or NDJSON"
              onFiles={async (f) => {
                const file = f[0];
                if (!file) return;
                setJsonName(baseName(file.name));
                setJsonText(decodeText(await file.arrayBuffer()));
              }}
            >
              Drop a JSON file or <span className="underline underline-offset-4">browse</span>, or paste below
            </Dropzone>
            <Textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder={'[\n  { "id": 1, "name": "Asha", "address": { "city": "Delhi" }, "tags": ["admin"] },\n  { "id": 2, "name": "Ben", "address": { "city": "London" } }\n]'}
              aria-label="JSON input"
              data-testid="input"
            />
            <Field label="Arrays inside records" className="max-w-xs">
              {(id) => (
                <Select id={id} value={arrays} onChange={(e) => setArrays(e.target.value as ArrayMode)}>
                  <option value="index">One column per item (tags.0, tags.1)</option>
                  <option value="json">Keep as JSON text in one column</option>
                </Select>
              )}
            </Field>
            <ErrorMessage error={jsonParsed.error} />
          </div>
        ) : (
          <TableInput
            key={inputKey}
            onChange={setLoaded}
            accept={from === "excel" ? EXCEL_ACCEPT : CSV_ACCEPT}
            formatsLabel={from === "excel" ? "XLSX, XLS, XLSM, XLSB or ODS" : from === "tsv" ? "TSV or tab-delimited TXT" : "CSV, TSV or TXT"}
            allowPaste={from !== "excel"}
            defaultDelimiter={from === "tsv" ? "\t" : "auto"}
            pastePlaceholder={from === "tsv" ? "name\temail\nAsha\tasha@example.com" : undefined}
            formattedToggle={from === "excel" && to !== "json"}
          />
        )}
      </Panel>

      <Panel title="Output options">
        <Settings>
          {to === "csv" ? (
            <>
              <Field label="Delimiter">
                {(id) => (
                  <Select id={id} value={delimiter} onChange={(e) => setDelimiter(e.target.value as Delimiter)}>
                    {DELIMITERS.map((d) => (
                      <option key={d} value={d}>
                        {DELIMITER_LABELS[d]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Line endings">
                {(id) => (
                  <Select id={id} value={eol} onChange={(e) => setEol(e.target.value as "\r\n" | "\n")}>
                    <option value={"\r\n"}>CRLF (Windows, RFC 4180)</option>
                    <option value={"\n"}>LF (macOS, Linux)</option>
                  </Select>
                )}
              </Field>
              <div className="space-y-2 pt-6">
                <Checkbox label="Add UTF-8 BOM" description="Helps Excel open accented characters correctly" checked={bom} onChange={setBom} />
                {from === "excel" && (loaded?.sheets?.length ?? 0) > 1 ? (
                  <Checkbox label="Convert every sheet (one CSV each)" checked={allSheets} onChange={setAllSheets} />
                ) : null}
              </div>
            </>
          ) : null}
          {to === "json" ? (
            <>
              <Field label="Shape">
                {(id) => (
                  <Select id={id} value={shape} onChange={(e) => setShape(e.target.value as "objects" | "arrays")}>
                    <option value="objects">Array of objects</option>
                    <option value="arrays">Array of arrays (header first)</option>
                  </Select>
                )}
              </Field>
              <Field label="Indentation">
                {(id) => (
                  <Select id={id} value={indent} onChange={(e) => setIndent(e.target.value)}>
                    <option value="2">2 spaces</option>
                    <option value="4">4 spaces</option>
                    <option value="tab">Tab</option>
                    <option value="0">Minified</option>
                  </Select>
                )}
              </Field>
              <div className="space-y-2 pt-6">
                <Checkbox label="Detect numbers, booleans and nulls" checked={inferTypes} onChange={setInferTypes} />
                <Checkbox
                  label="Nest dot-path columns"
                  description='"address.city" becomes { "address": { "city": … } }'
                  checked={unflatten}
                  onChange={setUnflatten}
                />
                {from === "excel" && (loaded?.sheets?.length ?? 0) > 1 ? (
                  <Checkbox label="Include every sheet (keyed by sheet name)" checked={allSheets} onChange={setAllSheets} />
                ) : null}
              </div>
            </>
          ) : null}
          {to === "xml" ? (
            <>
              <Field label="Root element">
                {(id) => <Input id={id} value={root} onChange={(e) => setRoot(e.target.value)} />}
              </Field>
              <Field label="Row element">
                {(id) => <Input id={id} value={rowTag} onChange={(e) => setRowTag(e.target.value)} />}
              </Field>
              <div className="space-y-2 pt-6">
                <Checkbox label="Write values as attributes" checked={attributes} onChange={setAttributes} />
                <Checkbox label="Omit empty values" checked={skipEmpty} onChange={setSkipEmpty} />
              </div>
            </>
          ) : null}
          {to === "xlsx" ? (
            <>
              <Field label="Sheet name" hint="Max 31 characters">
                {(id) => <Input id={id} value={sheetName} placeholder={name || "Sheet1"} onChange={(e) => setSheetName(e.target.value)} />}
              </Field>
              <div className="pt-6">
                <Checkbox
                  label="Store numbers as numbers"
                  description="Leading zeros (007) and long IDs stay as text"
                  checked={inferNumbers}
                  onChange={setInferNumbers}
                />
              </div>
            </>
          ) : null}
        </Settings>
      </Panel>

      <ActionBar
        onRun={to === "xlsx" ? toXlsx : undefined}
        runLabel="Convert to Excel"
        running={task.running}
        disabled={!table}
        onReset={reset}
      />
      <TaskProgress running={task.running} progress={null} label="Building workbook…" />
      <ErrorMessage error={task.error ?? text.error} />

      {to === "xlsx" && task.result ? <FileResult blob={task.result.blob} filename={task.result.name} preview={false} /> : null}
      {csvFiles ? (
        <FileResults files={csvFiles} zipName={`${name}-csv.zip`} label="CSV files" />
      ) : text.value ? (
        <TextResult value={text.value} filename={`${name}.${ext}`} mime={mime} label={`${ext.toUpperCase()} output`} />
      ) : null}
      {table && (to === "xlsx" || from === "json") ? <DataGrid table={table} title="Table preview" /> : null}
    </div>
  );
}
