/** Pure alpha-mask refinement and compositing used by the background remover and changer. */

import { gaussianBlur, type Pixels } from "./pixels";

/** Extracts the alpha channel as a single-channel mask (0–255). */
export function alphaMask(src: Pixels): Uint8ClampedArray {
  const m = new Uint8ClampedArray(src.width * src.height);
  for (let p = 0; p < m.length; p++) m[p] = src.data[p * 4 + 3];
  return m;
}

/**
 * Refines a soft mask:
 * - `shift` (−50…50) grows (positive) or shrinks (negative) the foreground by moving the 50% point,
 * - `hardness` (0–100) steepens the edge (100 = binary),
 * - `feather` (px) softens the edge with a Gaussian blur.
 */
export function refineMask(mask: Uint8ClampedArray, width: number, height: number, o: { shift?: number; hardness?: number; feather?: number }): Uint8ClampedArray {
  const shift = (o.shift ?? 0) / 100; // −0.5…0.5
  const hard = Math.min(100, Math.max(0, o.hardness ?? 0)) / 100;
  const out = new Uint8ClampedArray(mask.length);
  const centre = 0.5 - shift;
  const slope = hard >= 1 ? Infinity : 1 / (1 - hard);
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] / 255;
    let r: number;
    if (slope === Infinity) r = v >= centre ? 1 : 0;
    else r = (v - centre) * slope + 0.5;
    out[i] = Math.round(Math.min(1, Math.max(0, r)) * 255);
  }
  if (o.feather && o.feather > 0) {
    const px = { data: new Uint8ClampedArray(mask.length * 4), width, height };
    for (let i = 0; i < out.length; i++) {
      px.data[i * 4] = out[i];
      px.data[i * 4 + 3] = 255;
    }
    const b = gaussianBlur(px, o.feather);
    for (let i = 0; i < out.length; i++) out[i] = b[i * 4];
  }
  return out;
}

/** Returns a copy of `src` with `mask` as its alpha (multiplied with any existing alpha). */
export function applyMask(src: Pixels, mask: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.data);
  for (let p = 0; p < mask.length; p++) out[p * 4 + 3] = (src.data[p * 4 + 3] * mask[p]) / 255;
  return out;
}

/** Composites foreground (with mask as alpha) over a background of the same size. */
export function compositeOver(fg: Pixels, mask: Uint8ClampedArray, bg: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(fg.data.length);
  const f = fg.data;
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    const a = (mask[p] / 255) * (f[i + 3] / 255);
    const ba = bg[i + 3] / 255;
    const oa = a + ba * (1 - a);
    if (oa <= 0) continue;
    for (let c = 0; c < 3; c++) out[i + c] = (f[i + c] * a + bg[i + c] * ba * (1 - a)) / oa;
    out[i + 3] = oa * 255;
  }
  return out;
}

export function solidBackground(width: number, height: number, rgba: [number, number, number, number]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < out.length; i += 4) out.set(rgba, i);
  return out;
}

/**
 * Blurs only the background of `src`: the subject (mask) is excluded from the blur so its colours
 * don't smear into the surroundings, using normalised (alpha-weighted) Gaussian convolution.
 */
export function blurBackground(src: Pixels, mask: Uint8ClampedArray, sigma: number): Uint8ClampedArray {
  const weighted = new Uint8ClampedArray(src.data);
  for (let p = 0; p < mask.length; p++) weighted[p * 4 + 3] = 255 - mask[p];
  const blurred = gaussianBlur({ data: weighted, width: src.width, height: src.height }, sigma);
  for (let p = 0; p < mask.length; p++) blurred[p * 4 + 3] = 255;
  return blurred;
}

export function parseHexColor(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
