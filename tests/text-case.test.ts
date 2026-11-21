import { describe, expect, it } from "vitest";
import { convertCase, splitWords, toSentenceCase, toTitleCase } from "@/lib/processors/text/case";

describe("case conversion", () => {
  it("upper/lower with locale", () => {
    expect(convertCase("Hello World", "upper")).toBe("HELLO WORLD");
    expect(convertCase("Hello World", "lower")).toBe("hello world");
    expect(convertCase("istanbul", "upper", { locale: "tr" })).toBe("İSTANBUL");
    expect(convertCase("straße", "upper")).toBe("STRASSE");
  });

  it("programming cases", () => {
    const s = "Hello world, this is XMLHttpRequest v2";
    expect(convertCase(s, "camel")).toBe("helloWorldThisIsXmlHttpRequestV2");
    expect(convertCase(s, "pascal")).toBe("HelloWorldThisIsXmlHttpRequestV2");
    expect(convertCase(s, "snake")).toBe("hello_world_this_is_xml_http_request_v2");
    expect(convertCase(s, "kebab")).toBe("hello-world-this-is-xml-http-request-v2");
    expect(convertCase(s, "constant")).toBe("HELLO_WORLD_THIS_IS_XML_HTTP_REQUEST_V2");
    expect(convertCase(s, "dot")).toBe("hello.world.this.is.xml.http.request.v2");
    expect(convertCase("user_id-value", "train")).toBe("User-Id-Value");
    expect(convertCase("don't stop", "snake")).toBe("dont_stop");
    expect(convertCase("line one\nline two", "camel")).toBe("lineOne\nlineTwo");
  });

  it("splits identifiers", () => {
    expect(splitWords("parseHTTPResponse2Fast")).toEqual(["parse", "HTTP", "Response2", "Fast"]);
    expect(splitWords("café_au-lait")).toEqual(["café", "au", "lait"]);
  });

  it("alternating, inverse, capitalized", () => {
    expect(convertCase("hello world", "alternating")).toBe("hElLo WoRlD");
    expect(convertCase("Hello World", "inverse")).toBe("hELLO wORLD");
    expect(convertCase("hello wORLD it's", "capitalized")).toBe("Hello World It's");
  });

  it("title case: Chicago small words", () => {
    expect(toTitleCase("the lord of the rings")).toBe("The Lord of the Rings");
    expect(toTitleCase("a tale of two cities")).toBe("A Tale of Two Cities");
    expect(toTitleCase("what are you looking for")).toBe("What Are You Looking For");
    expect(toTitleCase("walking through the valley")).toBe("Walking through the Valley");
    expect(toTitleCase("star wars: a new hope")).toBe("Star Wars: A New Hope");
    expect(toTitleCase("step-by-step guide to self-driving cars")).toBe("Step-by-Step Guide to Self-Driving Cars");
  });

  it("title case: AP/APA capitalise words of four or more letters", () => {
    expect(toTitleCase("walking through the valley", { titleStyle: "ap" })).toBe("Walking Through the Valley");
    expect(toTitleCase("a guide with notes from experts", { titleStyle: "apa" })).toBe("A Guide With Notes From Experts");
    expect(toTitleCase("what if it rains", { titleStyle: "ap" })).toBe("What if It Rains");
    expect(toTitleCase("what if it rains", { titleStyle: "chicago" })).toBe("What If It Rains");
  });

  it("title case: preserves acronyms, mixed case and URLs", () => {
    expect(toTitleCase("how NASA uses the iPhone")).toBe("How NASA Uses the iPhone");
    expect(toTitleCase("visit example.com today")).toBe("Visit example.com Today");
    expect(toTitleCase("THE END OF THE ROAD", { preserveAcronyms: false })).toBe("The End of the Road");
  });

  it("title case: simple capitalises everything", () => {
    expect(toTitleCase("the lord of the rings", { titleStyle: "simple" })).toBe("The Lord Of The Rings");
  });

  it("sentence case", () => {
    expect(toSentenceCase("HELLO THERE. how are you? i am fine!")).toBe("Hello there. How are you? I am fine!");
    expect(toSentenceCase("first para\n\nsecond para")).toBe("First para\n\nSecond para");
    expect(toSentenceCase("i'm here")).toBe("I'm here");
  });
});
