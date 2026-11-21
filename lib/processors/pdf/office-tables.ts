/**
 * PDF → spreadsheet. Text items are clustered into rows and columns per page (heuristic, see
 * extractTableGrid in text.ts) and written to XLSX with SheetJS or to CSV.
 */
import { compactGrid, extractTableGrid, gridToCsv, type Grid, type PageText } from "./text";

export interface PageTable {
  page: number;
  grid: Grid;
}

export function pagesToTables(pages: PageText[]): PageTable[] {
  return pages.map((p) => ({ page: p.page, grid: compactGrid(extractTableGrid(p.items)) })).filter((t) => t.grid.length > 0);
}

const NUMERIC = /^[-+(]?\s?[$€£¥₹]?\s?\d{1,3}(,\d{3})*(\.\d+)?\)?%?$|^[-+]?\d+(\.\d+)?%?$/;

/** Converts "1,234.50", "(12)", "45%" to numbers; leaves everything else as text. */
export function toCellValue(v: string): string | number {
  const s = v.trim();
  if (!s || !NUMERIC.test(s)) return v;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const pct = s.endsWith("%");
  const n = Number(s.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return v;
  const val = (neg ? -n : n) / (pct ? 100 : 1);
  return val;
}

export interface XlsxOptions {
  /** "sheets": one worksheet per page; "single": all pages stacked in one sheet. */
  layout: "sheets" | "single";
  convertNumbers: boolean;
}

export async function tablesToXlsx(tables: PageTable[], opts: XlsxOptions): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const conv = (g: Grid) => g.map((r) => r.map((c) => (opts.convertNumbers ? toCellValue(c) : c)));
  if (opts.layout === "single" || !tables.length) {
    const rows: (string | number)[][] = [];
    tables.forEach((t, i) => {
      if (i > 0) rows.push([]);
      if (tables.length > 1) rows.push([`Page ${t.page}`]);
      rows.push(...conv(t.grid));
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows.length ? rows : [[""]]), "Tables");
  } else {
    for (const t of tables) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(conv(t.grid)), `Page ${t.page}`);
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(out);
}

export function tablesToCsv(tables: PageTable[], delimiter = ","): string {
  return tables.map((t) => gridToCsv(t.grid, delimiter)).join("\r\n\r\n");
}
