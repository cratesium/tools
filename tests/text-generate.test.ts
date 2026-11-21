import { describe, expect, it } from "vitest";
import { defaultSlugOptions, slugify, transliterate, unslug, defaultUnslugOptions } from "@/lib/processors/text/slug";
import { generateLorem, LOREM_WORDS } from "@/lib/processors/text/lorem";
import { decode, detectScheme, encode, SCHEMES, type Scheme } from "@/lib/processors/text/encoder";

describe("slugify", () => {
  it("basic slugs", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("  Multiple   spaces -- and---dashes  ")).toBe("multiple-spaces-and-dashes");
    expect(slugify("Don't panic")).toBe("dont-panic");
  });
  it("strips diacritics and transliterates special letters", () => {
    expect(slugify("Crème brûlée à la française")).toBe("creme-brulee-a-la-francaise");
    expect(slugify("Straße in Łódź, Ærø")).toBe("strasse-in-lodz-aero");
    expect(slugify("Привет, мир")).toBe("privet-mir");
    expect(slugify("Αθήνα")).toBe("athina");
    expect(transliterate("Ñandú")).toBe("Nandu");
  });
  it("symbols, separators, case and stop words", () => {
    expect(slugify("Rock & Roll @ 100%")).toBe("rock-and-roll-at-100-percent");
    expect(slugify("Hello World", { ...defaultSlugOptions, separator: "_", lowercase: false })).toBe("Hello_World");
    expect(slugify("The Best of the Web", { ...defaultSlugOptions, removeStopWords: true })).toBe("best-web");
  });
  it("max length cuts on a word boundary", () => {
    expect(slugify("one two three four", { ...defaultSlugOptions, maxLength: 10 })).toBe("one-two");
    expect(slugify("supercalifragilistic", { ...defaultSlugOptions, maxLength: 5 })).toBe("super");
  });
  it("keeps or drops non-Latin scripts", () => {
    expect(slugify("東京 tower")).toBe("tower");
    expect(slugify("東京 tower", { ...defaultSlugOptions, keepUnicode: true })).toBe("東京-tower");
  });
});

describe("unslug", () => {
  it("restores readable text", () => {
    expect(unslug("hello-world_again")).toBe("Hello world again");
    expect(unslug("https://example.com/blog/the-lord-of-the-rings.html?x=1", { ...defaultUnslugOptions, case: "title" })).toBe(
      "The Lord of the Rings",
    );
    expect(unslug("caf%C3%A9-menu", { ...defaultUnslugOptions, case: "lower" })).toBe("café menu");
    expect(unslug("123-my-post-4567", { ...defaultUnslugOptions, stripIds: true })).toBe("My post");
  });
});

describe("lorem ipsum", () => {
  const base = { unit: "paragraphs", count: 3, startWithLorem: true, format: "text", seed: 7 } as const;
  it("is deterministic for a seed", () => {
    expect(generateLorem(base)).toBe(generateLorem(base));
    expect(generateLorem(base)).not.toBe(generateLorem({ ...base, seed: 8 }));
  });
  it("starts with the classic phrase", () => {
    expect(generateLorem(base).startsWith("Lorem ipsum dolor sit amet, consectetur adipiscing elit")).toBe(true);
    expect(generateLorem({ ...base, startWithLorem: false }).startsWith("Lorem ipsum")).toBe(false);
  });
  it("produces the requested amounts", () => {
    expect(generateLorem(base).split("\n\n")).toHaveLength(3);
    const words = generateLorem({ ...base, unit: "words", count: 50 });
    expect(words.split(" ")).toHaveLength(50);
    expect(words.split(" ").every((w) => LOREM_WORDS.includes(w.toLowerCase()))).toBe(true);
    expect(generateLorem({ ...base, unit: "sentences", count: 4 }).match(/[.?](\s|$)/g)).toHaveLength(4);
  });
  it("formats HTML and markdown lists", () => {
    expect(generateLorem({ ...base, format: "html" }).match(/<p>/g)).toHaveLength(3);
    const list = generateLorem({ ...base, unit: "list", count: 3, format: "markdown" });
    expect(list.split("\n").every((l) => l.startsWith("- "))).toBe(true);
    expect(generateLorem({ ...base, unit: "list", count: 2, format: "html" })).toMatch(/^<ul>\n {2}<li>.*<\/li>\n {2}<li>.*<\/li>\n<\/ul>$/);
  });
  it("clamps absurd counts", () => {
    expect(generateLorem({ ...base, count: 10_000 }).split("\n\n")).toHaveLength(200);
  });
});

describe("text encoder/decoder", () => {
  const sample = "Héllo, wörld! 😀 <tag> & \"q\" 'a'";
  it.each(SCHEMES.filter((s) => s.value !== "morse").map((s) => s.value))("%s round-trips Unicode", (scheme) => {
    expect(decode(encode(sample, scheme as Scheme), scheme as Scheme)).toBe(sample);
  });
  it("known vectors", () => {
    expect(encode("Man", "base64")).toBe("TWFu");
    expect(encode("€", "base64")).toBe("4oKs");
    expect(encode("ÿÿ?", "base64url")).toBe("w7_Dvz8");
    expect(decode("4oKs", "base64url")).toBe("€");
    expect(decode("TWE", "base64")).toBe("Ma");
    expect(encode("a b&c", "url")).toBe("a%20b%26c");
    expect(decode("a+b%20c", "url")).toBe("a b c");
    expect(encode("<é>", "html")).toBe("&lt;&#233;&gt;");
    expect(decode("&amp;&#x1F600;&copy;&unknown;", "html")).toBe("&😀©&unknown;");
    expect(encode("é😀", "unicode")).toBe("\\u00e9\\ud83d\\ude00");
    expect(decode("\\u{1F600}\\x41", "unicode")).toBe("😀A");
    expect(encode("Hi€", "hex")).toBe("48 69 e2 82 ac");
    expect(decode("0x48,0x69", "hex")).toBe("Hi");
    expect(encode("A", "binary")).toBe("01000001");
    expect(encode("A😀", "decimal")).toBe("65 128512");
    expect(encode("Hello", "rot13")).toBe("Uryyb");
    expect(encode("SOS help", "morse")).toBe("... --- ... / .... . .-.. .--.");
    expect(decode("... --- ... / .... . .-.. .--.", "morse")).toBe("SOS HELP");
  });
  it("reports invalid input", () => {
    expect(() => decode("abc$", "base64")).toThrow(/not valid Base64/);
    expect(() => decode("/w==", "base64")).toThrow(/UTF-8/);
    expect(() => decode("%E0%A4%A", "url")).toThrow(/percent/);
    expect(() => decode("abc", "hex")).toThrow(/pairs/);
    expect(() => decode("0101", "binary")).toThrow(/8 bits/);
    expect(() => encode("ü", "morse")).toThrow(/no symbol/);
    expect(() => decode("......-", "morse")).toThrow(/Unknown/);
  });
  it("guesses schemes", () => {
    expect(detectScheme("... --- ...")).toBe("morse");
    expect(detectScheme("01000001 01000010")).toBe("binary");
    expect(detectScheme("48 69")).toBe("hex");
    expect(detectScheme("a%20b")).toBe("url");
    expect(detectScheme("SGVsbG8gd29ybGQ=")).toBe("base64");
    expect(detectScheme("hello")).toBeNull();
  });
});
