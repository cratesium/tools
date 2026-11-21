import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, bytesToHex, bytesToUtf8, decodeBase64, encodeBase64, looksBinary, sniffType, Base64Error } from "@/lib/processors/developer/base64";

describe("base64", () => {
  it("matches RFC 4648 test vectors", () => {
    const v: [string, string][] = [["", ""], ["f", "Zg=="], ["fo", "Zm8="], ["foo", "Zm9v"], ["foob", "Zm9vYg=="], ["fooba", "Zm9vYmE="], ["foobar", "Zm9vYmFy"]];
    for (const [plain, enc] of v) {
      expect(encodeBase64(plain)).toBe(enc);
      expect(decodeBase64(enc)).toBe(plain);
    }
  });
  it("encodes UTF-8 and matches Buffer", () => {
    for (const s of ["héllo wörld", "日本語テキスト", "emoji 😀👍🏽", "नमस्ते"]) {
      expect(encodeBase64(s)).toBe(Buffer.from(s, "utf8").toString("base64"));
      expect(decodeBase64(encodeBase64(s))).toBe(s);
    }
  });
  it("supports URL-safe without padding", () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf, 0xfe]);
    expect(bytesToBase64(bytes)).toBe("+/+//g==");
    expect(bytesToBase64(bytes, { urlSafe: true, padding: false })).toBe("-_-__g");
    expect(Array.from(base64ToBytes("-_-__g"))).toEqual(Array.from(bytes));
    expect(Array.from(base64ToBytes("+/+//g=="))).toEqual(Array.from(bytes));
  });
  it("wraps at 76 columns (MIME)", () => {
    const out = encodeBase64("x".repeat(100), { lineLength: 76 });
    const lines = out.split("\r\n");
    expect(lines[0]).toHaveLength(76);
    expect(decodeBase64(out)).toBe("x".repeat(100));
  });
  it("tolerates whitespace, missing padding and data URLs", () => {
    expect(decodeBase64("Zm9v\n YmE")).toBe("fooba");
    expect(decodeBase64("data:text/plain;base64,aGk=")).toBe("hi");
  });
  it("reports invalid characters with position", () => {
    expect(() => base64ToBytes("Zm9v!")).toThrow(/position 5/);
    expect(() => base64ToBytes("Zm=9")).toThrow(Base64Error);
    expect(() => base64ToBytes("Z")).toThrow(/length/);
  });
  it("detects non-UTF-8 output and binary types", () => {
    const png = base64ToBytes("iVBORw0KGgo=");
    expect(bytesToUtf8(new Uint8Array([0xff, 0xfe, 0x00]))).toBeNull();
    expect(sniffType(png).ext).toBe("png");
    expect(bytesToHex(new Uint8Array([1, 171]), " ")).toBe("01 ab");
    expect(looksBinary("\u0000\u0001\u0002abc")).toBe(true);
    expect(looksBinary("hello\nworld")).toBe(false);
  });
});
