/**
 * SheetJS helpers. The XLSX module is passed in so callers can import it lazily
 * (`await loadXlsx()`) and tests can use it directly.
 */

import type * as XLSXTypes from "xlsx";
import { cellText, toTable, type Cell, type Table } from "./table";

export type XLSXModule = typeof XLSXTypes;
export type WorkBook = XLSXTypes.WorkBook;
export type WorkSheet = XLSXTypes.WorkSheet;

export const EXCEL_ACCEPT = ".xlsx,.xlsm,.xlsb,.xls,.ods";

export async function loadXlsx(): Promise<XLSXModule> {
  return (await import("xlsx")) as XLSXModule;
}

export interface SheetData {
  name: string;
  rows: Cell[][];
}

export function readWorkbook(X: XLSXModule, data: ArrayBuffer | Uint8Array): WorkBook {
  try {
    return X.read(data, { type: "array", cellDates: true, dense: false });
  } catch (e) {
    const msg = (e as Error).message || "";
    if (/password|encrypt/i.test(msg)) throw new Error("This workbook is password-protected. Remove the password in Excel and try again.");
    throw new Error(`Could not read the spreadsheet: ${msg || "unsupported or corrupt file"}.`);
  }
}

function pad(n: number, w = 2) {
  return String(n).padStart(w, "0");
}

/** SheetJS stores date cells as UTC-encoded wall-clock time; format them with UTC getters. */
export function formatExcelDate(d: Date): string {
  if (!Number.isFinite(d.getTime())) return "";
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const s = d.getUTCSeconds();
  if (!h && !m && !s) return date;
  // Pure time values (Excel day 0) are shown without the 1899 date.
  const time = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return d.getUTCFullYear() <= 1900 && d.getUTCMonth() === 11 && d.getUTCDate() >= 30 ? time : `${date} ${time}`;
}

/**
 * Extracts a sheet as rows of typed cells. With `formatted`, cells use the text Excel displays
 * (number formats, currency, percentages) instead of raw values.
 */
export function sheetRows(X: XLSXModule, ws: WorkSheet, opts: { formatted?: boolean } = {}): Cell[][] {
  const ref = ws["!ref"];
  if (!ref) return [];
  const range = X.utils.decode_range(ref);
  const rows: Cell[][] = [];
  const merges = ws["!merges"] ?? [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: Cell[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[X.utils.encode_cell({ r, c })] as XLSXTypes.CellObject | undefined;
      row.push(cell ? cellValue(cell, !!opts.formatted) : null);
    }
    rows.push(row);
  }
  // Fill merged areas with the top-left value so tables stay rectangular and meaningful.
  for (const m of merges) {
    const v = rows[m.s.r - range.s.r]?.[m.s.c - range.s.c] ?? null;
    for (let r = m.s.r; r <= m.e.r; r++)
      for (let c = m.s.c; c <= m.e.c; c++) {
        const row = rows[r - range.s.r];
        if (row && (r !== m.s.r || c !== m.s.c) && row[c - range.s.c] == null) row[c - range.s.c] = v;
      }
  }
  // Drop trailing empty rows.
  while (rows.length && rows[rows.length - 1].every((v) => v == null || v === "")) rows.pop();
  return rows;
}

function cellValue(cell: XLSXTypes.CellObject, formatted: boolean): Cell {
  if (formatted && cell.w != null && cell.t !== "s") return cell.w;
  switch (cell.t) {
    case "n":
      return typeof cell.v === "number" ? cell.v : Number(cell.v);
    case "b":
      return !!cell.v;
    case "d":
      return cell.v instanceof Date ? formatExcelDate(cell.v) : cellText(cell.v as Cell);
    case "e":
      return cell.w ?? "#ERROR";
    case "z":
      return null;
    default:
      return cell.v == null ? null : String(cell.v);
  }
}

export function workbookSheets(X: XLSXModule, wb: WorkBook, opts: { formatted?: boolean } = {}): SheetData[] {
  return wb.SheetNames.map((name) => ({ name, rows: sheetRows(X, wb.Sheets[name], opts) }));
}

/** Excel sheet names: ≤31 chars, none of : \ / ? * [ ], not blank, unique (case-insensitive). */
export function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[:\\/?*[\]]/g, "_").replace(/^'+|'+$/g, "").trim() || "Sheet";
  base = base.slice(0, 31);
  let n = base;
  let k = 2;
  while (used.has(n.toLowerCase())) {
    const suffix = ` (${k++})`;
    n = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(n.toLowerCase());
  return n;
}

export function rowsToSheet(X: XLSXModule, rows: Cell[][]): WorkSheet {
  const ws = X.utils.aoa_to_sheet(rows.map((r) => r.map((v) => (v === null ? "" : v))));
  // Reasonable column widths based on content (capped).
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const cols = Array.from({ length: width }, (_, c) => {
    let w = 6;
    for (let r = 0; r < Math.min(rows.length, 200); r++) w = Math.max(w, cellText(rows[r][c] ?? null).length);
    return { wch: Math.min(w + 2, 60) };
  });
  ws["!cols"] = cols;
  return ws;
}

export function writeWorkbook(X: XLSXModule, wb: WorkBook, bookType: "xlsx" | "ods" = "xlsx"): Blob {
  const out = X.write(wb, { type: "array", bookType, compression: true }) as ArrayBuffer;
  return new Blob([out], {
    type:
      bookType === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/vnd.oasis.opendocument.spreadsheet",
  });
}

/** Builds a workbook from row-based sheets. */
export function sheetsToWorkbook(X: XLSXModule, sheets: SheetData[]): WorkBook {
  const wb = X.utils.book_new();
  const used = new Set<string>();
  for (const s of sheets) X.utils.book_append_sheet(wb, rowsToSheet(X, s.rows), safeSheetName(s.name, used));
  if (!sheets.length) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([]), "Sheet1");
  return wb;
}

export function tableToWorkbook(X: XLSXModule, t: Table, sheetName = "Sheet1"): WorkBook {
  return sheetsToWorkbook(X, [{ name: sheetName, rows: [t.headers, ...t.rows] }]);
}

/** Copies worksheets (values, formulas, merges, column widths) into a new workbook. */
export function copySheetsToWorkbook(X: XLSXModule, items: { ws: WorkSheet; name: string }[]): WorkBook {
  const wb = X.utils.book_new();
  const used = new Set<string>();
  for (const it of items) X.utils.book_append_sheet(wb, it.ws, safeSheetName(it.name, used));
  return wb;
}

export function sheetToTable(X: XLSXModule, ws: WorkSheet, hasHeader = true, formatted = false): Table {
  return toTable(sheetRows(X, ws, { formatted }), hasHeader);
}

/** Splits a sheet into workbooks of `rowsPerFile` data rows, repeating the header row. */
export function splitSheetRows(rows: Cell[][], rowsPerFile: number, hasHeader: boolean): Cell[][][] {
  const header = hasHeader ? rows.slice(0, 1) : [];
  const body = hasHeader ? rows.slice(1) : rows;
  const size = Math.max(1, Math.floor(rowsPerFile));
  const parts: Cell[][][] = [];
  for (let i = 0; i < body.length; i += size) parts.push([...header, ...body.slice(i, i + size)]);
  if (!parts.length) parts.push(header);
  return parts;
}
