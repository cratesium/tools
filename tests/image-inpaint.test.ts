import { describe, expect, it } from "vitest";
import { dilateMask, inpaint } from "@/lib/processors/image/inpaint";
import { createPixels } from "@/lib/processors/image/pixels";

function holeMask(w: number, h: number, x0: number, y0: number, x1: number, y1: number) {
  const m = new Uint8Array(w * h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * w + x] = 1;
  return m;
}

describe("inpainting", () => {
  it("fills a hole in a flat image with the surrounding colour (both methods)", () => {
    for (const method of ["smooth", "patch"] as const) {
      const p = createPixels(40, 40, [120, 60, 30, 255]);
      const mask = holeMask(40, 40, 15, 15, 25, 25);
      for (let i = 0; i < mask.length; i++) if (mask[i]) p.data.set([255, 255, 255, 255], i * 4); // "watermark"
      const out = inpaint(p, mask, { method, patchRadius: 3, searchRadius: 15 });
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        expect(Math.abs(out[i * 4] - 120)).toBeLessThanOrEqual(1);
        expect(Math.abs(out[i * 4 + 1] - 60)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("smooth fill reconstructs a linear gradient (harmonic solution)", () => {
    const w = 60,
      h = 20;
    const p = createPixels(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.data.set([x * 4, 0, 0, 255], (y * w + x) * 4);
    const mask = holeMask(w, h, 20, 5, 40, 15);
    const out = inpaint(p, mask, { method: "smooth", iterations: 2000 });
    let maxErr = 0;
    for (let y = 5; y < 15; y++) for (let x = 20; x < 40; x++) maxErr = Math.max(maxErr, Math.abs(out[(y * w + x) * 4] - x * 4));
    expect(maxErr).toBeLessThanOrEqual(4);
  });

  it("patch fill continues a texture (vertical stripes)", () => {
    const w = 48,
      h = 48;
    const p = createPixels(w, h);
    const stripe = (x: number) => (Math.floor(x / 3) % 2 ? 230 : 20);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.data.set([stripe(x), stripe(x), stripe(x), 255], (y * w + x) * 4);
    const mask = holeMask(w, h, 18, 18, 30, 30);
    const out = inpaint(p, mask, { method: "patch", patchRadius: 3, searchRadius: 20 });
    let wrong = 0;
    for (let y = 18; y < 30; y++) for (let x = 18; x < 30; x++) if (Math.abs(out[(y * w + x) * 4] - stripe(x)) > 30) wrong++;
    expect(wrong / 144).toBeLessThan(0.1);
  });

  it("leaves unmasked pixels untouched and reports progress", () => {
    const p = createPixels(20, 20);
    for (let i = 0; i < p.data.length; i++) p.data[i] = (i * 7) % 256;
    const mask = holeMask(20, 20, 8, 8, 12, 12);
    const seen: number[] = [];
    const out = inpaint(p, mask, { method: "smooth", onProgress: (f) => seen.push(f) });
    for (let i = 0; i < mask.length; i++) if (!mask[i]) expect(out.subarray(i * 4, i * 4 + 4)).toEqual(p.data.subarray(i * 4, i * 4 + 4));
    expect(seen.at(-1)).toBe(1);
  });

  it("refuses a fully masked image and handles an empty mask", () => {
    const p = createPixels(4, 4, [1, 2, 3, 255]);
    expect(() => inpaint(p, new Uint8Array(16).fill(1), { method: "smooth" })).toThrow(/whole image/);
    expect(Array.from(inpaint(p, new Uint8Array(16), { method: "patch" }))).toEqual(Array.from(p.data));
  });

  it("dilates masks", () => {
    const m = holeMask(5, 5, 2, 2, 3, 3);
    const d = dilateMask(m, 5, 5, 1);
    expect(d.reduce((s, v) => s + v, 0)).toBe(9);
  });
});
