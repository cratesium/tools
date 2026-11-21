import { describe, expect, it } from "vitest";
import { flattenRecord, jsonToCsv, locateRecords } from "@/lib/processors/developer/convert-csv";
import { jsonToXml, xmlToJson, xmlName } from "@/lib/processors/developer/xml";
import { valueToYaml, yamlToValue, YamlError, validateYaml } from "@/lib/processors/developer/yaml";

const nested = {
  users: [
    { id: 1, name: "Ada", tags: ["admin", "dev"], address: { city: "London", geo: { lat: 51.5 } } },
    { id: 2, name: 'Bob "B", Jr', tags: [], address: { city: "Paris" }, note: "line1\nline2" },
  ],
};

describe("JSON → CSV (quick paste)", () => {
  it("flattens nested objects to dot paths and joins primitive arrays", () => {
    expect(flattenRecord(nested.users[0])).toEqual({ id: "1", name: "Ada", tags: "admin; dev", "address.city": "London", "address.geo.lat": "51.5" });
  });
  it("indexes arrays when asked", () => {
    expect(flattenRecord({ a: [{ b: 1 }, { b: 2 }] }, "index")).toEqual({ "a.0.b": "1", "a.1.b": "2" });
  });
  it("auto-locates the records array and unions headers in first-seen order", () => {
    const { csv, foundAt, table } = jsonToCsv(nested);
    expect(foundAt).toBe("users");
    expect(table.headers).toEqual(["id", "name", "tags", "address.city", "address.geo.lat", "note"]);
    expect(csv.split("\n")[0]).toBe("id,name,tags,address.city,address.geo.lat,note");
    expect(csv).toContain('2,"Bob ""B"", Jr",,Paris,,"line1\nline2"');
  });
  it("supports delimiters, no header, CRLF and an explicit path", () => {
    const { csv } = jsonToCsv({ data: { items: [{ a: "x;y", b: 2 }] } }, { path: "data.items", delimiter: ";", header: false, crlf: true });
    expect(csv).toBe('"x;y";2');
    expect(jsonToCsv([{ a: 1 }, { a: 2 }], { crlf: true }).csv).toBe("a\r\n1\r\n2");
    expect(() => locateRecords({ a: 1 }, "b.c")).toThrow(/not found/);
  });
  it("wraps a single object and scalars", () => {
    expect(jsonToCsv({ a: 1, b: { c: null } }).csv).toBe("a,b.c\n1,");
    expect(jsonToCsv([1, 2]).csv).toBe("value\n1\n2");
  });
});

describe("JSON ↔ XML", () => {
  it("converts nested objects, arrays, attributes and text", () => {
    const xml = jsonToXml({ book: { "@id": "b1", title: "A & B", authors: ["X", "Y"], meta: { pages: 10, draft: false, isbn: null } } }, { rootName: "" });
    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<book id="b1">',
        "  <title>A &amp; B</title>",
        "  <authors>X</authors>",
        "  <authors>Y</authors>",
        "  <meta>",
        "    <pages>10</pages>",
        "    <draft>false</draft>",
        "    <isbn/>",
        "  </meta>",
        "</book>",
      ].join("\n"),
    );
  });
  it("wraps top-level arrays in root/item and sanitises names", () => {
    const xml = jsonToXml([{ "first name": "a", "1x": 2 }], { declaration: false, indent: 0 });
    expect(xml).toBe("<root><item><first_name>a</first_name><_1x>2</_1x></item></root>");
    expect(xmlName("xmlThing")).toBe("_xmlThing");
  });
  it("requires one top-level key without a root", () => {
    expect(() => jsonToXml({ a: 1, b: 2 }, { rootName: "" })).toThrow(/exactly one/);
  });
  it("parses XML to JSON with attributes and repeated elements", () => {
    const v = xmlToJson('<?xml version="1.0"?><lib><book id="1"><t>A</t></book><book id="2"><t>B</t></book></lib>');
    expect(v).toEqual({ lib: { book: [{ "@id": "1", t: "A" }, { "@id": "2", t: "B" }] } });
  });
  it("round-trips JSON → XML → JSON for nested data", () => {
    const src = { root: { a: "1", list: ["x", "y"], deep: { k: "v" } } };
    expect(xmlToJson(jsonToXml(src, { rootName: "" }))).toEqual(src);
  });
  it("parses values, drops attributes and strips the root on request", () => {
    expect(xmlToJson('<r n="5"><a>3</a><b>true</b></r>', { parseValues: true, attributes: false, keepRoot: false })).toEqual({ a: 3, b: true });
  });
  it("reports malformed XML with line and column", () => {
    expect(() => xmlToJson("<a>\n  <b></a>")).toThrow(/line 2/);
  });
});

describe("JSON ↔ YAML", () => {
  it("dumps nested data", () => {
    expect(valueToYaml({ a: [1, { b: "x" }], c: null, s: "yes" })).toBe("a:\n  - 1\n  - b: x\nc: null\ns: 'yes'\n");
  });
  it("sorts keys and changes indent", () => {
    expect(valueToYaml({ b: 1, a: { d: 1, c: 2 } }, { sortKeys: true, indent: 4 })).toBe("a:\n    c: 2\n    d: 1\nb: 1\n");
  });
  it("parses YAML including anchors and multi-document streams", () => {
    expect(yamlToValue("base: &b {x: 1}\nother:\n  <<: *b\n  y: 2")).toEqual({ base: { x: 1 }, other: { x: 1, y: 2 } });
    expect(yamlToValue("a: 1\n---\nb: 2")).toEqual([{ a: 1 }, { b: 2 }]);
    expect(yamlToValue("a: 1\n---\nb: 2", "first")).toEqual({ a: 1 });
  });
  it("round-trips JSON → YAML → JSON", () => {
    const src = { name: "x", list: [1, "2", true, null, { deep: ["a"] }], empty: {}, multi: "line1\nline2" };
    expect(yamlToValue(valueToYaml(src))).toEqual(src);
  });
  it("reports 1-based line and column", () => {
    try {
      yamlToValue("a: 1\nb: [1, 2\nc: 3");
      throw new Error("no error");
    } catch (e) {
      expect(e).toBeInstanceOf(YamlError);
      expect((e as YamlError).line).toBeGreaterThanOrEqual(2);
      expect((e as YamlError).column).toBeGreaterThanOrEqual(1);
    }
    const v = validateYaml("key: value\n  bad: indent");
    expect(v.valid).toBe(false);
    expect(v.error?.line).toBe(2);
  });
});
