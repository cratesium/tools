import { describe, expect, it } from "vitest";
import { minifySql, tokenizeSql } from "@/lib/processors/developer/sql-minify";
import { validateSql } from "@/lib/processors/developer/sql-validate";
import { formatSql } from "@/lib/processors/developer/code-format";

describe("SQL minifier", () => {
  it("removes comments and collapses whitespace", () => {
    expect(minifySql("-- header\nSELECT  a,\n       b   -- trailing\nFROM   t  /* block */\nWHERE  x = 1 ;")).toBe("SELECT a,b FROM t WHERE x=1;");
  });
  it("never alters string literals or quoted identifiers", () => {
    const sql = "SELECT 'a  -- not a comment', \"Col  Name\", `x  y`, [a  b], 'it''s', 'c:\\\\  d' FROM t";
    expect(minifySql(sql)).toBe(sql.replace(/,\s/g, ","));
  });
  it("keeps dollar-quoted bodies", () => {
    const body = "$$\nBEGIN\n  -- keep\n  RETURN 1;\nEND;\n$$";
    expect(minifySql(`CREATE FUNCTION f() RETURNS int AS ${body} LANGUAGE plpgsql;`)).toContain(body);
  });
  it("handles nested block comments and inserts a space when a comment separated tokens", () => {
    expect(minifySql("SELECT/* a /* nested */ still */a FROM t")).toBe("SELECT a FROM t");
  });
  it("does not create accidental comments", () => {
    expect(minifySql("SELECT 1 - -1")).toBe("SELECT 1 - -1");
    expect(minifySql("SELECT 4 / *x")).not.toContain("/*");
  });
  it("supports hints, # comments and one statement per line", () => {
    expect(minifySql("SELECT /*+ INDEX(t i) */ a FROM t", { keepHints: true })).toBe("SELECT /*+ INDEX(t i) */ a FROM t");
    expect(minifySql("SELECT a # mysql comment\nFROM t", { hashComments: true })).toBe("SELECT a FROM t");
    expect(minifySql("SELECT 1;\n\nSELECT 2;", { statementPerLine: true })).toBe("SELECT 1;\nSELECT 2;");
  });
  it("tokenizes strings and comments", () => {
    expect(tokenizeSql("a 'b' -- c").map((t) => t.t)).toEqual(["word", "ws", "str", "ws", "comment"]);
  });
});

describe("SQL formatter", () => {
  it("formats with dialect and keyword case", async () => {
    expect(await formatSql("select a,b from t where x=1", { dialect: "mysql" })).toBe("SELECT\n  a,\n  b\nFROM\n  t\nWHERE\n  x = 1");
    expect(await formatSql("SELECT a FROM t", { dialect: "postgresql", keywordCase: "lower", tabWidth: 4 })).toBe("select\n    a\nfrom\n    t");
  });
  it("reports parse errors with line and column", async () => {
    await expect(formatSql("select ( from", { dialect: "postgresql" })).rejects.toMatchObject({ line: 1, column: 14 });
  });
});

describe("SQL syntax validator (node-sql-parser)", () => {
  it("accepts valid MySQL and lists statements and tables", async () => {
    const r = await validateSql("SELECT u.id FROM users u JOIN orders o ON o.uid = u.id; UPDATE t SET a = 1", "mysql");
    expect(r.valid).toBe(true);
    expect(r.statements).toEqual(["SELECT", "UPDATE"]);
    expect(r.tables).toEqual(expect.arrayContaining(["SELECT users", "SELECT orders", "UPDATE t"]));
  });
  it("reports syntax errors with line, column and expectations", async () => {
    const r = await validateSql("SELECT a\nFROM t\nWHER x = 1", "mysql");
    expect(r.valid).toBe(false);
    expect(r.line).toBe(3);
    expect(r.column).toBeGreaterThan(0);
    expect(r.message).toMatch(/Unexpected/);
  });
  it("is dialect aware", async () => {
    expect((await validateSql("SELECT TOP 5 name FROM people", "transactsql")).valid).toBe(true);
    expect((await validateSql("SELECT TOP 5 name FROM people", "postgresql")).valid).toBe(false);
    expect((await validateSql("SELECT a::int FROM t", "postgresql")).valid).toBe(true);
  });
  it("rejects empty input", async () => {
    expect((await validateSql("  ", "sqlite")).valid).toBe(false);
  });
});
