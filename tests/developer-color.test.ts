import { describe, expect, it } from "vitest";
import { contrastRatio, formatAll, nearestNamed, parseColor, rgbToOklch, wcag, toHex, oklchToRgb, rgbToHsl, rgbToCmyk } from "@/lib/processors/developer/color";
import { DEFAULT_GRADIENT, gradientCss, gradientRule } from "@/lib/processors/developer/gradient";

const rgb = (s: string) => {
  const c = parseColor(s);
  return [Math.round(c.r), Math.round(c.g), Math.round(c.b), c.a];
};

describe("color parsing", () => {
  it("parses hex, rgb, hsl, hwb, cmyk, oklch, names", () => {
    expect(rgb("#1e293b")).toEqual([30, 41, 59, 1]);
    expect(rgb("#abc")).toEqual([170, 187, 204, 1]);
    expect(rgb("#ff000080")).toEqual([255, 0, 0, 0.502]);
    expect(rgb("rgb(30, 41, 59)")).toEqual([30, 41, 59, 1]);
    expect(rgb("rgb(30 41 59 / 50%)")).toEqual([30, 41, 59, 0.5]);
    expect(rgb("rgba(100%, 0%, 0%, 0.25)")).toEqual([255, 0, 0, 0.25]);
    expect(rgb("hsl(0 100% 50%)")).toEqual([255, 0, 0, 1]);
    expect(rgb("hsl(120deg, 100%, 25%)")).toEqual([0, 128, 0, 1]);
    expect(rgb("hsl(0.5turn 100% 50%)")).toEqual([0, 255, 255, 1]);
    expect(rgb("hwb(0 0% 0%)")).toEqual([255, 0, 0, 1]);
    expect(rgb("hwb(0 60% 60%)")).toEqual([128, 128, 128, 1]);
    expect(rgb("cmyk(0%, 100%, 100%, 0%)")).toEqual([255, 0, 0, 1]);
    expect(rgb("rebeccapurple")).toEqual([102, 51, 153, 1]);
    expect(rgb("oklch(62.8% 0.2577 29.23)")).toEqual([255, 0, 0, 1]);
    expect(rgb("oklch(100% 0 0)")).toEqual([255, 255, 255, 1]);
    expect(rgb("transparent")[3]).toBe(0);
  });
  it("rejects invalid input with messages", () => {
    expect(() => parseColor("#12345")).toThrow(/3, 4, 6 or 8/);
    expect(() => parseColor("rgb(1,2)")).toThrow(/expects 3/);
    expect(() => parseColor("lab(50 0 0)")).toThrow(/Unsupported/);
    expect(() => parseColor("nonsense")).toThrow(/Unrecognized/);
  });
});

describe("color conversion", () => {
  it("formats all outputs", () => {
    const f = formatAll(parseColor("#ff0000"));
    expect(f.hex).toBe("#ff0000");
    expect(f.rgb).toBe("rgb(255 0 0)");
    expect(f.rgbLegacy).toBe("rgb(255, 0, 0)");
    expect(f.hsl).toBe("hsl(0 100% 50%)");
    expect(f.hwb).toBe("hwb(0 0% 0%)");
    expect(f.cmyk).toBe("cmyk(0%, 100%, 100%, 0%)");
    expect(f.oklch).toBe("oklch(62.8% 0.2577 29.23)");
    expect(formatAll(parseColor("rgb(0 0 0 / .5)")).hex).toBe("#00000080");
  });
  it("round-trips through every format", () => {
    for (const hex of ["#1e293b", "#e2e8f0", "#0ea5e9", "#84cc16", "#f97316", "#000000", "#ffffff", "#808080"]) {
      const f = formatAll(parseColor(hex));
      for (const s of [f.rgb, f.hsl, f.hwb, f.oklch, f.oklab]) expect(toHex(parseColor(s)), `${hex} via ${s}`).toBe(hex);
    }
  });
  it("computes OKLCH and HSL/CMYK values", () => {
    const l = rgbToOklch(255, 255, 255);
    expect(l.L).toBeCloseTo(1, 4);
    expect(l.C).toBeLessThan(1e-4);
    expect(oklchToRgb(0.7, 0.4, 150).inGamut).toBe(false);
    expect(rgbToHsl(30, 41, 59).h).toBeCloseTo(217.24, 1);
    expect(rgbToCmyk(0, 0, 0)).toEqual({ c: 0, m: 0, y: 0, k: 100 });
    expect(nearestNamed(parseColor("#ff0001")).name).toBe("red");
    expect(nearestNamed(parseColor("#ff0000")).exact).toBe(true);
  });
  it("computes WCAG contrast", () => {
    const w = { r: 255, g: 255, b: 255 }, b = { r: 0, g: 0, b: 0 };
    expect(contrastRatio(w, b)).toBeCloseTo(21, 5);
    const r = wcag({ r: 0x76, g: 0x76, b: 0x76 }, w);
    expect(r.ratio).toBeCloseTo(4.54, 2);
    expect(r.aaNormal).toBe(true);
    expect(r.aaaNormal).toBe(false);
  });
});

describe("gradient", () => {
  it("builds linear, radial and conic CSS", () => {
    expect(gradientCss(DEFAULT_GRADIENT)).toBe("linear-gradient(135deg, #0f172a 0%, #475569 55%, #e2e8f0 100%)");
    const stops = [{ id: "1", color: "#fff", position: 100 }, { id: "2", color: "#000", position: 0 }];
    expect(gradientCss({ ...DEFAULT_GRADIENT, type: "radial", shape: "circle", stops })).toBe("radial-gradient(circle, #000 0%, #fff 100%)");
    expect(gradientCss({ ...DEFAULT_GRADIENT, type: "radial", centerX: 25, centerY: 75, stops })).toBe("radial-gradient(ellipse at 25% 75%, #000 0%, #fff 100%)");
    expect(gradientCss({ ...DEFAULT_GRADIENT, type: "conic", angle: 90, stops, repeating: true })).toBe("repeating-conic-gradient(from 90deg, #000 0%, #fff 100%)");
    expect(gradientRule(DEFAULT_GRADIENT)).toContain("background-color: #0f172a;");
  });
});
