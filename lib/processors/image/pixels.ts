/**
 * Pure pixel operations on RGBA buffers (Uint8ClampedArray, 4 bytes per pixel).
 * No DOM, no canvas: these run in node tests, in Web Workers and on the main thread.
 * Every function returns a new buffer unless documented otherwise.
 */

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createPixels(width: number, height: number, fill?: [number, number, number, number]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) for (let i = 0; i < data.length; i += 4) data.set(fill, i);
  return { data, width, height };
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/* ------------------------------------------------------------------ */
/* Tone and colour                                                     */
/* ------------------------------------------------------------------ */

export type GrayscaleMethod = "bt709" | "bt601" | "average" | "lightness" | "red" | "green" | "blue";

export const grayscaleMethods: { value: GrayscaleMethod; label: string; hint: string }[] = [
  { value: "bt709", label: "Luminance (BT.709)", hint: "Perceptual weights used for sRGB/HD; the best default." },
  { value: "bt601", label: "Luma (BT.601)", hint: "Classic TV weights (0.299 R, 0.587 G, 0.114 B)." },
  { value: "average", label: "Average", hint: "Equal weight for red, green and blue." },
  { value: "lightness", label: "Lightness", hint: "Midpoint of the brightest and darkest channel." },
  { value: "red", label: "Red channel", hint: "Like a red filter on black-and-white film: darker skies." },
  { value: "green", label: "Green channel", hint: "Often the most detailed channel in photos." },
  { value: "blue", label: "Blue channel", hint: "Emphasises haze and skin blemishes." },
];

export function grayValue(r: number, g: number, b: number, method: GrayscaleMethod): number {
  switch (method) {
    case "bt709":
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    case "bt601":
      return 0.299 * r + 0.587 * g + 0.114 * b;
    case "average":
      return (r + g + b) / 3;
    case "lightness":
      return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
    case "red":
      return r;
    case "green":
      return g;
    case "blue":
      return b;
  }
}

/**
 * Converts to grayscale. `amount` (0–1) blends between the original and the gray result;
 * `sepia` (0–1) tints the result with a warm brown tone.
 */
export function grayscale(src: Pixels, method: GrayscaleMethod = "bt709", amount = 1, sepia = 0): Uint8ClampedArray {
  const s = src.data;
  const out = new Uint8ClampedArray(s.length);
  for (let i = 0; i < s.length; i += 4) {
    const r = s[i],
      g = s[i + 1],
      b = s[i + 2];
    const y = grayValue(r, g, b, method);
    // Sepia tone derived from the gray value (keeps luminance roughly constant).
    const tr = y + 40 * sepia,
      tg = y + 20 * sepia,
      tb = y - 20 * sepia;
    out[i] = clamp255(r + (tr - r) * amount);
    out[i + 1] = clamp255(g + (tg - g) * amount);
    out[i + 2] = clamp255(b + (tb - b) * amount);
    out[i + 3] = s[i + 3];
  }
  return out;
}

export interface Adjustments {
  /** −100…100, additive shift of ±255 at the ends. */
  brightness?: number;
  /** −100…100. */
  contrast?: number;
  /** Exposure in stops, −3…3 (multiplies linear light). */
  exposure?: number;
  /** Gamma 0.1…5 (1 = unchanged; >1 brightens midtones). */
  gamma?: number;
  /** −100…100 (−100 = fully desaturated). */
  saturation?: number;
  /** Degrees −180…180. */
  hue?: number;
  /** −100…100, warm (positive) or cool (negative). */
  temperature?: number;
  /** −100…100, magenta (positive) or green (negative). */
  tint?: number;
  /** −100…100, saturation boost that protects already-saturated colours. */
  vibrance?: number;
  /** Per-channel input levels (black, white points 0–255) applied first, e.g. from autoLevels. */
  levels?: { low: [number, number, number]; high: [number, number, number] };
}

/** Builds the per-channel tone lookup tables (levels → exposure → brightness → contrast → gamma). */
export function buildToneLut(adj: Adjustments): [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray] {
  const brightness = ((adj.brightness ?? 0) / 100) * 255;
  const c = ((adj.contrast ?? 0) / 100) * 255;
  const cf = (259 * (c + 255)) / (255 * (259 - Math.min(c, 258.9)));
  const gamma = adj.gamma && adj.gamma > 0 ? adj.gamma : 1;
  const expo = Math.pow(2, adj.exposure ?? 0);
  const luts: Uint8ClampedArray[] = [];
  for (let ch = 0; ch < 3; ch++) {
    const lut = new Uint8ClampedArray(256);
    const low = adj.levels?.low[ch] ?? 0;
    const high = adj.levels?.high[ch] ?? 255;
    const span = Math.max(1, high - low);
    for (let v = 0; v < 256; v++) {
      let x = ((v - low) / span) * 255;
      x = clamp255(x);
      if (expo !== 1) x = 255 * Math.pow(Math.pow(x / 255, 2.2) * expo, 1 / 2.2);
      x += brightness;
      x = cf * (x - 128) + 128;
      x = clamp255(x);
      if (gamma !== 1) x = 255 * Math.pow(x / 255, 1 / gamma);
      lut[v] = Math.round(x);
    }
    luts.push(lut);
  }
  return luts as [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray];
}

/**
 * Builds a 3×3 colour matrix combining hue rotation and saturation
 * (the same luminance-preserving matrices as the SVG feColorMatrix filter).
 */
export function colorMatrix(hueDeg: number, saturation: number): number[] {
  const s = 1 + saturation / 100;
  const lr = 0.2126,
    lg = 0.7152,
    lb = 0.0722;
  const sat = [
    lr * (1 - s) + s, lg * (1 - s), lb * (1 - s),
    lr * (1 - s), lg * (1 - s) + s, lb * (1 - s),
    lr * (1 - s), lg * (1 - s), lb * (1 - s) + s,
  ];
  const a = (hueDeg * Math.PI) / 180;
  const cos = Math.cos(a),
    sin = Math.sin(a);
  const hue = [
    0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072,
  ];
  // hue × sat
  const m = new Array<number>(9);
  for (let r = 0; r < 3; r++)
    for (let col = 0; col < 3; col++)
      m[r * 3 + col] = hue[r * 3] * sat[col] + hue[r * 3 + 1] * sat[3 + col] + hue[r * 3 + 2] * sat[6 + col];
  return m;
}

/** Applies brightness/contrast/exposure/gamma/levels/saturation/hue/temperature/tint/vibrance in one pass. */
export function adjust(src: Pixels, adj: Adjustments): Uint8ClampedArray {
  const s = src.data;
  const out = new Uint8ClampedArray(s.length);
  const [lr, lg, lb] = buildToneLut(adj);
  const hue = adj.hue ?? 0;
  const sat = adj.saturation ?? 0;
  const useMatrix = hue !== 0 || sat !== 0;
  const m = useMatrix ? colorMatrix(hue, sat) : null;
  const temp = ((adj.temperature ?? 0) / 100) * 40;
  const tint = ((adj.tint ?? 0) / 100) * 40;
  const vib = (adj.vibrance ?? 0) / 100;
  for (let i = 0; i < s.length; i += 4) {
    let r = lr[s[i]],
      g = lg[s[i + 1]],
      b = lb[s[i + 2]];
    if (m) {
      const nr = m[0] * r + m[1] * g + m[2] * b;
      const ng = m[3] * r + m[4] * g + m[5] * b;
      const nb = m[6] * r + m[7] * g + m[8] * b;
      r = nr;
      g = ng;
      b = nb;
    }
    if (vib !== 0) {
      const max = Math.max(r, g, b);
      const avg = (r + g + b) / 3;
      const amt = (((Math.abs(max - avg) * 2) / 255) * -vib + vib) * 1.5; // less boost for saturated pixels
      r += (r - avg) * amt;
      g += (g - avg) * amt;
      b += (b - avg) * amt;
    }
    if (temp !== 0) {
      r += temp;
      b -= temp;
    }
    if (tint !== 0) {
      r += tint * 0.5;
      g -= tint;
      b += tint * 0.5;
    }
    out[i] = clamp255(r);
    out[i + 1] = clamp255(g);
    out[i + 2] = clamp255(b);
    out[i + 3] = s[i + 3];
  }
  return out;
}

/** Per-channel histogram (256 bins each) of opaque-ish pixels. */
export function histogram(src: Pixels): { r: Uint32Array; g: Uint32Array; b: Uint32Array; l: Uint32Array } {
  const r = new Uint32Array(256),
    g = new Uint32Array(256),
    b = new Uint32Array(256),
    l = new Uint32Array(256);
  const s = src.data;
  for (let i = 0; i < s.length; i += 4) {
    if (s[i + 3] < 8) continue;
    r[s[i]]++;
    g[s[i + 1]]++;
    b[s[i + 2]]++;
    l[Math.round(0.2126 * s[i] + 0.7152 * s[i + 1] + 0.0722 * s[i + 2])]++;
  }
  return { r, g, b, l };
}

function percentile(hist: Uint32Array, total: number, frac: number, fromTop: boolean): number {
  const target = total * frac;
  let acc = 0;
  if (!fromTop) {
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc > target) return v;
    }
    return 255;
  }
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc > target) return v;
  }
  return 0;
}

/**
 * Finds black/white input levels that stretch the histogram, clipping `clip` (fraction, e.g. 0.005)
 * at each end. `perChannel` also neutralises colour casts; otherwise one luminance range is used.
 */
export function autoLevels(src: Pixels, clip = 0.005, perChannel = false): NonNullable<Adjustments["levels"]> {
  const h = histogram(src);
  let total = 0;
  for (let v = 0; v < 256; v++) total += h.l[v];
  if (total === 0) return { low: [0, 0, 0], high: [255, 255, 255] };
  if (!perChannel) {
    const lo = percentile(h.l, total, clip, false);
    const hi = Math.max(lo + 1, percentile(h.l, total, clip, true));
    return { low: [lo, lo, lo], high: [hi, hi, hi] };
  }
  const chans = [h.r, h.g, h.b].map((c) => {
    const lo = percentile(c, total, clip, false);
    const hi = Math.max(lo + 1, percentile(c, total, clip, true));
    return [lo, hi] as const;
  });
  return {
    low: [chans[0][0], chans[1][0], chans[2][0]],
    high: [chans[0][1], chans[1][1], chans[2][1]],
  };
}

export function invert(src: Pixels): Uint8ClampedArray {
  const s = src.data;
  const out = new Uint8ClampedArray(s.length);
  for (let i = 0; i < s.length; i += 4) {
    out[i] = 255 - s[i];
    out[i + 1] = 255 - s[i + 1];
    out[i + 2] = 255 - s[i + 2];
    out[i + 3] = s[i + 3];
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Blur, sharpen, pixelate                                             */
/* ------------------------------------------------------------------ */

/** Box sizes for an n-pass box blur approximating a Gaussian of std-dev sigma (Kovesi). */
export function boxesForGauss(sigma: number, n = 3): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const sizes: number[] = [];
  for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
  return sizes;
}

/** One horizontal + vertical running-sum box blur pass on a float channel buffer (in place via tmp). */
function boxBlurChannel(ch: Float32Array, tmp: Float32Array, w: number, h: number, r: number) {
  if (r <= 0) return;
  const iarr = 1 / (r + r + 1);
  // horizontal: ch -> tmp
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const fv = ch[row];
    let val = (r + 1) * fv;
    for (let j = 0; j < r; j++) val += ch[row + Math.min(j, w - 1)];
    for (let x = 0; x < w; x++) {
      val += ch[row + Math.min(x + r, w - 1)] - (x - r - 1 >= 0 ? ch[row + x - r - 1] : fv);
      tmp[row + x] = val * iarr;
    }
  }
  // vertical: tmp -> ch
  for (let x = 0; x < w; x++) {
    const fv = tmp[x];
    let val = (r + 1) * fv;
    for (let j = 0; j < r; j++) val += tmp[Math.min(j, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      val += tmp[Math.min(y + r, h - 1) * w + x] - (y - r - 1 >= 0 ? tmp[(y - r - 1) * w + x] : fv);
      ch[y * w + x] = val * iarr;
    }
  }
}

/**
 * Gaussian blur (three box passes, edge pixels extended). Works in premultiplied alpha so
 * transparent pixels don't bleed dark fringes into opaque ones.
 */
export function gaussianBlur(src: Pixels, sigma: number): Uint8ClampedArray {
  const { width: w, height: h, data: s } = src;
  if (sigma <= 0 || w === 0 || h === 0) return new Uint8ClampedArray(s);
  const n = w * h;
  const r = new Float32Array(n),
    g = new Float32Array(n),
    b = new Float32Array(n),
    a = new Float32Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const al = s[i + 3] / 255;
    r[p] = s[i] * al;
    g[p] = s[i + 1] * al;
    b[p] = s[i + 2] * al;
    a[p] = s[i + 3];
  }
  const tmp = new Float32Array(n);
  for (const size of boxesForGauss(sigma, 3)) {
    const rad = (size - 1) / 2;
    boxBlurChannel(r, tmp, w, h, rad);
    boxBlurChannel(g, tmp, w, h, rad);
    boxBlurChannel(b, tmp, w, h, rad);
    boxBlurChannel(a, tmp, w, h, rad);
  }
  const out = new Uint8ClampedArray(s.length);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const al = a[p] / 255;
    if (al > 1e-6) {
      out[i] = r[p] / al;
      out[i + 1] = g[p] / al;
      out[i + 2] = b[p] / al;
    }
    out[i + 3] = a[p];
  }
  return out;
}

/** Plain box blur with the given radius (single pass), mostly useful for tests and soft masks. */
export function boxBlur(src: Pixels, radius: number): Uint8ClampedArray {
  const { width: w, height: h, data: s } = src;
  const n = w * h;
  const out = new Uint8ClampedArray(s.length);
  const tmp = new Float32Array(n);
  const ch = new Float32Array(n);
  for (let c = 0; c < 4; c++) {
    for (let p = 0; p < n; p++) ch[p] = s[p * 4 + c];
    boxBlurChannel(ch, tmp, w, h, Math.round(radius));
    for (let p = 0; p < n; p++) out[p * 4 + c] = ch[p];
  }
  return out;
}

/**
 * Unsharp mask: out = src + amount × (src − gaussian(src, radius)) where |difference| ≥ threshold.
 * amount is a fraction (1 = 100%), threshold is in 0–255 levels.
 */
export function unsharpMask(src: Pixels, amount: number, radius: number, threshold = 0): Uint8ClampedArray {
  const blurred = gaussianBlur(src, radius);
  const s = src.data;
  const out = new Uint8ClampedArray(s.length);
  for (let i = 0; i < s.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = s[i + c] - blurred[i + c];
      out[i + c] = Math.abs(diff) >= threshold ? s[i + c] + amount * diff : s[i + c];
    }
    out[i + 3] = s[i + 3];
  }
  return out;
}

/** Mosaic: replaces each block×block cell with its alpha-weighted average colour. */
export function pixelate(src: Pixels, block: number): Uint8ClampedArray {
  const { width: w, height: h, data: s } = src;
  const out = new Uint8ClampedArray(s.length);
  const bs = Math.max(1, Math.round(block));
  for (let by = 0; by < h; by += bs) {
    for (let bx = 0; bx < w; bx += bs) {
      const ex = Math.min(bx + bs, w),
        ey = Math.min(by + bs, h);
      let sr = 0,
        sg = 0,
        sb = 0,
        sa = 0,
        cnt = 0;
      for (let y = by; y < ey; y++)
        for (let x = bx; x < ex; x++) {
          const i = (y * w + x) * 4;
          const a = s[i + 3];
          sr += s[i] * a;
          sg += s[i + 1] * a;
          sb += s[i + 2] * a;
          sa += a;
          cnt++;
        }
      const r = sa ? sr / sa : 0,
        g = sa ? sg / sa : 0,
        b = sa ? sb / sa : 0,
        a = sa / cnt;
      for (let y = by; y < ey; y++)
        for (let x = bx; x < ex; x++) {
          const i = (y * w + x) * 4;
          out[i] = r;
          out[i + 1] = g;
          out[i + 2] = b;
          out[i + 3] = a;
        }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Regions                                                             */
/* ------------------------------------------------------------------ */

export function clampRect(r: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(width, Math.round(r.x)));
  const y = Math.max(0, Math.min(height, Math.round(r.y)));
  const x2 = Math.max(x, Math.min(width, Math.round(r.x + r.width)));
  const y2 = Math.max(y, Math.min(height, Math.round(r.y + r.height)));
  return { x, y, width: x2 - x, height: y2 - y };
}

/** Copies a rectangle out of an image. */
export function cropPixels(src: Pixels, rect: Rect): Pixels {
  const r = clampRect(rect, src.width, src.height);
  const out = new Uint8ClampedArray(r.width * r.height * 4);
  for (let y = 0; y < r.height; y++) {
    const from = ((r.y + y) * src.width + r.x) * 4;
    out.set(src.data.subarray(from, from + r.width * 4), y * r.width * 4);
  }
  return { data: out, width: r.width, height: r.height };
}

/**
 * Applies `fn` only inside `rect`. The region is processed with `pad` pixels of surrounding
 * context (so blurs near the edge of the region use real neighbours) and pasted back.
 */
export function applyInRegion(
  src: Pixels,
  rect: Rect,
  fn: (p: Pixels) => Uint8ClampedArray,
  pad = 0,
): Uint8ClampedArray {
  const r = clampRect(rect, src.width, src.height);
  const out = new Uint8ClampedArray(src.data);
  if (!r.width || !r.height) return out;
  const padded = clampRect({ x: r.x - pad, y: r.y - pad, width: r.width + 2 * pad, height: r.height + 2 * pad }, src.width, src.height);
  const sub = cropPixels(src, padded);
  const done = fn(sub);
  const ox = r.x - padded.x,
    oy = r.y - padded.y;
  for (let y = 0; y < r.height; y++) {
    const from = ((oy + y) * padded.width + ox) * 4;
    out.set(done.subarray(from, from + r.width * 4), ((r.y + y) * src.width + r.x) * 4);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Geometry (lossless index math)                                      */
/* ------------------------------------------------------------------ */

export function flipHorizontal(src: Pixels): Uint8ClampedArray {
  const { width: w, height: h, data: s } = src;
  const out = new Uint8ClampedArray(s.length);
  const u32in = new Uint32Array(s.buffer, s.byteOffset, w * h);
  const u32 = new Uint32Array(out.buffer);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) u32[row + x] = u32in[row + w - 1 - x];
  }
  return out;
}

export function flipVertical(src: Pixels): Uint8ClampedArray {
  const { width: w, height: h, data: s } = src;
  const out = new Uint8ClampedArray(s.length);
  const rowBytes = w * 4;
  for (let y = 0; y < h; y++) out.set(s.subarray((h - 1 - y) * rowBytes, (h - y) * rowBytes), y * rowBytes);
  return out;
}

/** Rotates by a multiple of 90° clockwise. Returns new dimensions. */
export function rotate90(src: Pixels, quarterTurns: number): Pixels {
  const q = ((quarterTurns % 4) + 4) % 4;
  const { width: w, height: h, data: s } = src;
  if (q === 0) return { data: new Uint8ClampedArray(s), width: w, height: h };
  const u32in = new Uint32Array(s.buffer, s.byteOffset, w * h);
  const nw = q === 2 ? w : h,
    nh = q === 2 ? h : w;
  const out = new Uint8ClampedArray(w * h * 4);
  const u32 = new Uint32Array(out.buffer);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let nx: number, ny: number;
      if (q === 1) {
        nx = h - 1 - y;
        ny = x;
      } else if (q === 2) {
        nx = w - 1 - x;
        ny = h - 1 - y;
      } else {
        nx = y;
        ny = w - 1 - x;
      }
      u32[ny * nw + nx] = u32in[y * w + x];
    }
  return { data: out, width: nw, height: nh };
}
