import { describe, expect, it } from "vitest";
import { base64Length, base64Snippets, bytesToBase64, decodeLenient, parseBase64Image } from "@/lib/processors/image/base64";
import { detectImageMime, extFromMime, mimeFromName, normalizeFormat } from "@/lib/processors/image/formats";
import { centeredAspectRect, clampCrop, computeResize, dragCrop, fitWithin, rotatedBounds } from "@/lib/processors/image/geometry";
import { intrinsicSvgSize, parseSvgSize, setSvgSize, svgLengthToPx } from "@/lib/processors/image/svg";

const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("format detection", () => {
  it("detects images from magic bytes", () => {
    expect(detectImageMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]))).toBe("image/png");
    expect(detectImageMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectImageMime(new TextEncoder().encode("GIF89a"))).toBe("image/gif");
    expect(detectImageMime(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(detectImageMime(new TextEncoder().encode("\0\0\0\x18ftypheic"))).toBe("image/heic");
    expect(detectImageMime(new TextEncoder().encode("\0\0\0\x1cftypavif"))).toBe("image/avif");
    expect(detectImageMime(new TextEncoder().encode('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe("image/svg+xml");
    expect(detectImageMime(new TextEncoder().encode("hello"))).toBeNull();
  });

  it("normalises format names and maps extensions", () => {
    expect(normalizeFormat("JPG")).toBe("jpeg");
    expect(normalizeFormat("image/webp")).toBe("webp");
    expect(normalizeFormat("tiff")).toBeNull();
    expect(mimeFromName("photo.HEIC")).toBe("image/heic");
    expect(extFromMime("image/jpeg")).toBe("jpg");
    expect(extFromMime("image/svg+xml")).toBe("svg");
  });
});

describe("base64", () => {
  it("parses data URIs and raw base64 and detects the real type", () => {
    const a = parseBase64Image(`data:image/png;base64,${PNG_1PX}`);
    expect(a.wasDataUri).toBe(true);
    expect(a.declaredMime).toBe("image/png");
    expect(a.detectedMime).toBe("image/png");
    expect(a.bytes.length).toBe(70);
    const b = parseBase64Image(PNG_1PX.replace(/=+$/, "").replace(/(.{20})/g, "$1\n"));
    expect(b.wasDataUri).toBe(false);
    expect(b.mime).toBe("image/png");
  });

  it("unwraps CSS url() and <img src> and URL-safe alphabets", () => {
    expect(parseBase64Image(`background: url("data:image/png;base64,${PNG_1PX}");`).mime).toBe("image/png");
    expect(parseBase64Image(`<img src="data:image/png;base64,${PNG_1PX}">`).mime).toBe("image/png");
    const urlSafe = bytesToBase64(Uint8Array.from([0xfb, 0xff, 0xbf])).replace(/\+/g, "-").replace(/\//g, "_");
    expect(Array.from(decodeLenient(urlSafe))).toEqual([0xfb, 0xff, 0xbf]);
  });

  it("decodes percent-encoded SVG data URIs", () => {
    const r = parseBase64Image("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E");
    expect(r.mime).toBe("image/svg+xml");
  });

  it("rejects invalid input with a clear message", () => {
    expect(() => parseBase64Image("")).toThrow(/Paste/);
    expect(() => parseBase64Image("abc$def")).toThrow(/Invalid Base64 character "\$"/);
    expect(() => parseBase64Image("abcde")).toThrow(/invalid length/);
    expect(() => parseBase64Image("data:image/png;base64")).toThrow(/comma/);
  });

  it("round-trips and builds snippets", () => {
    const bytes = Uint8Array.from({ length: 100000 }, (_, i) => i % 256);
    const b64 = bytesToBase64(bytes);
    expect(b64.length).toBe(base64Length(bytes.length));
    expect(Array.from(decodeLenient(b64).subarray(0, 5))).toEqual([0, 1, 2, 3, 4]);
    const s = base64Snippets("image/png", "AAAA", 'my "logo"');
    expect(s.css).toBe('background-image: url("data:image/png;base64,AAAA");');
    expect(s.html).toContain("&quot;logo&quot;");
    expect(s.markdown).toBe('![my "logo"](data:image/png;base64,AAAA)');
  });
});

describe("resize and crop maths", () => {
  it("computes sizes in px and percent with aspect lock", () => {
    expect(computeResize(4000, 3000, { mode: "percent", percent: 25, lockAspect: true })).toEqual({ width: 1000, height: 750 });
    expect(computeResize(4000, 3000, { mode: "px", width: 800, lockAspect: true })).toEqual({ width: 800, height: 600 });
    expect(computeResize(4000, 3000, { mode: "px", height: 300, lockAspect: true })).toEqual({ width: 400, height: 300 });
    expect(computeResize(4000, 3000, { mode: "px", width: 500, height: 500, lockAspect: true })).toEqual({ width: 500, height: 375 });
    expect(computeResize(4000, 3000, { mode: "px", width: 500, height: 500, lockAspect: false })).toEqual({ width: 500, height: 500 });
    expect(computeResize(400, 300, { mode: "px", width: 800, lockAspect: true, noUpscale: true })).toEqual({ width: 400, height: 300 });
    expect(computeResize(3, 3, { mode: "percent", percent: 1, lockAspect: true })).toEqual({ width: 1, height: 1 });
  });

  it("fits within a long edge", () => {
    expect(fitWithin(4000, 2000, 1000)).toEqual({ width: 1000, height: 500, scale: 0.25 });
    expect(fitWithin(100, 50, 1000).scale).toBe(1);
  });

  it("computes rotated bounds", () => {
    expect(rotatedBounds(400, 200, 90)).toEqual({ width: 200, height: 400 });
    expect(rotatedBounds(400, 200, 180)).toEqual({ width: 400, height: 200 });
    const b = rotatedBounds(100, 100, 45);
    expect(b.width).toBe(141);
  });

  it("centres aspect rectangles and clamps typed crops", () => {
    expect(centeredAspectRect(1000, 500, 1)).toEqual({ x: 250, y: 0, width: 500, height: 500 });
    expect(clampCrop({ x: -10, y: 900, width: 5000, height: 50 }, 1000, 500)).toEqual({ x: 0, y: 450, width: 1000, height: 50 });
  });

  it("drags crop handles within bounds and keeps aspect", () => {
    const bounds = { width: 1000, height: 800 };
    const start = { x: 100, y: 100, width: 400, height: 300 };
    expect(dragCrop(start, "move", 900, 900, bounds, null)).toEqual({ x: 600, y: 500, width: 400, height: 300 });
    expect(dragCrop(start, "se", 100, 0, bounds, null)).toEqual({ x: 100, y: 100, width: 500, height: 300 });
    const sq = dragCrop(start, "se", 200, 0, bounds, 1);
    expect(sq.width).toBe(sq.height);
    expect(sq.x).toBe(100);
    const clamped = dragCrop(start, "nw", -500, -500, bounds, 4 / 3);
    expect(clamped.x).toBeGreaterThanOrEqual(0);
    expect(clamped.y).toBeGreaterThanOrEqual(0);
    expect(Math.abs(clamped.width / clamped.height - 4 / 3)).toBeLessThan(0.02);
    expect(clamped.x + clamped.width).toBe(500);
  });
});

describe("SVG sizing", () => {
  it("converts lengths", () => {
    expect(svgLengthToPx("10")).toBe(10);
    expect(svgLengthToPx("1in")).toBe(96);
    expect(svgLengthToPx("72pt")).toBe(96);
    expect(svgLengthToPx("50%")).toBeNull();
  });

  it("reads intrinsic size from attributes or viewBox", () => {
    const a = parseSvgSize('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"></svg>');
    expect(intrinsicSvgSize(a)).toMatchObject({ width: 120, height: 60, source: "attributes" });
    const b = parseSvgSize("<svg viewBox='0 0 24 12'><path/></svg>");
    expect(intrinsicSvgSize(b)).toMatchObject({ width: 24, height: 12, source: "viewBox" });
    const c = parseSvgSize('<svg width="100%" viewBox="0,0,50,25"/>');
    expect(intrinsicSvgSize(c)).toMatchObject({ width: 50, height: 25 });
    const d = parseSvgSize('<svg width="48" viewBox="0 0 24 12"/>');
    expect(intrinsicSvgSize(d)).toMatchObject({ width: 48, height: 24 });
  });

  it("sets an explicit size, adding a viewBox when missing", () => {
    const out = setSvgSize('<?xml version="1.0"?><svg width="10" height="20" xmlns="http://www.w3.org/2000/svg"><rect/></svg>', 100, 200);
    expect(out).toContain('width="100"');
    expect(out).toContain('height="200"');
    expect(out).toContain('viewBox="0 0 10 20"');
    expect(out).not.toContain('width="10"');
    expect(out.startsWith('<?xml version="1.0"?><svg')).toBe(true);
    const kept = setSvgSize('<svg viewBox="0 0 5 5"></svg>', 50, 50);
    expect(kept.match(/viewBox/g)).toHaveLength(1);
    expect(kept).toContain('xmlns="http://www.w3.org/2000/svg"');
  });
});
