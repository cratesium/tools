/**
 * Color parsing and conversion: HEX, RGB, HSL, HWB, CMYK, OKLab/OKLCH and CSS named
 * colors, plus WCAG 2.x contrast. Pure. Internally colors are sRGB 0–255 + alpha 0–1.
 */

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED: Record<string, string> = {
  aliceblue: "f0f8ff", antiquewhite: "faebd7", aqua: "00ffff", aquamarine: "7fffd4", azure: "f0ffff", beige: "f5f5dc",
  bisque: "ffe4c4", black: "000000", blanchedalmond: "ffebcd", blue: "0000ff", blueviolet: "8a2be2", brown: "a52a2a",
  burlywood: "deb887", cadetblue: "5f9ea0", chartreuse: "7fff00", chocolate: "d2691e", coral: "ff7f50",
  cornflowerblue: "6495ed", cornsilk: "fff8dc", crimson: "dc143c", cyan: "00ffff", darkblue: "00008b", darkcyan: "008b8b",
  darkgoldenrod: "b8860b", darkgray: "a9a9a9", darkgreen: "006400", darkgrey: "a9a9a9", darkkhaki: "bdb76b",
  darkmagenta: "8b008b", darkolivegreen: "556b2f", darkorange: "ff8c00", darkorchid: "9932cc", darkred: "8b0000",
  darksalmon: "e9967a", darkseagreen: "8fbc8f", darkslateblue: "483d8b", darkslategray: "2f4f4f", darkslategrey: "2f4f4f",
  darkturquoise: "00ced1", darkviolet: "9400d3", deeppink: "ff1493", deepskyblue: "00bfff", dimgray: "696969",
  dimgrey: "696969", dodgerblue: "1e90ff", firebrick: "b22222", floralwhite: "fffaf0", forestgreen: "228b22",
  fuchsia: "ff00ff", gainsboro: "dcdcdc", ghostwhite: "f8f8ff", gold: "ffd700", goldenrod: "daa520", gray: "808080",
  green: "008000", greenyellow: "adff2f", grey: "808080", honeydew: "f0fff0", hotpink: "ff69b4", indianred: "cd5c5c",
  indigo: "4b0082", ivory: "fffff0", khaki: "f0e68c", lavender: "e6e6fa", lavenderblush: "fff0f5", lawngreen: "7cfc00",
  lemonchiffon: "fffacd", lightblue: "add8e6", lightcoral: "f08080", lightcyan: "e0ffff", lightgoldenrodyellow: "fafad2",
  lightgray: "d3d3d3", lightgreen: "90ee90", lightgrey: "d3d3d3", lightpink: "ffb6c1", lightsalmon: "ffa07a",
  lightseagreen: "20b2aa", lightskyblue: "87cefa", lightslategray: "778899", lightslategrey: "778899",
  lightsteelblue: "b0c4de", lightyellow: "ffffe0", lime: "00ff00", limegreen: "32cd32", linen: "faf0e6", magenta: "ff00ff",
  maroon: "800000", mediumaquamarine: "66cdaa", mediumblue: "0000cd", mediumorchid: "ba55d3", mediumpurple: "9370db",
  mediumseagreen: "3cb371", mediumslateblue: "7b68ee", mediumspringgreen: "00fa9a", mediumturquoise: "48d1cc",
  mediumvioletred: "c71585", midnightblue: "191970", mintcream: "f5fffa", mistyrose: "ffe4e1", moccasin: "ffe4b5",
  navajowhite: "ffdead", navy: "000080", oldlace: "fdf5e6", olive: "808000", olivedrab: "6b8e23", orange: "ffa500",
  orangered: "ff4500", orchid: "da70d6", palegoldenrod: "eee8aa", palegreen: "98fb98", paleturquoise: "afeeee",
  palevioletred: "db7093", papayawhip: "ffefd5", peachpuff: "ffdab9", peru: "cd853f", pink: "ffc0cb", plum: "dda0dd",
  powderblue: "b0e0e6", purple: "800080", rebeccapurple: "663399", red: "ff0000", rosybrown: "bc8f8f",
  royalblue: "4169e1", saddlebrown: "8b4513", salmon: "fa8072", sandybrown: "f4a460", seagreen: "2e8b57",
  seashell: "fff5ee", sienna: "a0522d", silver: "c0c0c0", skyblue: "87ceeb", slateblue: "6a5acd", slategray: "708090",
  slategrey: "708090", snow: "fffafa", springgreen: "00ff7f", steelblue: "4682b4", tan: "d2b48c", teal: "008080",
  thistle: "d8bfd8", tomato: "ff6347", turquoise: "40e0d0", violet: "ee82ee", wheat: "f5deb3", white: "ffffff",
  whitesmoke: "f5f5f5", yellow: "ffff00", yellowgreen: "9acd32",
};

export class ColorError extends Error {}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 0) => {
  const f = 10 ** d;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? 0 : r;
};

function parseHex(h: string): RGBA {
  let s = h.replace(/^#/, "");
  if (![3, 4, 6, 8].includes(s.length) || !/^[0-9a-f]+$/i.test(s)) throw new ColorError("Hex colors need 3, 4, 6 or 8 hex digits.");
  if (s.length <= 4) s = [...s].map((c) => c + c).join("");
  const n = (i: number) => parseInt(s.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: s.length === 8 ? round(n(6) / 255, 3) : 1 };
}

/** Parses a CSS number/percentage relative to `pctOf` (e.g. 255 for rgb channels). */
function num(tok: string, pctOf: number): number {
  if (tok === "none") return 0;
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|rad|grad|turn)?$/i.exec(tok);
  if (!m) throw new ColorError(`"${tok}" is not a number.`);
  const v = parseFloat(m[1]);
  switch (m[2]?.toLowerCase()) {
    case "%": return (v / 100) * pctOf;
    case "rad": return (v * 180) / Math.PI;
    case "grad": return v * 0.9;
    case "turn": return v * 360;
    default: return v;
  }
}

function args(body: string): { parts: string[]; alpha?: string } {
  const [main, alpha] = body.split("/").map((s) => s.trim());
  const parts = main.split(/[\s,]+/).filter(Boolean);
  if (alpha == null && parts.length === 4) return { parts: parts.slice(0, 3), alpha: parts[3] };
  return { parts, alpha };
}

function alphaOf(a?: string): number {
  return a == null ? 1 : clamp(num(a, 1));
}

export function parseColor(input: string): RGBA {
  const s = input.trim().toLowerCase();
  if (!s) throw new ColorError("Enter a color.");
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (NAMED[s]) return parseHex(NAMED[s]);
  if (s.startsWith("#") || /^[0-9a-f]{6}$|^[0-9a-f]{3}$/.test(s)) return parseHex(s);
  const fn = /^([a-z]+)\((.*)\)$/.exec(s);
  if (!fn) throw new ColorError(`Unrecognized color "${input}". Try #1e293b, rgb(30 41 59), hsl(215 28% 17%) or a CSS color name.`);
  const [, name, body] = fn;
  const { parts, alpha } = args(body);
  const need = (n: number) => {
    if (parts.length !== n) throw new ColorError(`${name}() expects ${n} values, got ${parts.length}.`);
  };
  switch (name) {
    case "rgb":
    case "rgba":
      need(3);
      return { r: clamp(num(parts[0], 255), 0, 255), g: clamp(num(parts[1], 255), 0, 255), b: clamp(num(parts[2], 255), 0, 255), a: alphaOf(alpha) };
    case "hsl":
    case "hsla": {
      need(3);
      const rgb = hslToRgb(num(parts[0], 360), clamp(num(parts[1], 100), 0, 100), clamp(num(parts[2], 100), 0, 100));
      return { ...rgb, a: alphaOf(alpha) };
    }
    case "hwb": {
      need(3);
      return { ...hwbToRgb(num(parts[0], 360), clamp(num(parts[1], 100), 0, 100), clamp(num(parts[2], 100), 0, 100)), a: alphaOf(alpha) };
    }
    case "cmyk":
    case "device-cmyk": {
      if (parts.length !== 4 && !(parts.length === 3 && alpha)) need(4);
      const all = parts.length === 4 ? parts : [...parts, alpha!];
      const [c, m, y, k] = all.map((p) => clamp(num(p, 100), 0, 100));
      return { ...cmykToRgb(c, m, y, k), a: 1 };
    }
    case "oklch": {
      need(3);
      return { ...oklchToRgb(num(parts[0], 1), num(parts[1], 0.4), num(parts[2], 360)).rgb, a: alphaOf(alpha) };
    }
    case "oklab": {
      need(3);
      return { ...oklabToRgb(num(parts[0], 1), num(parts[1], 0.4), num(parts[2], 0.4)).rgb, a: alphaOf(alpha) };
    }
    default:
      throw new ColorError(`Unsupported color function "${name}()".`);
  }
}

// ---------- conversions ----------

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export function rgbToHwb(r: number, g: number, b: number): { h: number; w: number; bl: number } {
  const { h } = rgbToHsl(r, g, b);
  const w = Math.min(r, g, b) / 255;
  const v = Math.max(r, g, b) / 255;
  return { h, w: w * 100, bl: (1 - v) * 100 };
}

export function hwbToRgb(h: number, w: number, bl: number): { r: number; g: number; b: number } {
  w /= 100; bl /= 100;
  if (w + bl >= 1) {
    const gray = (w / (w + bl)) * 255;
    return { r: gray, g: gray, b: gray };
  }
  const base = hslToRgb(h, 100, 50);
  const f = (c: number) => (c / 255) * (1 - w - bl) * 255 + w * 255;
  return { r: f(base.r), g: f(base.g), b: f(base.b) };
}

export function rgbToCmyk(r: number, g: number, b: number): { c: number; m: number; y: number; k: number } {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const k = 1 - Math.max(rr, gg, bb);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  return { c: ((1 - rr - k) / (1 - k)) * 100, m: ((1 - gg - k) / (1 - k)) * 100, y: ((1 - bb - k) / (1 - k)) * 100, k: k * 100 };
}

export function cmykToRgb(c: number, m: number, y: number, k: number): { r: number; g: number; b: number } {
  c /= 100; m /= 100; y /= 100; k /= 100;
  return { r: 255 * (1 - c) * (1 - k), g: 255 * (1 - m) * (1 - k), b: 255 * (1 - y) * (1 - k) };
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const lr = toLinear(r / 255), lg = toLinear(g / 255), lb = toLinear(b / 255);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToRgb(L: number, A: number, B: number): { rgb: { r: number; g: number; b: number }; inGamut: boolean } {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const eps = 1e-4;
  const inGamut = lin.every((c) => c >= -eps && c <= 1 + eps);
  const [r, g, b] = lin.map((c) => clamp(fromLinear(clamp(c))) * 255);
  return { rgb: { r, g, b }, inGamut };
}

export function rgbToOklch(r: number, g: number, b: number): { L: number; C: number; H: number } {
  const lab = rgbToOklab(r, g, b);
  const C = Math.hypot(lab.a, lab.b);
  let H = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L: lab.L, C, H: C < 1e-4 ? 0 : H };
}

export function oklchToRgb(L: number, C: number, H: number) {
  const h = (H * Math.PI) / 180;
  return oklabToRgb(L, C * Math.cos(h), C * Math.sin(h));
}

// ---------- formatting ----------

const hex2 = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");

export function toHex(c: RGBA, forceAlpha = false): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return c.a < 1 || forceAlpha ? base + hex2(c.a * 255) : base;
}

const a = (c: RGBA) => (c.a < 1 ? ` / ${round(c.a, 3)}` : "");

export interface ColorFormats {
  hex: string;
  rgb: string;
  rgbLegacy: string;
  hsl: string;
  hwb: string;
  cmyk: string;
  oklch: string;
  oklab: string;
}

export function formatAll(c: RGBA): ColorFormats {
  const r = Math.round(c.r), g = Math.round(c.g), b = Math.round(c.b);
  const hsl = rgbToHsl(c.r, c.g, c.b);
  const hwb = rgbToHwb(c.r, c.g, c.b);
  const cmyk = rgbToCmyk(c.r, c.g, c.b);
  const lch = rgbToOklch(c.r, c.g, c.b);
  const lab = rgbToOklab(c.r, c.g, c.b);
  return {
    hex: toHex(c),
    rgb: `rgb(${r} ${g} ${b}${a(c)})`,
    rgbLegacy: c.a < 1 ? `rgba(${r}, ${g}, ${b}, ${round(c.a, 3)})` : `rgb(${r}, ${g}, ${b})`,
    hsl: `hsl(${round(hsl.h, 1)} ${round(hsl.s, 1)}% ${round(hsl.l, 1)}%${a(c)})`,
    hwb: `hwb(${round(hwb.h, 1)} ${round(hwb.w, 1)}% ${round(hwb.bl, 1)}%${a(c)})`,
    cmyk: `cmyk(${round(cmyk.c)}%, ${round(cmyk.m)}%, ${round(cmyk.y)}%, ${round(cmyk.k)}%)`,
    oklch: `oklch(${round(lch.L * 100, 2)}% ${round(lch.C, 4)} ${round(lch.H, 2)}${a(c)})`,
    oklab: `oklab(${round(lab.L * 100, 2)}% ${round(lab.a, 4)} ${round(lab.b, 4)}${a(c)})`,
  };
}

/** Nearest CSS named color by Euclidean distance in OKLab. */
export function nearestNamed(c: RGBA): { name: string; exact: boolean } {
  const target = rgbToOklab(c.r, c.g, c.b);
  let best = "black";
  let bestD = Infinity;
  for (const [name, h] of Object.entries(NAMED)) {
    const p = parseHex(h);
    const o = rgbToOklab(p.r, p.g, p.b);
    const d = (o.L - target.L) ** 2 + (o.a - target.a) ** 2 + (o.b - target.b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return { name: best, exact: bestD < 1e-9 };
}

// ---------- WCAG ----------

export function relativeLuminance(c: { r: number; g: number; b: number }): number {
  return 0.2126 * toLinear(c.r / 255) + 0.7152 * toLinear(c.g / 255) + 0.0722 * toLinear(c.b / 255);
}

export function contrastRatio(x: { r: number; g: number; b: number }, y: { r: number; g: number; b: number }): number {
  const l1 = relativeLuminance(x), l2 = relativeLuminance(y);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export interface WcagResult {
  ratio: number;
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
}

export function wcag(fg: { r: number; g: number; b: number }, bg: { r: number; g: number; b: number }): WcagResult {
  const ratio = contrastRatio(fg, bg);
  return { ratio, aaNormal: ratio >= 4.5, aaLarge: ratio >= 3, aaaNormal: ratio >= 7, aaaLarge: ratio >= 4.5 };
}
