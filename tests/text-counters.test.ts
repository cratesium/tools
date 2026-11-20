import { describe, expect, it } from "vitest";
import { countParagraphs, countSentences, countWords, textStats, wordFrequency } from "@/lib/processors/text/counters";

describe("text counters", () => {
  it("counts words including contractions and hyphenation", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("Hello, world!")).toBe(2);
    expect(countWords("It's a well-known fact.")).toBe(4);
    expect(countWords("नमस्ते दुनिया")).toBe(2);
  });
  it("counts sentences", () => {
    expect(countSentences("One. Two! Three? Four")).toBe(4);
    expect(countSentences("   ")).toBe(0);
  });
  it("counts paragraphs", () => {
    expect(countParagraphs("a\n\nb\n \n\nc")).toBe(3);
  });
  it("computes stats", () => {
    const s = textStats("The cat. The dog.\n\nEnd");
    expect(s.words).toBe(5);
    expect(s.uniqueWords).toBe(4);
    expect(s.paragraphs).toBe(2);
    expect(s.characters).toBe(22);
  });
  it("ranks frequency", () => {
    expect(wordFrequency("b a b A c", 2)).toEqual([["a", 2], ["b", 2]]);
  });
});
