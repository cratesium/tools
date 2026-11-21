import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { flattenObject, findRecords, jsonToTable, parseJsonInput, tableToJson } from "@/lib/processors/data/json";
import { escapeXml, safeTagName, tableToXml } from "@/lib/processors/data/xml";
import {
  copySheetsToWorkbook,
  formatExcelDate,
  readWorkbook,
  safeSheetName,
  sheetRows,
  sheetsToWorkbook,
  splitSheetRows,
  tableToWorkbook,
  workbookSheets,
  type XLSXModule,
} from "@/lib/processors/data/excel";
import { sourceFromText } from "@/lib/processors/data/load";
import { tableToCsv } from "@/lib/processors/data/export";
import { inferTable, toTable } from "@/lib/processors/data/table";

const X = XLSX as unknown as XLSXModule;

describe("JSON flattening", () => {
  it("flattens nested objects with dot paths", () => {
    expect(flattenObject({ a: 1, b: { c: "x", d: { e: null } } })).toEqual({ a: 1, "b.c": "x", "b.d.e": null });
  });

  it("flattens arrays by index or as JSON", () => {
    expect(flattenObject({ tags: ["a", "b"], o: [{ k: 1 }] })).toEqual({ "tags.0": "a", "tags.1": "b", "o.0.k": 1 });
    expect(flattenObject({ tags: ["a", "b"] }, { arrays: "json" })).toEqual({ tags: '["a","b"]' });
    expect(flattenObject({ e: [], o: {} })).toEqual({ e: "", o: "" });
  });

  it("builds a table from arrays of objects with a union of keys", () => {
    const t = jsonToTable([{ id: 1, name: "A" }, { id: 2, extra: true, user: { email: "b@x.io" } }]);
    expect(t.headers).toEqual(["id", "name", "extra", "user.email"]);
    expect(t.rows).toEqual([
      [1, "A", null, null],
      [2, null, true, "b@x.io"],
    ]);
  });

  it("unwraps a single array property and handles arrays of arrays and primitives", () => {
    expect(findRecords({ meta: { n: 1 }, data: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(jsonToTable([["h1", "h2"], [1, 2]])).toEqual({ headers: ["h1", "h2"], rows: [[1, 2]] });
    expect(jsonToTable([1, 2])).toEqual({ headers: ["value"], rows: [[1], [2]] });
    expect(jsonToTable({ a: 1 })).toEqual({ headers: ["a"], rows: [[1]] });
  });

  it("parses NDJSON and reports invalid JSON", () => {
    expect(parseJsonInput('{"a":1}\n{"a":2}')).toEqual([{ a: 1 }, { a: 2 }]);
    expect(() => parseJsonInput("{oops")).toThrow(/Invalid JSON/);
    expect(() => parseJsonInput("  ")).toThrow(/empty/);
  });
});

describe("table → JSON", () => {
  const t = { headers: ["id", "user.name", "user.tags.0", "user.tags.1", "active"], rows: [["1", "Asha", "x", "", "true"]] };

  it("infers types and keeps flat keys by default", () => {
    expect(tableToJson(t)).toEqual([{ id: 1, "user.name": "Asha", "user.tags.0": "x", "user.tags.1": null, active: true }]);
    expect(tableToJson(t, { inferTypes: false })).toEqual([
      { id: "1", "user.name": "Asha", "user.tags.0": "x", "user.tags.1": "", active: "true" },
    ]);
  });

  it("unflattens dot paths into nested objects and arrays", () => {
    expect(tableToJson(t, { unflatten: true })).toEqual([{ id: 1, user: { name: "Asha", tags: ["x"] }, active: true }]);
  });

  it("supports array-of-arrays output", () => {
    expect(tableToJson({ headers: ["a"], rows: [["007"]] }, { shape: "arrays" })).toEqual([["a"], ["007"]]);
  });

  it("round-trips CSV → JSON → CSV", () => {
    const src = sourceFromText('id,name\n1,"Smith, J"\n2,"say ""hi"""', "x.csv", "csv");
    const table = toTable(src.sheets[0].rows);
    const json = tableToJson(table, { inferTypes: false });
    const back = jsonToTable(json);
    expect(tableToCsv(back, { eol: "\n" })).toBe('id,name\n1,"Smith, J"\n2,"say ""hi"""');
  });
});

describe("XML", () => {
  it("creates safe tag names", () => {
    expect(safeTagName("First Name")).toBe("First_Name");
    expect(safeTagName("2024 sales")).toBe("_2024_sales");
    expect(safeTagName("xmlData")).toBe("_xmlData");
    expect(safeTagName("a&b<c>")).toBe("a_b_c_");
    expect(safeTagName("")).toBe("field");
    expect(safeTagName("prix (€)")).toBe("prix__€_");
    expect(safeTagName("a/b:c")).toBe("a_b_c");
    expect(safeTagName("città")).toBe("città");
  });

  it("escapes text and strips invalid control characters", () => {
    expect(escapeXml('<a & "b">')).toBe('&lt;a &amp; "b"&gt;');
    expect(escapeXml('"\'', true)).toBe("&quot;&apos;");
    expect(escapeXml("a\u0001b")).toBe("ab");
  });

  it("serializes rows as elements or attributes with unique tags", () => {
    const t = { headers: ["Name", "Name", "Note"], rows: [["A & B", "x", ""]] };
    expect(tableToXml(t, { root: "people", row: "person" })).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<people>\n  <person>\n    <Name>A &amp; B</Name>\n    <Name_2>x</Name_2>\n    <Note/>\n  </person>\n</people>\n',
    );
    expect(tableToXml(t, { attributes: true, declaration: false, indent: "", skipEmpty: true })).toBe(
      '<rows><row Name="A &amp; B" Name_2="x"/></rows>',
    );
  });
});

describe("Excel (SheetJS)", () => {
  it("writes and reads back typed values, preserving leading zeros", () => {
    const table = inferTable({ headers: ["id", "code", "qty"], rows: [["1", "007", "2.5"]] });
    const wb = tableToWorkbook(X, table, "Data");
    const buf = X.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const back = readWorkbook(X, buf);
    expect(back.SheetNames).toEqual(["Data"]);
    expect(sheetRows(X, back.Sheets.Data)).toEqual([
      ["id", "code", "qty"],
      [1, "007", 2.5],
    ]);
  });

  it("formats date cells as ISO strings regardless of time zone", () => {
    expect(formatExcelDate(new Date(Date.UTC(2024, 0, 5)))).toBe("2024-01-05");
    expect(formatExcelDate(new Date(Date.UTC(2024, 0, 5, 13, 30)))).toBe("2024-01-05 13:30:00");
    expect(formatExcelDate(new Date(Date.UTC(1899, 11, 30, 8, 15)))).toBe("08:15:00");
    const ws = X.utils.aoa_to_sheet([["d"], [new Date(2024, 5, 1)]], { cellDates: true });
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, "S");
    const buf = X.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    expect(sheetRows(X, readWorkbook(X, buf).Sheets.S)[1][0]).toBe("2024-06-01");
  });

  it("fills merged cells and drops trailing empty rows", () => {
    const ws = X.utils.aoa_to_sheet([["Region", null], ["North", 1], [null, null]]);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    expect(sheetRows(X, ws)).toEqual([
      ["Region", "Region"],
      ["North", 1],
    ]);
  });

  it("creates valid, unique sheet names", () => {
    const used = new Set<string>();
    expect(safeSheetName("Q1/Q2 [draft]", used)).toBe("Q1_Q2 _draft_");
    expect(safeSheetName("a".repeat(40), used)).toHaveLength(31);
    expect(safeSheetName("Sales", used)).toBe("Sales");
    expect(safeSheetName("sales", used)).toBe("sales (2)");
    expect(safeSheetName("", used)).toBe("Sheet");
  });

  it("builds multi-sheet workbooks and copies sheets between workbooks", () => {
    const wb = sheetsToWorkbook(X, [
      { name: "A", rows: [["x"], [1]] },
      { name: "B", rows: [["y"], [2]] },
    ]);
    const copy = copySheetsToWorkbook(X, [{ ws: wb.Sheets.B, name: "Copied" }]);
    const buf = X.write(copy, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const back = workbookSheets(X, readWorkbook(X, buf));
    expect(back).toEqual([{ name: "Copied", rows: [["y"], [2]] }]);
  });

  it("reports unreadable files clearly", () => {
    expect(() => readWorkbook(X, new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toThrow(/Could not read/);
  });

  it("splits sheet rows repeating the header", () => {
    const rows = [["h"], ["1"], ["2"], ["3"]];
    expect(splitSheetRows(rows, 2, true)).toEqual([[["h"], ["1"], ["2"]], [["h"], ["3"]]]);
    expect(splitSheetRows(rows, 3, false)).toEqual([[["h"], ["1"], ["2"]], [["3"]]]);
  });
});

describe("data sources", () => {
  it("parses TSV by extension and JSON input", () => {
    expect(sourceFromText("a\tb\n1\t2", "x.tsv", "csv").sheets[0].rows).toEqual([["a", "b"], ["1", "2"]]);
    const j = sourceFromText('[{"a":{"b":1}}]', "x.json", "json");
    expect(j.sheets[0].rows).toEqual([["a.b"], [1]]);
    expect(j.headerFixed).toBe(true);
  });
});
