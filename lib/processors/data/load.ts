/** Loads uploaded or pasted data (CSV, TSV, JSON, Excel) into raw sheets of cells. */

import { decodeText, parseCsv, type Delimiter } from "./csv";
import { jsonToTable, parseJsonInput } from "./json";
import { extensionOf } from "@/lib/utils/format";
import type { Cell } from "./table";

export type SourceKind = "csv" | "json" | "excel";

export interface DataSource {
  kind: SourceKind;
  name: string;
  /** One entry for CSV/JSON; one per worksheet for Excel. Rows include the header row. */
  sheets: { name: string; rows: Cell[][] }[];
  delimiter?: Delimiter;
  warnings: string[];
  /** For JSON sources the header comes from the object keys, so the first row is always a header. */
  headerFixed?: boolean;
}

export const TABLE_ACCEPT = ".csv,.tsv,.tab,.txt,.json,.ndjson,.xlsx,.xlsm,.xlsb,.xls,.ods";
export const CSV_ACCEPT = ".csv,.tsv,.tab,.txt,text/csv,text/tab-separated-values,text/plain";

const EXCEL_EXT = new Set(["xlsx", "xlsm", "xlsb", "xls", "ods"]);

export function fileKind(name: string): SourceKind {
  const ext = extensionOf(name);
  if (EXCEL_EXT.has(ext)) return "excel";
  if (ext === "json" || ext === "ndjson") return "json";
  return "csv";
}

export function sourceFromText(text: string, name: string, kind: "csv" | "json", delimiter: Delimiter | "auto" = "auto"): DataSource {
  if (kind === "json") {
    const t = jsonToTable(parseJsonInput(text));
    return { kind, name, sheets: [{ name, rows: [t.headers, ...t.rows] }], warnings: [], headerFixed: true };
  }
  const ext = extensionOf(name);
  const d = delimiter === "auto" && (ext === "tsv" || ext === "tab") ? "\t" : delimiter;
  const r = parseCsv(text, { delimiter: d });
  return { kind, name, sheets: [{ name, rows: r.rows }], delimiter: r.delimiter, warnings: r.warnings };
}

/** Guesses whether pasted text is JSON. */
export function looksLikeJson(text: string): boolean {
  const t = text.trimStart();
  return t.startsWith("{") || t.startsWith("[");
}

export async function sourceFromFile(
  file: File,
  delimiter: Delimiter | "auto" = "auto",
  opts: { formatted?: boolean } = {},
): Promise<DataSource> {
  const kind = fileKind(file.name);
  const buf = await file.arrayBuffer();
  if (kind === "excel") {
    const { loadXlsx, readWorkbook, workbookSheets } = await import("./excel");
    const X = await loadXlsx();
    const wb = readWorkbook(X, buf);
    return { kind, name: file.name, sheets: workbookSheets(X, wb, opts), warnings: [] };
  }
  return sourceFromText(decodeText(buf), file.name, kind, delimiter);
}
