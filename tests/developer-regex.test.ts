import { describe, expect, it } from "vitest";
import { captureGroupNames, runRegex, segmentText, validateFlags } from "@/lib/processors/developer/regex";
import { checkExamples, inferRegex, REGEX_PRESETS, toStringLiteral, tokenize } from "@/lib/processors/developer/regex-generate";

describe("regex tester", () => {
  it("finds all matches with groups, names and indices", () => {
    const r = runRegex("(?<year>\\d{4})-(\\d{2})", "g", "a 2024-01 b 1999-12");
    expect(r.ok).toBe(true);
    expect(r.matches).toHaveLength(2);
    expect(r.matches[1]).toMatchObject({ index: 12, end: 19, value: "1999-12" });
    expect(r.matches[0].groups[0]).toMatchObject({ index: 1, name: "year", value: "2024", start: 2, end: 6 });
    expect(r.matches[0].groups[1]).toMatchObject({ index: 2, name: undefined, value: "01" });
    expect(r.groupCount).toBe(2);
    expect(r.groupNames).toEqual(["year"]);
  });
  it("returns only the first match without g", () => {
    expect(runRegex("o", "", "foo").matches).toHaveLength(1);
  });
  it("handles flags i, m, s, y, u", () => {
    expect(runRegex("^b", "gm", "a\nb\nB").matches).toHaveLength(1);
    expect(runRegex("^b", "gim", "a\nb\nB").matches).toHaveLength(2);
    expect(runRegex("a.b", "", "a\nb").matches).toHaveLength(0);
    expect(runRegex("a.b", "s", "a\nb").matches).toHaveLength(1);
    expect(runRegex("a", "y", "ba").matches).toHaveLength(0);
    expect(runRegex("\\p{L}+", "gu", "héllo wörld").matches.map((m) => m.value)).toEqual(["héllo", "wörld"]);
  });
  it("advances past zero-length matches (incl. surrogate pairs with u)", () => {
    expect(runRegex("", "g", "abc").matches).toHaveLength(4);
    expect(runRegex("", "gu", "😀").matches).toHaveLength(2);
  });
  it("reports syntax and flag errors", () => {
    expect(runRegex("(", "", "x")).toMatchObject({ ok: false });
    expect(runRegex("a", "gq", "x").error).toMatch(/Unknown flag/);
    expect(validateFlags("gg")).toMatch(/repeated/);
    expect(validateFlags("uv")).toMatch(/cannot be combined/);
  });
  it("previews replacements with group references", () => {
    expect(runRegex("(\\w+)@(\\w+)", "g", "a@b c@d", "$2 at $1").replaced).toBe("b at a d at c");
    expect(runRegex("(?<n>\\d)", "g", "1 2", "[$<n>]").replaced).toBe("[1] [2]");
  });
  it("caps match counts", () => {
    const r = runRegex("a", "g", "a".repeat(20), undefined, 10);
    expect(r.matches).toHaveLength(10);
    expect(r.truncated).toBe(true);
  });
  it("maps capture group names, skipping lookarounds and classes", () => {
    expect(captureGroupNames("(a)(?:b)(?<x>c)[(](?<=d)(?<y>e)\\(")).toEqual({ 2: "x", 3: "y" });
  });
  it("segments text for highlighting", () => {
    const r = runRegex("b+", "g", "abbcb");
    expect(segmentText("abbcb", r.matches)).toEqual([{ text: "a" }, { text: "bb", match: 0 }, { text: "c" }, { text: "b", match: 1 }]);
  });
});

describe("regex generator", () => {
  it("every preset matches its examples and rejects counter-examples", () => {
    for (const p of REGEX_PRESETS) {
      const results = checkExamples(p.pattern, p.flags, p.matches, p.rejects);
      const wrong = results.filter((r) => r.expected !== r.actual).map((r) => `${p.id}: ${r.text}`);
      expect(wrong).toEqual([]);
    }
  });
  it("tokenizes into kinds", () => {
    expect(tokenize("AB-12 x").map((t) => t.kind)).toEqual(["alpha", "lit", "digit", "space", "alpha"]);
  });
  it("infers positional patterns", () => {
    const r = inferRegex(["ABC-123", "XYZ-987"])!;
    expect(r.pattern).toBe("^[A-Z]{3}-\\d{3}$");
    expect(r.strategy).toBe("positional");
    const dates = inferRegex(["2024-01-05", "1999-12-31"])!;
    expect(dates.pattern).toBe("^\\d{4}-\\d{2}-\\d{2}$");
    expect(inferRegex(["ab1", "abcd22"])!.pattern).toBe("^[a-z]{2,4}\\d{1,2}$");
    expect(inferRegex(["ab1", "abcd22"], { exactLengths: false })!.pattern).toBe("^[a-z]+\\d+$");
    expect(inferRegex(["id: 7", "id: 42"])!.pattern).toBe("^id:\\s\\d{1,2}$");
    expect(inferRegex(["id: 7", "id: 42"], { keepLiterals: false, asciiDigits: true })!.pattern).toBe("^[a-z]{2}:\\s[0-9]{1,2}$");
    expect(inferRegex(["a.b", "a_b"])!.pattern).toBe("^a[._]b$");
  });
  it("falls back to a union class when structures differ", () => {
    const r = inferRegex(["abc", "12-x"])!;
    expect(r.strategy).toBe("union");
    expect(r.pattern).toBe("^[\\da-z\\-]{3,4}$");
    for (const e of ["abc", "12-x"]) expect(new RegExp(r.pattern, r.flags).test(e)).toBe(true);
  });
  it("uses unicode classes for non-ASCII letters", () => {
    const r = inferRegex(["José", "Zoë"])!;
    expect(r.flags).toBe("u");
    expect(new RegExp(r.pattern, r.flags).test("Zoë")).toBe(true);
  });
  it("produces string literals for other languages", () => {
    expect(toStringLiteral('\\d+"')).toBe('"\\\\d+\\""');
    expect(inferRegex(["", ""])).toBeNull();
  });
});
