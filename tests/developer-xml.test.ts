import { describe, expect, it } from "vitest";
import { formatXml, minifyXml, tokenizeXml, validateXml } from "@/lib/processors/developer/xml";

describe("XML validation", () => {
  it("accepts well-formed XML", () => {
    expect(validateXml('<?xml version="1.0"?><a x="1"><b/><!-- c --></a>').valid).toBe(true);
  });
  it("reports mismatched tags with line and column", () => {
    const r = validateXml("<a>\n  <b>\n</a>");
    expect(r.valid).toBe(false);
    expect(r.line).toBe(3);
    expect(r.message).toMatch(/closing tag/i);
  });
  it("reports unclosed tags, bad attributes and empty input", () => {
    expect(validateXml("<a><b></b>").valid).toBe(false);
    expect(validateXml('<a x=1></a>').valid).toBe(false);
    expect(validateXml('<a x="1" x="2"></a>').valid).toBe(false);
    expect(validateXml("  ").valid).toBe(false);
  });
});

describe("XML tokenizer and formatter", () => {
  it("tokenizes every construct", () => {
    const types = tokenizeXml('<?xml version="1.0"?><!DOCTYPE n [<!ENTITY e "x>y">]><?pi a?><n a=">"><!--c--><![CDATA[<x>]]>t<e/></n>').map((t) => t.type);
    expect(types).toEqual(["decl", "doctype", "pi", "open", "comment", "cdata", "text", "selfclose", "close"]);
  });
  it("pretty prints while preserving comments, CDATA, PIs and DOCTYPE", () => {
    const src = '<?xml version="1.0"?><!DOCTYPE note><note  id = "1"><!-- hi --><to>Tove</to><body><![CDATA[a < b]]></body><empty></empty><?render fast?><list><i>1</i><i>2</i></list></note>';
    expect(formatXml(src)).toBe(
      [
        '<?xml version="1.0"?>',
        "<!DOCTYPE note>",
        '<note id="1">',
        "  <!-- hi -->",
        "  <to>Tove</to>",
        "  <body><![CDATA[a < b]]></body>",
        "  <empty></empty>",
        "  <?render fast?>",
        "  <list>",
        "    <i>1</i>",
        "    <i>2</i>",
        "  </list>",
        "</note>",
      ].join("\n"),
    );
  });
  it("supports tabs, 4 spaces and self-closing empty elements", () => {
    expect(formatXml("<a><b></b></a>", { indent: "tab", selfCloseEmpty: true })).toBe("<a>\n\t<b/>\n</a>");
    expect(formatXml("<a><b>x</b></a>", { indent: 4 })).toBe("<a>\n    <b>x</b>\n</a>");
  });
  it("reformats already-indented XML idempotently", () => {
    const once = formatXml("<a>\n<b>\n   <c>1</c>\n</b>\n</a>");
    expect(formatXml(once)).toBe(once);
  });
  it("keeps attribute values (including > and whitespace) untouched", () => {
    expect(formatXml('<a title="x  >  y"   b="2"/>')).toBe('<a title="x  >  y" b="2"/>');
  });
  it("copies xml:space=preserve elements verbatim", () => {
    expect(formatXml('<r><p xml:space="preserve">  a\n  <b> b </b></p></r>')).toBe('<r>\n  <p xml:space="preserve">  a\n  <b> b </b></p>\n</r>');
  });
  it("minifies and optionally removes comments", () => {
    expect(minifyXml("<a>\n  <!-- c -->\n  <b> x </b>\n</a>")).toBe("<a><!-- c --><b>x</b></a>");
    expect(minifyXml("<a>\n  <!-- c -->\n  <b>x</b>\n</a>", { removeComments: true })).toBe("<a><b>x</b></a>");
  });
});
