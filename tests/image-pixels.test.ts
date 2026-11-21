import { describe, expect, it } from "vitest";
import {
  adjust,
  applyInRegion,
  autoLevels,
  boxesForGauss,
  buildToneLut,
  createPixels,
  cropPixels,
  flipHorizontal,
  flipVertical,
  gaussianBlur,
  grayscale,
  pixelate,
  rotate90,
  unsharpMask,
  type Pixels,
} from "@/lib/processors/image/pixels";
import { encodeBmp } from "@/lib/processors/image/bmp";
import { alphaMask, applyMask, blurBackground, compositeOver, parseHexColor, refineMask } from "@/lib/processors/image/composite";
import { executeJob } from "@/lib/processors/image/jobs";

/** 3×2 image with distinct pixels: value = index*10 in R, alpha 255. */
function sample(): Pixels {
  const p = createPixels(3, 2);
  for (let i = 0; i < 6; i++) p.data.set([i * 10, i, 0, 255], i * 4);
  return p;
}
const reds = (d: Uint8ClampedArray) => Array.from(d.filter((_, i) => i % 4 === 0));

describe("tone and colour", () => {
  it("grayscale uses BT.709 weights and keeps alpha", () => {
    const p = createPixels(1, 1, [255, 0, 0, 128]);
    const out = grayscale(p, "bt709");
    expect(out[0]).toBe(54); // 0.2126 × 255
    expect(out[1]).toBe(54);
    expect(out[3]).toBe(128);
    expect(grayscale(p, "average")[0]).toBe(85);
    expect(grayscale(p, "red")[0]).toBe(255);
    expect(grayscale(p, "bt709", 0)[0]).toBe(255); // amount 0 = unchanged
  });

  it("brightness and contrast LUTs behave at the extremes", () => {
    const [r] = buildToneLut({ brightness: 100 });
    expect(r[0]).toBe(255);
    const [c] = buildToneLut({ contrast: 100 });
    expect(c[100]).toBe(0);
    expect(c[200]).toBe(255);
    const [n] = buildToneLut({});
    for (let v = 0; v < 256; v++) expect(n[v]).toBe(v);
    const [g] = buildToneLut({ gamma: 2 });
    expect(g[64]).toBeGreaterThan(64);
  });

  it("saturation −100 makes gray, hue 0/sat 0 is identity", () => {
    const p = createPixels(1, 1, [200, 50, 50, 255]);
    const gray = adjust(p, { saturation: -100 });
    expect(Math.abs(gray[0] - gray[1])).toBeLessThanOrEqual(1);
    expect(Math.abs(gray[1] - gray[2])).toBeLessThanOrEqual(1);
    expect(Array.from(adjust(p, {}))).toEqual([200, 50, 50, 255]);
  });

  it("hue rotation by 120° moves red towards green", () => {
    const out = adjust(createPixels(1, 1, [255, 0, 0, 255]), { hue: 120 });
    expect(out[1]).toBeGreaterThan(out[0]);
  });

  it("temperature warms (more red, less blue)", () => {
    const out = adjust(createPixels(1, 1, [100, 100, 100, 255]), { temperature: 50 });
    expect(out[0]).toBeGreaterThan(100);
    expect(out[2]).toBeLessThan(100);
  });

  it("auto levels stretches a low-contrast image", () => {
    const p = createPixels(10, 1);
    for (let i = 0; i < 10; i++) p.data.set([100 + i * 5, 100 + i * 5, 100 + i * 5, 255], i * 4);
    const levels = autoLevels(p, 0);
    expect(levels.low[0]).toBe(100);
    expect(levels.high[0]).toBe(145);
    const out = adjust(p, { levels });
    expect(out[0]).toBe(0);
    expect(out[36]).toBe(255);
  });
});

describe("blur, sharpen, pixelate", () => {
  it("computes box sizes for a Gaussian", () => {
    const b = boxesForGauss(2, 3);
    expect(b).toHaveLength(3);
    for (const s of b) expect(s % 2).toBe(1);
  });

  it("blur preserves a uniform image and spreads an impulse symmetrically", () => {
    const flat = createPixels(9, 9, [80, 90, 100, 255]);
    const fb = gaussianBlur(flat, 3);
    for (let i = 0; i < fb.length; i += 4) expect(Array.from(fb.subarray(i, i + 4))).toEqual([80, 90, 100, 255]);
    const p = createPixels(11, 11, [0, 0, 0, 255]);
    p.data.set([255, 255, 255, 255], (5 * 11 + 5) * 4);
    const out = gaussianBlur(p, 1.5);
    const at = (x: number, y: number) => out[(y * 11 + x) * 4];
    expect(at(5, 5)).toBeLessThan(255);
    expect(at(4, 5)).toBeGreaterThan(0);
    expect(at(4, 5)).toBe(at(6, 5));
    expect(at(5, 4)).toBe(at(5, 6));
  });

  it("blur doesn't darken edges next to transparency (premultiplied)", () => {
    const p = createPixels(6, 1, [255, 255, 255, 255]);
    for (let x = 3; x < 6; x++) p.data.set([0, 0, 0, 0], x * 4);
    const out = gaussianBlur(p, 1);
    expect(out[2 * 4]).toBe(255); // colour stays white even though alpha drops
    expect(out[2 * 4 + 3]).toBeLessThan(255);
  });

  it("unsharp mask increases edge contrast and respects threshold", () => {
    const p = createPixels(8, 1);
    for (let x = 0; x < 8; x++) p.data.set(x < 4 ? [100, 100, 100, 255] : [150, 150, 150, 255], x * 4);
    const out = unsharpMask(p, 1, 1, 0);
    expect(out[3 * 4]).toBeLessThan(100);
    expect(out[4 * 4]).toBeGreaterThan(150);
    const none = unsharpMask(p, 1, 1, 255);
    expect(Array.from(none)).toEqual(Array.from(p.data));
  });

  it("pixelate averages blocks", () => {
    const p = createPixels(2, 2);
    p.data.set([0, 0, 0, 255, 100, 0, 0, 255, 200, 0, 0, 255, 100, 0, 0, 255]);
    expect(reds(pixelate(p, 2))).toEqual([100, 100, 100, 100]);
    expect(reds(pixelate(p, 1))).toEqual([0, 100, 200, 100]);
  });

  it("applies a filter only inside a region", () => {
    const p = createPixels(4, 4);
    for (let i = 0; i < 16; i++) p.data.set([i * 16, 0, 0, 255], i * 4);
    const out = applyInRegion(p, { x: 0, y: 0, width: 2, height: 2 }, (s) => pixelate(s, 2));
    const avg = Math.round((0 + 16 + 64 + 80) / 4);
    expect(out[0]).toBe(avg);
    expect(out[(1 * 4 + 1) * 4]).toBe(avg);
    expect(out[(3 * 4 + 3) * 4]).toBe(p.data[(3 * 4 + 3) * 4]);
  });
});

describe("geometry index math", () => {
  it("flips horizontally and vertically", () => {
    const p = sample();
    expect(reds(flipHorizontal(p))).toEqual([20, 10, 0, 50, 40, 30]);
    expect(reds(flipVertical(p))).toEqual([30, 40, 50, 0, 10, 20]);
  });

  it("rotates by quarter turns", () => {
    const p = sample(); // [0 10 20; 30 40 50]
    const cw = rotate90(p, 1);
    expect([cw.width, cw.height]).toEqual([2, 3]);
    expect(reds(cw.data)).toEqual([30, 0, 40, 10, 50, 20]);
    const r180 = rotate90(p, 2);
    expect(reds(r180.data)).toEqual([50, 40, 30, 20, 10, 0]);
    const ccw = rotate90(p, 3);
    expect(reds(ccw.data)).toEqual([20, 50, 10, 40, 0, 30]);
    expect(reds(rotate90(rotate90(p, 1), 3).data)).toEqual(reds(p.data));
  });

  it("crops a rectangle, clamped to bounds", () => {
    const c = cropPixels(sample(), { x: 1, y: 0, width: 5, height: 1 });
    expect([c.width, c.height]).toEqual([2, 1]);
    expect(reds(c.data)).toEqual([10, 20]);
  });

  it("runs jobs through the shared dispatcher", async () => {
    const r = await executeJob({ op: "flip", horizontal: true, vertical: true }, sample());
    expect(reds(r.pixels!.data)).toEqual([50, 40, 30, 20, 10, 0]);
    const g = await executeJob({ op: "grayscale", method: "average", amount: 1, sepia: 0 }, createPixels(1, 1, [30, 60, 90, 255]));
    expect(Array.from(g.pixels!.data)).toEqual([60, 60, 60, 255]);
  });

  it("traces a two-colour image to SVG with imagetracerjs", async () => {
    const p = createPixels(16, 16, [255, 255, 255, 255]);
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) p.data.set([0, 0, 0, 255], (y * 16 + x) * 4);
    const r = await executeJob({ op: "trace", options: { numberofcolors: 2, colorsampling: 0, pathomit: 0 } }, p);
    expect(r.text).toMatch(/^<svg/);
    expect(r.text).toContain("<path");
  });
});

describe("BMP encoder", () => {
  it("writes a 24-bit bottom-up BMP for opaque images", () => {
    const p = createPixels(2, 1);
    p.data.set([255, 0, 0, 255, 0, 0, 255, 255]);
    const b = encodeBmp(p);
    const dv = new DataView(b.buffer);
    expect(String.fromCharCode(b[0], b[1])).toBe("BM");
    expect(dv.getUint32(2, true)).toBe(b.length);
    expect(dv.getUint16(28, true)).toBe(24);
    expect(dv.getInt32(18, true)).toBe(2);
    const off = dv.getUint32(10, true);
    expect(Array.from(b.subarray(off, off + 6))).toEqual([0, 0, 255, 255, 0, 0]); // BGR BGR
    expect(b.length).toBe(54 + 8); // row padded to 8 bytes
  });

  it("writes 32-bit with alpha masks when transparent", () => {
    const b = encodeBmp(createPixels(1, 1, [1, 2, 3, 4]));
    const dv = new DataView(b.buffer);
    expect(dv.getUint16(28, true)).toBe(32);
    expect(dv.getUint32(30, true)).toBe(3);
    expect(dv.getUint32(66, true)).toBe(0xff000000);
    expect(Array.from(b.subarray(122, 126))).toEqual([3, 2, 1, 4]);
  });
});

describe("mask compositing", () => {
  it("extracts, refines and applies masks", () => {
    const p = createPixels(4, 1, [10, 20, 30, 255]);
    p.data[3] = 0;
    p.data[7] = 100;
    p.data[11] = 160;
    const m = alphaMask(p);
    expect(Array.from(m)).toEqual([0, 100, 160, 255]);
    expect(Array.from(refineMask(m, 4, 1, { hardness: 100 }))).toEqual([0, 0, 255, 255]);
    expect(Array.from(refineMask(m, 4, 1, { hardness: 100, shift: 20 }))).toEqual([0, 255, 255, 255]);
    const applied = applyMask(createPixels(4, 1, [1, 1, 1, 255]), m);
    expect(applied[3]).toBe(0);
    expect(applied[15]).toBe(255);
  });

  it("composites foreground over a background", () => {
    const fg = createPixels(1, 1, [255, 0, 0, 255]);
    const bg = new Uint8ClampedArray([0, 0, 255, 255]);
    expect(Array.from(compositeOver(fg, new Uint8ClampedArray([128]), bg))).toEqual([128, 0, 127, 255]);
    expect(Array.from(compositeOver(fg, new Uint8ClampedArray([255]), bg))).toEqual([255, 0, 0, 255]);
  });

  it("blurs the background without bleeding the subject colour", () => {
    const src = createPixels(9, 1, [0, 0, 255, 255]);
    src.data.set([255, 0, 0, 255], 4 * 4); // red subject in the middle
    const mask = new Uint8ClampedArray(9);
    mask[4] = 255;
    const out = blurBackground(src, mask, 2);
    expect(out[3 * 4]).toBe(0); // neighbour stays pure blue
    expect(out[3 * 4 + 2]).toBe(255);
  });

  it("parses hex colours", () => {
    expect(parseHexColor("#ff8000")).toEqual([255, 128, 0]);
    expect(parseHexColor("0f0")).toEqual([0, 255, 0]);
  });
});
