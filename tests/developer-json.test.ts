import { describe, expect, it } from "vitest";
import {
  JsonParseError,
  beautifyRelaxedJson,
  findUnsafeIntegerLiterals,
  formatJson,
  jsonStats,
  minifyJson,
  parseJson,
  parseJsonDetailed,
  parseRelaxedJson,
  stringifyJson,
} from "@/lib/processors/developer/json";

function err(fn: () => unknown): JsonParseError {
  try {
    fn();
  } catch (e) {
    if (e instanceof JsonParseError) return e;
    throw e;
  }
  throw new Error("expected a JsonParseError");
}

describe("JSON formatting", () => {
  it("formats with 2, 4 spaces and tabs", () => {
    expect(formatJson('{"a":1,"b":[1,2]}')).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
    expect(formatJson('{"a":1}', { indent: 4 })).toBe('{\n    "a": 1\n}');
    expect(formatJson('{"a":1}', { indent: "tab" })).toBe('{\n\t"a": 1\n}');
  });
  it("sorts keys recursively without touching array order", () => {
    expect(formatJson('{"b":{"z":1,"a":2},"a":[3,1]}', { sortKeys: true, indent: 2 })).toBe(
      '{\n  "a": [\n    3,\n    1\n  ],\n  "b": {\n    "a": 2,\n    "z": 1\n  }\n}',
    );
  });
  it("minifies", () => {
    expect(minifyJson('{\n  "a" : [ 1 , 2 ],\n  "s": "x y"\n}')).toBe('{"a":[1,2],"s":"x y"}');
  });
  it("escapes non-ASCII on request", () => {
    expect(stringifyJson({ s: "é😀" }, { indent: 0, escapeUnicode: true })).toBe('{"s":"\\u00e9\\ud83d\\ude00"}');
  });
  it("keeps __proto__ as a normal key when sorting", () => {
    const out = formatJson('{"__proto__":{"x":1},"a":1}', { sortKeys: true, indent: 0 as never });
    expect(JSON.parse(out)).toHaveProperty("__proto__");
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
  it("handles scalars at the top level", () => {
    expect(formatJson("  42 ")).toBe("42");
    expect(formatJson('"hi"')).toBe('"hi"');
    expect(formatJson("null")).toBe("null");
  });
});

describe("JSON validation errors with line and column", () => {
  it("reports a missing comma", () => {
    const e = err(() => parseJson('{\n  "a": 1\n  "b": 2\n}'));
    expect(e.line).toBe(3);
    expect(e.column).toBe(3);
    expect(e.reason).toMatch(/Expected ',' or '}'/);
  });
  it("reports trailing commas", () => {
    const e = err(() => parseJson('[1,2,]'));
    expect(e.reason).toMatch(/Trailing comma/);
    expect(e.column).toBe(6);
  });
  it("reports single quotes, comments and unquoted keys", () => {
    expect(err(() => parseJson("{'a':1}")).reason).toMatch(/double-quoted property name/);
    expect(err(() => parseJson("['a']")).reason).toMatch(/double quotes/);
    expect(err(() => parseJson('{"a":1 // c\n}')).reason).toMatch(/Comments/);
    expect(err(() => parseJson("{a:1}")).reason).toMatch(/double-quoted/);
  });
  it("reports bad numbers, literals and escapes", () => {
    expect(err(() => parseJson("01")).reason).toMatch(/leading zeros/);
    expect(err(() => parseJson("[.5]")).reason).toMatch(/Invalid number/);
    expect(err(() => parseJson("tru")).reason).toMatch(/expected a value/);
    expect(err(() => parseJson('"\\x"')).reason).toMatch(/Invalid escape/);
    expect(err(() => parseJson('"a\nb"')).reason).toMatch(/line break/);
  });
  it("reports unterminated structures and trailing data", () => {
    expect(err(() => parseJson('{"a": [1, 2')).reason).toMatch(/Unterminated array/);
    expect(err(() => parseJson('"abc')).reason).toMatch(/Unterminated string/);
    expect(err(() => parseJson("{} {}")).reason).toMatch(/after the end/);
    expect(err(() => parseJson("   ")).reason).toMatch(/empty/);
  });
  it("detects duplicate keys", () => {
    expect(parseJsonDetailed('{"a":1,"b":{"a":2},"a":3}').duplicateKeys).toEqual(["a"]);
  });
  it("finds integers that lose precision", () => {
    expect(findUnsafeIntegerLiterals('{"id": 12345678901234567890, "s": "12345678901234567890", "ok": 9007199254740991}')).toEqual([
      "12345678901234567890",
    ]);
  });
});

describe("relaxed JSON (beautifier)", () => {
  it("repairs comments, trailing commas, single quotes and unquoted keys", () => {
    const src = `// config\n{\n  name: 'demo', /* inline */\n  list: [1, 2, 3,],\n  'quoted': "x",\n  # hash comment\n  nested: { ok: true, },\n}`;
    const r = beautifyRelaxedJson(src, { indent: 2 });
    expect(JSON.parse(r.output)).toEqual({ name: "demo", list: [1, 2, 3], quoted: "x", nested: { ok: true } });
    expect(r.repairs.comments).toBe(3);
    expect(r.repairs.trailingCommas).toBe(3);
    expect(r.repairs.singleQuotedStrings).toBe(2);
    expect(r.repairs.unquotedKeys).toBe(4);
  });
  it("accepts hex, leading + and bare decimals", () => {
    const r = parseRelaxedJson("[0x1F, +1, .5, 5.]");
    expect(r.value).toEqual([31, 1, 0.5, 5]);
    expect(r.repairs.otherNumbers).toBe(4);
  });
  it("handles escaped single quotes", () => {
    expect(parseRelaxedJson("{'it\\'s': 'ok'}").value).toEqual({ "it's": "ok" });
  });
  it("still rejects values with no JSON form", () => {
    expect(() => parseRelaxedJson("{a: NaN}")).toThrow(/no JSON representation/);
    expect(() => parseRelaxedJson("{a: }")).toThrow(JsonParseError);
  });
});

describe("JSON stats", () => {
  it("counts structure", () => {
    const s = jsonStats(JSON.parse('{"a":[1,"x",null,{"b":true}],"c":{}}'));
    expect(s).toMatchObject({ type: "object", depth: 4, objects: 3, arrays: 1, keys: 3, strings: 1, numbers: 1, booleans: 1, nulls: 1 });
  });
});
