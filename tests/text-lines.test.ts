import { describe, expect, it } from "vitest";
import {
  dedupeLines,
  defaultDedupeOptions,
  defaultSortOptions,
  defaultWhitespaceOptions,
  removeExtraSpaces,
  repeatText,
  reverseText,
  reverseWords,
  sortLines,
} from "@/lib/processors/text/lines";
import { countWords, paragraphDetails, sentenceDetails, smsInfo, utf8Bytes } from "@/lib/processors/text/counters";

describe("remove extra spaces", () => {
  it("collapses, trims and limits blank lines by default", () => {
    expect(removeExtraSpaces("  a   b\t\tc  \n\n\n\n d ")).toBe("a b c\n\nd");
  });
  it("normalises unicode spaces and removes zero-width chars", () => {
    expect(removeExtraSpaces("a  b​c")).toBe("a bc");
  });
  it("removes blank lines and line breaks", () => {
    expect(removeExtraSpaces("a\n\n b\n", { ...defaultWhitespaceOptions, removeBlankLines: true })).toBe("a\nb");
    expect(removeExtraSpaces("a\n  b\n\nc", { ...defaultWhitespaceOptions, removeLineBreaks: true })).toBe("a b c");
  });
  it("fixes spacing before punctuation", () => {
    expect(removeExtraSpaces("Hello , world !", { ...defaultWhitespaceOptions, fixPunctuationSpacing: true })).toBe("Hello, world!");
  });
  it("leaves everything when all options are off", () => {
    const off = Object.fromEntries(Object.keys(defaultWhitespaceOptions).map((k) => [k, false])) as unknown as typeof defaultWhitespaceOptions;
    expect(removeExtraSpaces("  a  \n\n\n b", off)).toBe("  a  \n\n\n b");
  });
});

describe("dedupe lines", () => {
  const text = "apple\nBanana\napple\nbanana\n cherry\ncherry\n\n";
  it("keeps the first occurrence (case-sensitive)", () => {
    const r = dedupeLines(text);
    expect(r.text).toBe("apple\nBanana\nbanana\n cherry\ncherry\n");
    expect(r.removed).toBe(2);
    expect(r.duplicates).toEqual([["apple", 2], ["", 2]]);
  });
  it("case-insensitive and whitespace-insensitive, removing empties", () => {
    const r = dedupeLines(text, { ...defaultDedupeOptions, caseSensitive: false, ignoreWhitespace: true, removeEmpty: true });
    expect(r.text).toBe("apple\nBanana\n cherry");
  });
  it("keeps the last occurrence", () => {
    expect(dedupeLines("a\nb\na\nc", { ...defaultDedupeOptions, keep: "last" }).text).toBe("b\na\nc");
  });
  it("unique-only and duplicates-only modes", () => {
    expect(dedupeLines("a\nb\na\nc", { ...defaultDedupeOptions, mode: "unique" }).text).toBe("b\nc");
    expect(dedupeLines("a\nb\na\nc\nb", { ...defaultDedupeOptions, mode: "duplicates" }).text).toBe("a\nb");
  });
});

describe("sort lines", () => {
  const items = "item10\nItem2\nitem1\nbanana\nApple";
  it("alphabetical, case-insensitive", () => {
    expect(sortLines(items)).toBe("Apple\nbanana\nitem1\nitem10\nItem2");
  });
  it("natural order", () => {
    expect(sortLines(items, { ...defaultSortOptions, method: "natural" })).toBe("Apple\nbanana\nitem1\nItem2\nitem10");
  });
  it("reverse (descending)", () => {
    expect(sortLines("b\na\nc", { ...defaultSortOptions, descending: true })).toBe("c\nb\na");
  });
  it("case-sensitive puts lowercase before uppercase for equal letters (ICU) deterministically", () => {
    expect(sortLines("b\nB\na\nA", { ...defaultSortOptions, caseSensitive: true })).toBe("a\nA\nb\nB");
  });
  it("by length with natural tiebreak", () => {
    expect(sortLines("ccc\na\nbb\nb", { ...defaultSortOptions, method: "length" })).toBe("a\nb\nbb\nccc");
    expect(sortLines("ccc\na\nbb", { ...defaultSortOptions, method: "length", descending: true })).toBe("ccc\nbb\na");
  });
  it("seeded shuffle is reproducible and a permutation", () => {
    const t = "1\n2\n3\n4\n5\n6\n7\n8";
    const a = sortLines(t, { ...defaultSortOptions, method: "random", seed: 42 });
    expect(a).toBe(sortLines(t, { ...defaultSortOptions, method: "random", seed: 42 }));
    expect(a.split("\n").sort()).toEqual(t.split("\n"));
    expect(a).not.toBe(t);
  });
  it("removes empty and duplicate lines", () => {
    expect(sortLines("b\n\na\nB\n", { ...defaultSortOptions, dedupe: true })).toBe("a\nb");
  });
});

describe("reverse", () => {
  it("reverses by grapheme so emoji and accents survive", () => {
    expect(reverseText("abc")).toBe("cba");
    expect(reverseText("aéb")).toBe("béa");
    expect(reverseText("hi 👍🏽🇮🇳")).toBe("🇮🇳👍🏽 ih");
  });
  it("line modes", () => {
    expect(reverseText("ab\ncd", "each-line")).toBe("ba\ndc");
    expect(reverseText("one\ntwo\nthree", "line-order")).toBe("three\ntwo\none");
    expect(reverseText("hello world", "each-word")).toBe("olleh dlrow");
  });
  it("reverses word order", () => {
    expect(reverseWords("The quick brown fox.")).toBe("fox brown quick The.");
    expect(reverseWords("a b\nc d")).toBe("b a\nd c");
    expect(reverseWords("a b\nc d", { scope: "all", keepEndPunctuation: false })).toBe("d c b a");
  });
});

describe("repeat", () => {
  it("repeats with separators and numbering", () => {
    expect(repeatText("hi", { count: 3, separator: " ", numbered: false })).toBe("hi hi hi");
    expect(repeatText("x", { count: 2, separator: "\n", numbered: true })).toBe("1. x\n2. x");
    expect(repeatText("x", { count: 0, separator: "", numbered: false })).toBe("");
  });
  it("refuses huge output", () => {
    expect(() => repeatText("abcdefghij", { count: 1_000_000, separator: "", numbered: false })).toThrow(/limit/);
  });
});

describe("counter details", () => {
  it("utf8 bytes", () => {
    expect(utf8Bytes("aé€😀")).toBe(1 + 2 + 3 + 4);
  });
  it("SMS segments for GSM-7 and UCS-2", () => {
    expect(smsInfo("")).toMatchObject({ segments: 0, remaining: 160 });
    expect(smsInfo("a".repeat(160))).toMatchObject({ encoding: "GSM-7", segments: 1, remaining: 0 });
    expect(smsInfo("a".repeat(161))).toMatchObject({ segments: 2, perSegment: 153 });
    expect(smsInfo("€")).toMatchObject({ encoding: "GSM-7", units: 2 });
    expect(smsInfo("hello 😀")).toMatchObject({ encoding: "UCS-2", units: 8, segments: 1, perSegment: 70 });
  });
  it("sentence details", () => {
    const d = sentenceDetails("Short one. This sentence is quite a bit longer than that! Ok?");
    expect(d.count).toBe(3);
    expect(d.longest?.words).toBe(9);
    expect(d.shortest?.text).toBe("Ok?");
    expect(d.avgWords).toBeCloseTo(12 / 3);
  });
  it("paragraph details", () => {
    const d = paragraphDetails("One two. Three.\n\nFour five six seven.");
    expect(d.count).toBe(2);
    expect(d.perParagraph).toEqual([3, 4]);
    expect(d.avgSentences).toBe(1.5);
    expect(countWords("")).toBe(0);
  });
});
