import { describe, expect, it } from "vitest";
import { parseUrl, urlDecode, urlDecodeFully, urlEncode } from "@/lib/processors/developer/url";
import { decodeEntities, decodeEntitiesDetailed, encodeEntities, NAMED_ENTITIES } from "@/lib/processors/developer/entities";

describe("url encoding", () => {
  const s = "a b&c=d/é?#!'()*~";
  it("encodes per mode", () => {
    expect(urlEncode(s, "component")).toBe("a%20b%26c%3Dd%2F%C3%A9%3F%23!'()*~");
    expect(urlEncode(s, "uri")).toBe("a%20b&c=d/%C3%A9?#!'()*~");
    expect(urlEncode(s, "form")).toBe("a+b%26c%3Dd%2F%C3%A9%3F%23%21%27%28%29%2A~");
    expect(urlEncode(s, "all")).toBe("a%20b%26c%3Dd%2F%C3%A9%3F%23%21%27%28%29%2A~");
  });
  it("decodes and handles plus and errors", () => {
    expect(urlDecode("a+b%20c")).toBe("a+b c");
    expect(urlDecode("a+b%20c", true)).toBe("a b c");
    expect(urlDecode("%F0%9F%98%80")).toBe("😀");
    expect(() => urlDecode("100%")).toThrow(/position 4/);
    expect(() => urlDecode("%C3")).toThrow(/UTF-8/);
    expect(urlDecodeFully("%2520")).toEqual({ value: " ", passes: 2 });
  });
  it("parses URLs into parts and params", () => {
    const p = parseUrl("https://user:pw@example.com:8080/a%20b/c?x=1&y=hello%20world&x=2#frag")!;
    expect(p.hostname).toBe("example.com");
    expect(p.port).toBe("8080");
    expect(p.pathname).toBe("/a b/c");
    expect(p.params).toEqual([["x", "1"], ["y", "hello world"], ["x", "2"]]);
    expect(p.hash).toBe("#frag");
    expect(parseUrl("not a url")).toBeNull();
  });
});

describe("html entities", () => {
  it("covers the HTML4 set", () => {
    expect(Object.keys(NAMED_ENTITIES).length).toBeGreaterThanOrEqual(253);
    expect(NAMED_ENTITIES.yuml).toBe(255);
    expect(NAMED_ENTITIES.Omega).toBe(937);
    expect(NAMED_ENTITIES.omega).toBe(969);
    expect(NAMED_ENTITIES.sigmaf).toBe(962);
    expect(NAMED_ENTITIES.diams).toBe(9830);
    expect(NAMED_ENTITIES.euro).toBe(8364);
  });
  it("encodes in each mode", () => {
    const s = `<a href="x">Tom & Jerry's café © 😀</a>`;
    expect(encodeEntities(s)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s café © 😀&lt;/a&gt;");
    expect(encodeEntities(s, { mode: "named" })).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s caf&eacute; &copy; &#128512;&lt;/a&gt;");
    expect(encodeEntities("é😀", { mode: "decimal" })).toBe("&#233;&#128512;");
    expect(encodeEntities("é😀\"", { mode: "hex" })).toBe("&#xE9;&#x1F600;&#x22;");
    expect(encodeEntities(`"'`, { quotes: false })).toBe(`"'`);
    expect(encodeEntities("é", { nonAscii: true })).toBe("&#233;");
  });
  it("decodes named, numeric, astral and windows-1252 references", () => {
    expect(decodeEntities("&lt;p&gt; &amp;amp; &eacute;&nbsp;&#169;&#x1F600;&#128512; &apos;")).toBe("<p> &amp; é ©😀😀 '");
    expect(decodeEntities("&#150;&#x80;")).toBe("–€");
    expect(decodeEntities("&#0;&#xD800;")).toBe("��");
    const r = decodeEntitiesDetailed("&bogus; &amp;");
    expect(r.text).toBe("&bogus; &");
    expect(r.unknown).toEqual(["&bogus;"]);
  });
  it("round-trips", () => {
    const s = "Ünïcödé <tags> & \"quotes\" — ‘curly’ € ∑ ♥ 𝔘";
    for (const mode of ["minimal", "named", "decimal", "hex"] as const) expect(decodeEntities(encodeEntities(s, { mode }))).toBe(s);
  });
});
