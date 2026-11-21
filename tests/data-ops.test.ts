import { describe, expect, it } from "vitest";
import {
  dedupe,
  detectColumnType,
  filterTable,
  joinTables,
  parseDate,
  parseNumber,
  sortTable,
  splitByColumn,
  splitByRows,
  stackTables,
} from "@/lib/processors/data/ops";
import { inferCell, safeFileName, toTable, uniqueHeaders, type Table } from "@/lib/processors/data/table";

const people: Table = {
  headers: ["name", "city", "age", "joined"],
  rows: [
    ["Asha", "Delhi", "34", "2023-05-01"],
    ["Ben", "London", "9", "2021-01-15"],
    ["asha ", "delhi", "34", "2023-05-01"],
    ["Chen", "", "120", "2024-12-31"],
    ["Ben", "London", "10", "2020-07-04"],
  ],
};

describe("table model", () => {
  it("builds unique, non-empty headers and pads ragged rows", () => {
    const t = toTable([["a", "", "a"], ["1"], ["1", "2", "3", "4"]]);
    expect(t.headers).toEqual(["a", "Column 2", "a_2", "Column 4"]);
    expect(t.rows[0]).toEqual(["1", "", "", ""]);
    expect(uniqueHeaders(["x", "X", "x_2"], 3)).toEqual(["x", "X_2", "x_2_2"]);
    expect(toTable([["1", "2"]], false).headers).toEqual(["Column 1", "Column 2"]);
  });

  it("infers numbers but keeps leading zeros and long ids as text", () => {
    expect(inferCell("42")).toBe(42);
    expect(inferCell("-3.5")).toBe(-3.5);
    expect(inferCell("1e3")).toBe(1000);
    expect(inferCell("007")).toBe("007");
    expect(inferCell("4111111111111111")).toBe("4111111111111111");
    expect(inferCell("12 apples")).toBe("12 apples");
    expect(inferCell("")).toBe("");
  });

  it("sanitizes file names", () => {
    expect(safeFileName('a/b:c*?"<>|')).toBe("a_b_c______");
    expect(safeFileName("   ")).toBe("file");
    expect(safeFileName("..hidden")).toBe("hidden");
  });
});

describe("value parsing", () => {
  it("parses numbers in common formats", () => {
    expect(parseNumber("1,234.5")).toBe(1234.5);
    expect(parseNumber("$12")).toBe(12);
    expect(parseNumber("45%")).toBe(45);
    expect(parseNumber("(30)")).toBe(-30);
    expect(parseNumber("₹ 500")).toBe(500);
    expect(parseNumber("12,34")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(7)).toBe(7);
  });

  it("parses ISO and textual dates, not plain numbers", () => {
    expect(parseDate("2024-03-05")).toBe(Date.UTC(2024, 2, 5));
    expect(parseDate("2024/03/05 10:30")).toBe(Date.UTC(2024, 2, 5, 10, 30));
    expect(parseDate("03/05/2024")).toBe(Date.UTC(2024, 2, 5));
    expect(parseDate("March 5, 2024")).not.toBeNull();
    expect(parseDate("2024")).toBeNull();
    expect(parseDate("2024-13-01")).toBeNull();
    expect(parseDate("hello")).toBeNull();
  });

  it("detects column types", () => {
    expect(detectColumnType(people, 2)).toBe("number");
    expect(detectColumnType(people, 3)).toBe("date");
    expect(detectColumnType(people, 0)).toBe("text");
  });
});

describe("dedupe", () => {
  it("removes exact duplicates across all columns", () => {
    const r = dedupe({ headers: ["a"], rows: [["x"], ["y"], ["x"], ["x"]] });
    expect(r.table.rows).toEqual([["x"], ["y"]]);
    expect(r.removed).toBe(2);
    expect(r.duplicateGroups).toBe(1);
  });

  it("supports ignore case and whitespace normalization", () => {
    expect(dedupe(people).removed).toBe(0);
    const r = dedupe(people, { ignoreCase: true, normalizeWhitespace: true });
    expect(r.removed).toBe(1);
    expect(r.table.rows.map((x) => x[0])).toEqual(["Asha", "Ben", "Chen", "Ben"]);
  });

  it("dedupes by key columns keeping first or last", () => {
    const first = dedupe(people, { columns: [0], keep: "first" });
    expect(first.table.rows.map((r) => r[2])).toEqual(["34", "9", "34", "120"]);
    const last = dedupe(people, { columns: [0], keep: "last" });
    expect(last.table.rows.map((r) => r[2])).toEqual(["34", "34", "120", "10"]);
    expect(last.removed).toBe(1);
  });
});

describe("sort", () => {
  it("sorts numbers numerically, not lexically", () => {
    const r = sortTable(people, [{ column: 2, direction: "asc" }]);
    expect(r.rows.map((x) => x[2])).toEqual(["9", "10", "34", "34", "120"]);
  });

  it("sorts dates and descending order", () => {
    const r = sortTable(people, [{ column: 3, direction: "desc" }]);
    expect(r.rows.map((x) => x[3])).toEqual(["2024-12-31", "2023-05-01", "2023-05-01", "2021-01-15", "2020-07-04"]);
  });

  it("supports multi-column sort, is stable, and puts empty values last", () => {
    const r = sortTable(people, [
      { column: 1, direction: "asc" },
      { column: 2, direction: "desc" },
    ]);
    expect(r.rows.map((x) => `${x[0]}|${x[2]}`)).toEqual(["Asha|34", "asha |34", "Ben|10", "Ben|9", "Chen|120"]);
  });

  it("can force text sorting with natural number ordering", () => {
    const t: Table = { headers: ["f"], rows: [["file10"], ["file2"], ["File1"]] };
    expect(sortTable(t, [{ column: 0, direction: "asc", type: "text" }]).rows.flat()).toEqual(["File1", "file2", "file10"]);
  });
});

describe("filter", () => {
  it("filters with text operators", () => {
    expect(filterTable(people, [{ column: 1, op: "equals", value: "delhi" }]).rows).toHaveLength(2);
    expect(filterTable(people, [{ column: 1, op: "equals", value: "delhi" }], { caseSensitive: true }).rows).toHaveLength(1);
    expect(filterTable(people, [{ column: 0, op: "contains", value: "en" }]).rows).toHaveLength(3);
    expect(filterTable(people, [{ column: 0, op: "starts_with", value: "b" }]).rows).toHaveLength(2);
    expect(filterTable(people, [{ column: 0, op: "regex", value: "^[ab]" }]).rows).toHaveLength(4);
  });

  it("compares numbers and dates", () => {
    expect(filterTable(people, [{ column: 2, op: "gt", value: "10" }]).rows.map((r) => r[2])).toEqual(["34", "34", "120"]);
    expect(filterTable(people, [{ column: 2, op: "between", value: "9", value2: "34" }]).rows).toHaveLength(4);
    expect(filterTable(people, [{ column: 3, op: "lt", value: "2022-01-01" }]).rows).toHaveLength(2);
  });

  it("handles empty / not empty and any-column conditions", () => {
    expect(filterTable(people, [{ column: 1, op: "empty" }]).rows).toHaveLength(1);
    expect(filterTable(people, [{ column: 1, op: "not_empty" }]).rows).toHaveLength(4);
    expect(filterTable(people, [{ column: -1, op: "equals", value: "120" }]).rows).toHaveLength(1);
  });

  it("combines conditions with AND / OR", () => {
    const conds = [
      { column: 0, op: "equals" as const, value: "Ben" },
      { column: 2, op: "gte" as const, value: "100" },
    ];
    expect(filterTable(people, conds).rows).toHaveLength(0);
    expect(filterTable(people, conds, { match: "any" }).rows).toHaveLength(3);
  });

  it("throws a readable error on invalid regex", () => {
    expect(() => filterTable(people, [{ column: 0, op: "regex", value: "(" }])).toThrow(/Invalid regular expression/);
  });
});

describe("merge", () => {
  const a = { name: "a.csv", table: { headers: ["id", "name"], rows: [["1", "x"], ["2", "y"]] } };
  const b = { name: "b.csv", table: { headers: ["Name ", "id", "score"], rows: [["z", "3", "9"]] } };

  it("stacks tables aligning headers", () => {
    const strict = stackTables([a, b]);
    expect(strict.headers).toEqual(["id", "name", "Name ", "score"]);
    const loose = stackTables([a, b], { looseHeaders: true, sourceColumn: "source" });
    expect(loose.headers).toEqual(["id", "name", "score", "source"]);
    expect(loose.rows).toEqual([
      ["1", "x", "", "a.csv"],
      ["2", "y", "", "a.csv"],
      ["3", "z", "9", "b.csv"],
    ]);
  });

  it("joins on key columns (inner, left, outer)", () => {
    const users = { name: "users", table: { headers: ["id", "name"], rows: [["1", "Asha"], ["2", "Ben"], ["3", "Chen"]] } };
    const orders = { name: "orders", table: { headers: ["user_id", "total", "name"], rows: [["1", "50", "o1"], ["1", "20", "o2"], ["4", "5", "o3"]] } };
    const inner = joinTables([users, orders], { keys: ["id", "user_id"] });
    expect(inner.headers).toEqual(["id", "name", "total", "name (orders)"]);
    expect(inner.rows).toEqual([
      ["1", "Asha", "50", "o1"],
      ["1", "Asha", "20", "o2"],
    ]);
    expect(joinTables([users, orders], { keys: ["id", "user_id"], type: "left" }).rows).toHaveLength(4);
    const outer = joinTables([users, orders], { keys: ["id", "user_id"], type: "outer" });
    expect(outer.rows).toHaveLength(5);
    expect(outer.rows[4]).toEqual(["4", "", "5", "o3"]);
    expect(() => joinTables([users, orders], { keys: ["id", "nope"] })).toThrow(/not found/);
  });
});

describe("split", () => {
  it("splits by rows per file with zero-padded names", () => {
    const t: Table = { headers: ["n"], rows: Array.from({ length: 25 }, (_, i) => [String(i)]) };
    const parts = splitByRows(t, 10);
    expect(parts.map((p) => p.table.rows.length)).toEqual([10, 10, 5]);
    expect(parts[0].name).toBe("part-1");
    expect(splitByRows(t, 2)[0].name).toBe("part-01");
    expect(parts.every((p) => p.table.headers[0] === "n")).toBe(true);
  });

  it("splits by column value with safe unique names", () => {
    const parts = splitByColumn(people, 1);
    expect(parts.map((p) => p.name)).toEqual(["Delhi", "London", "delhi-2", "(empty)"]);
    expect(parts[1].table.rows).toHaveLength(2);
  });
});
