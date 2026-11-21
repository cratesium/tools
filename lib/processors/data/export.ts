/** Serializes a Table to downloadable formats. */

import { stringifyCsv, type Delimiter } from "./csv";
import { tableToJson } from "./json";
import { inferTable, tableToRows, type Table } from "./table";

export type ExportFormat = "csv" | "tsv" | "json" | "xlsx";

export const EXPORT_LABELS: Record<ExportFormat, string> = {
  csv: "CSV",
  tsv: "TSV",
  json: "JSON",
  xlsx: "Excel (.xlsx)",
};

export function tableToCsv(t: Table, opts: { delimiter?: Delimiter; bom?: boolean; eol?: "\r\n" | "\n" } = {}): string {
  return stringifyCsv(tableToRows(t), { delimiter: opts.delimiter ?? ",", bom: opts.bom, eol: opts.eol });
}

export async function exportTable(
  t: Table,
  format: ExportFormat,
  opts: { sheetName?: string; inferNumbers?: boolean; bom?: boolean } = {},
): Promise<Blob> {
  switch (format) {
    case "csv":
      return new Blob([tableToCsv(t, { bom: opts.bom })], { type: "text/csv;charset=utf-8" });
    case "tsv":
      return new Blob([tableToCsv(t, { delimiter: "\t", bom: opts.bom })], { type: "text/tab-separated-values;charset=utf-8" });
    case "json":
      return new Blob([JSON.stringify(tableToJson(t, { inferTypes: true }), null, 2)], { type: "application/json" });
    case "xlsx": {
      const { loadXlsx, tableToWorkbook, writeWorkbook } = await import("./excel");
      const X = await loadXlsx();
      const data = opts.inferNumbers === false ? t : inferTable(t);
      return writeWorkbook(X, tableToWorkbook(X, data, opts.sheetName ?? "Sheet1"));
    }
  }
}
