import { describe, expect, it } from "vitest";
import { decodeText, detectDelimiter, escapeField, parseCsv, stringifyCsv, stripBom } from "@/lib/processors/data/csv";

const rows = (text: string, delimiter?: "," | ";" | "\t" | "|") => parseCsv(text, { delimiter: delimiter ?? "," }).rows;

describe("CSV parser (RFC 4180)", () => {
  it("parses simple records with LF, CRLF and CR endings", () => {
    expect(rows("a,b,c\n1,2,3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
    expect(rows("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
    expect(rows("a,b\r1,2\r")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("returns no rows for empty input and ignores a single trailing newline", () => {
    expect(rows("")).toEqual([]);
    expect(rows("a\n")).toEqual([["a"]]);
  });

  it("handles quoted fields with delimiters, escaped quotes and embedded newlines", () => {
    const text = 'name,quote\n"Smith, John","He said ""hi"""\n"multi\nline","x\r\ny"\n';
    expect(rows(text)).toEqual([
      ["name", "quote"],
      ["Smith, John", 'He said "hi"'],
      ["multi\nline", "x\r\ny"],
    ]);
  });

  it("keeps empty fields, including leading and trailing ones", () => {
    expect(rows(",a,,b,")).toEqual([["", "a", "", "b", ""]]);
    expect(rows('""')).toEqual([[""]]);
    expect(rows('a,""\n')).toEqual([["a", ""]]);
    expect(rows("a,\n")).toEqual([["a", ""]]);
  });

  it("skips blank lines by default but can keep them", () => {
    expect(rows("a\n\nb\n")).toEqual([["a"], ["b"]]);
    expect(parseCsv("a\n\nb", { delimiter: ",", skipEmptyLines: false }).rows).toEqual([["a"], [""], ["b"]]);
  });

  it("strips a UTF-8 BOM", () => {
    expect(rows("﻿id,name\n1,x")).toEqual([["id", "name"], ["1", "x"]]);
    expect(stripBom("﻿x")).toBe("x");
  });

  it("treats quotes inside unquoted fields literally and keeps text after a closing quote", () => {
    expect(rows('5" screen,ok')).toEqual([['5" screen', "ok"]]);
    expect(rows('"abc"def,g')).toEqual([["abcdef", "g"]]);
  });

  it("reports unterminated quotes without throwing", () => {
    const r = parseCsv('a,"open\nstill', { delimiter: "," });
    expect(r.rows).toEqual([["a", "open\nstill"]]);
    expect(r.warnings[0]).toMatch(/Unterminated/);
  });

  it("preserves whitespace and unicode", () => {
    expect(rows(" a , b ")).toEqual([[" a ", " b "]]);
    expect(rows("नाम,शहर\nराम,दिल्ली")).toEqual([["नाम", "शहर"], ["राम", "दिल्ली"]]);
  });

  it("supports other delimiters", () => {
    expect(rows("a;b\n1;2", ";")).toEqual([["a", "b"], ["1", "2"]]);
    expect(rows("a\tb\n\"x\ty\"\t2", "\t")).toEqual([["a", "b"], ["x\ty", "2"]]);
    expect(rows("a|b", "|")).toEqual([["a", "b"]]);
  });

  it("respects maxRows", () => {
    expect(parseCsv("1\n2\n3\n4", { delimiter: ",", maxRows: 2 }).rows).toEqual([["1"], ["2"]]);
  });
});

describe("delimiter detection", () => {
  it("detects comma, semicolon, tab and pipe", () => {
    expect(detectDelimiter("a,b,c\n1,2,3\n4,5,6")).toBe(",");
    expect(detectDelimiter("a;b;c\n1,5;2;3\n4;5;6")).toBe(";");
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
    expect(detectDelimiter("a|b|c\n1|2|3")).toBe("|");
  });

  it("ignores delimiters inside quotes", () => {
    expect(detectDelimiter('"a,b,c";d\n"1,2,3";4\n"x,y";z')).toBe(";");
  });

  it("defaults to comma for single-column input", () => {
    expect(detectDelimiter("one\ntwo\nthree")).toBe(",");
  });

  it("is used by parseCsv when delimiter is auto", () => {
    const r = parseCsv("﻿x;y\n1;2", { delimiter: "auto" });
    expect(r.delimiter).toBe(";");
    expect(r.rows).toEqual([["x", "y"], ["1", "2"]]);
  });
});

describe("CSV serializer", () => {
  it("quotes only when needed", () => {
    expect(escapeField("plain")).toBe("plain");
    expect(escapeField("a,b")).toBe('"a,b"');
    expect(escapeField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeField("line\nbreak")).toBe('"line\nbreak"');
    expect(escapeField(" padded")).toBe('" padded"');
    expect(escapeField("a;b", ";")).toBe('"a;b"');
    expect(escapeField("a;b", ",")).toBe("a;b");
    expect(escapeField(null)).toBe("");
    expect(escapeField(12.5)).toBe("12.5");
    expect(escapeField(true)).toBe("true");
  });

  it("uses CRLF by default and supports options", () => {
    expect(stringifyCsv([["a", "b"], [1, null]])).toBe("a,b\r\n1,");
    expect(stringifyCsv([["a", "b"]], { eol: "\n", quoteAll: true })).toBe('"a","b"');
    expect(stringifyCsv([["a"]], { bom: true })).toBe("﻿a");
    expect(stringifyCsv([["a", "b"]], { delimiter: "\t" })).toBe("a\tb");
  });

  it("round-trips tricky data", () => {
    const data = [
      ["id", "text", "empty"],
      ["1", 'quote " and, comma', ""],
      ["2", "multi\r\nline\nvalue", ""],
      ["3", " spaced ", '""'],
    ];
    for (const d of [",", ";", "\t", "|"] as const) {
      const text = stringifyCsv(data, { delimiter: d });
      expect(parseCsv(text, { delimiter: d }).rows).toEqual(data);
      expect(parseCsv(text).rows).toEqual(data);
    }
  });
});

describe("text decoding", () => {
  it("decodes UTF-8 (stripping BOM) and falls back to Windows-1252", () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0xc3, 0xa9]))).toBe("aé");
    expect(decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toBe("café");
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x61, 0x00]))).toBe("a");
  });
});
