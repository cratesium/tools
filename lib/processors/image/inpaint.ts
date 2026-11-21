/**
 * Image inpainting: fills masked pixels from their surroundings. Two real algorithms:
 *
 * - "smooth": onion-peel initialisation (each ring of the hole takes the weighted average of its
 *   known neighbours) followed by Gauss–Seidel iterations of the Laplace equation (harmonic fill).
 *   Best for smooth areas: skies, walls, skin, gradients, thin text over plain backgrounds.
 * - "patch": exemplar-based filling in the spirit of Criminisi et al. Boundary pixels are filled in
 *   order of confidence by copying the best-matching patch (sum of squared differences over the
 *   already-known pixels) from a search window around the hole. Reproduces texture such as grass,
 *   fabric or brick, which diffusion would blur.
 *
 * Masks are Uint8Array with 1 (or any non-zero) for pixels to fill.
 */

import type { Pixels } from "./pixels";

export type InpaintMethod = "smooth" | "patch";

export interface InpaintOptions {
  method: InpaintMethod;
  /** Patch radius for "patch" (patch is (2r+1)²). */
  patchRadius?: number;
  /** Search window radius around each target pixel for "patch". */
  searchRadius?: number;
  /** Diffusion iterations for "smooth" (and seam smoothing for "patch"). */
  iterations?: number;
  onProgress?: (fraction: number) => void;
  /** Called periodically; return true to abort. */
  shouldAbort?: () => boolean;
}

const N8 = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

export function inpaint(src: Pixels, mask: Uint8Array, o: InpaintOptions): Uint8ClampedArray {
  const { width: W, height: H } = src;
  let total = 0,
    minX = W,
    minY = H,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (mask[y * W + x]) {
        total++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  const out = new Uint8ClampedArray(src.data);
  if (!total) return out;
  if (total === W * H) throw new Error("The whole image is masked; leave some pixels to sample from.");
  // Work on the hole's bounding box plus enough context for sampling.
  const pr = Math.max(2, Math.min(12, o.patchRadius ?? 4));
  const sr = Math.max(pr * 3, o.searchRadius ?? 48);
  const pad = o.method === "patch" ? sr + pr + 2 : 2;
  const x0 = Math.max(0, minX - pad),
    y0 = Math.max(0, minY - pad);
  const x1 = Math.min(W, maxX + pad + 1),
    y1 = Math.min(H, maxY + pad + 1);
  const w = x1 - x0,
    h = y1 - y0;
  const px = new Uint8ClampedArray(w * h * 4);
  const hole = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    px.set(src.data.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x1) * 4), y * w * 4);
    for (let x = 0; x < w; x++) hole[y * w + x] = mask[(y0 + y) * W + x0 + x] ? 1 : 0;
  }
  if (o.method === "patch") patchFill(px, hole, w, h, total, { ...o, patchRadius: pr, searchRadius: sr });
  else {
    onionPeel(px, hole.slice(), w, h, total, (f) => o.onProgress?.(f * 0.4), o.shouldAbort);
    diffuse(px, hole, w, h, o.iterations ?? 200, (f) => o.onProgress?.(0.4 + f * 0.6), o.shouldAbort);
  }
  for (let y = 0; y < h; y++) out.set(px.subarray(y * w * 4, (y + 1) * w * 4), ((y0 + y) * W + x0) * 4);
  o.onProgress?.(1);
  return out;
}

/** Fills the hole ring by ring with the distance-weighted average of known 8-neighbours. Mutates both arrays. */
export function onionPeel(px: Uint8ClampedArray, hole: Uint8Array, w: number, h: number, total: number, progress?: (f: number) => void, abort?: () => boolean) {
  let remaining = total;
  let ring: number[] = [];
  const collect = () => {
    ring = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (!hole[p]) continue;
        for (const [dx, dy] of N8) {
          const nx = x + dx,
            ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && !hole[ny * w + nx]) {
            ring.push(p);
            break;
          }
        }
      }
  };
  collect();
  while (remaining > 0 && ring.length) {
    if (abort?.()) throw new DOMException("Aborted", "AbortError");
    const values: number[] = [];
    for (const p of ring) {
      const x = p % w,
        y = (p - x) / w;
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        ws = 0;
      for (const [dx, dy] of N8) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (hole[q]) continue;
        const wt = dx && dy ? 0.7071 : 1;
        r += px[q * 4] * wt;
        g += px[q * 4 + 1] * wt;
        b += px[q * 4 + 2] * wt;
        a += px[q * 4 + 3] * wt;
        ws += wt;
      }
      values.push(r / ws, g / ws, b / ws, a / ws);
    }
    ring.forEach((p, k) => {
      px[p * 4] = values[k * 4];
      px[p * 4 + 1] = values[k * 4 + 1];
      px[p * 4 + 2] = values[k * 4 + 2];
      px[p * 4 + 3] = values[k * 4 + 3];
      hole[p] = 0;
    });
    remaining -= ring.length;
    progress?.(1 - remaining / total);
    collect();
  }
}

/** Gauss–Seidel relaxation of the Laplace equation over hole pixels only (boundary = known pixels). */
export function diffuse(px: Uint8ClampedArray, hole: Uint8Array, w: number, h: number, iterations: number, progress?: (f: number) => void, abort?: () => boolean) {
  const idx: number[] = [];
  for (let p = 0; p < hole.length; p++) if (hole[p]) idx.push(p);
  const f = new Float32Array(px.length);
  for (let i = 0; i < px.length; i++) f[i] = px[i];
  for (let it = 0; it < iterations; it++) {
    if (it % 10 === 0) {
      if (abort?.()) throw new DOMException("Aborted", "AbortError");
      progress?.(it / iterations);
    }
    for (const p of idx) {
      const x = p % w,
        y = (p - x) / w;
      const l = x > 0 ? p - 1 : p,
        r = x < w - 1 ? p + 1 : p,
        u = y > 0 ? p - w : p,
        d = y < h - 1 ? p + w : p;
      for (let c = 0; c < 4; c++) f[p * 4 + c] = (f[l * 4 + c] + f[r * 4 + c] + f[u * 4 + c] + f[d * 4 + c]) / 4;
    }
  }
  for (const p of idx) for (let c = 0; c < 4; c++) px[p * 4 + c] = f[p * 4 + c];
}

function patchFill(px: Uint8ClampedArray, hole: Uint8Array, w: number, h: number, total: number, o: InpaintOptions) {
  const pr = o.patchRadius ?? 4;
  const sr = o.searchRadius ?? 48;
  const original = hole.slice(); // source patches may only contain originally known pixels
  // Integral image of the original hole mask → O(1) test "patch at (x,y) is fully known".
  const iw = w + 1;
  const integral = new Uint32Array(iw * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += original[y * w + x];
      integral[(y + 1) * iw + x + 1] = integral[y * iw + x + 1] + row;
    }
  }
  const holeCount = (x0: number, y0: number, x1: number, y1: number) => integral[y1 * iw + x1] - integral[y0 * iw + x1] - integral[y1 * iw + x0] + integral[y0 * iw + x0];
  const sourceOk = (cx: number, cy: number) => cx - pr >= 0 && cy - pr >= 0 && cx + pr < w && cy + pr < h && holeCount(cx - pr, cy - pr, cx + pr + 1, cy + pr + 1) === 0;

  const conf = new Float32Array(w * h);
  for (let p = 0; p < conf.length; p++) conf[p] = hole[p] ? 0 : 1;
  let remaining = total;
  const step = sr > 40 ? 2 : 1;
  let guard = 0;

  while (remaining > 0) {
    if (o.shouldAbort?.()) throw new DOMException("Aborted", "AbortError");
    if (++guard > total + 10) break;
    // Boundary pixels with their confidence term.
    const front: { p: number; c: number }[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (!hole[p]) continue;
        let edge = false;
        for (const [dx, dy] of N8) {
          const nx = x + dx,
            ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && !hole[ny * w + nx]) {
            edge = true;
            break;
          }
        }
        if (!edge) continue;
        let c = 0,
          n = 0;
        for (let yy = Math.max(0, y - pr); yy <= Math.min(h - 1, y + pr); yy++)
          for (let xx = Math.max(0, x - pr); xx <= Math.min(w - 1, x + pr); xx++) {
            c += conf[yy * w + xx];
            n++;
          }
        front.push({ p, c: c / n });
      }
    if (!front.length) break;
    front.sort((a, b) => b.c - a.c);
    // Fill a batch of the most confident front pixels this round.
    const batch = Math.max(1, Math.ceil(front.length / 4));
    for (let k = 0; k < batch && remaining > 0; k++) {
      const { p, c: pc } = front[k];
      if (!hole[p]) continue;
      const tx = p % w,
        ty = (p - tx) / w;
      // Known pixels in the target patch: identical overlap for every candidate source.
      let cntT = 0;
      for (let dy = -pr; dy <= pr; dy++)
        for (let dx = -pr; dx <= pr; dx++) {
          const x = tx + dx,
            y = ty + dy;
          if (x >= 0 && y >= 0 && x < w && y < h && !hole[y * w + x]) cntT++;
        }
      let best = -1,
        bestErr = Infinity;
      const x0 = Math.max(pr, tx - sr),
        x1 = Math.min(w - 1 - pr, tx + sr);
      const y0 = Math.max(pr, ty - sr),
        y1 = Math.min(h - 1 - pr, ty + sr);
      if (cntT)
        for (let cy = y0; cy <= y1; cy += step)
          for (let cx = x0; cx <= x1; cx += step) {
            if (!sourceOk(cx, cy)) continue;
            // Tiny distance penalty prefers nearby sources among equally good matches.
            const penalty = ((cx - tx) ** 2 + (cy - ty) ** 2) * 0.01;
            const limit = (bestErr - penalty) * cntT;
            if (limit <= 0) continue;
            let err = 0;
            for (let dy = -pr; dy <= pr && err < limit; dy++) {
              const ty2 = ty + dy;
              if (ty2 < 0 || ty2 >= h) continue;
              for (let dx = -pr; dx <= pr; dx++) {
                const tx2 = tx + dx;
                if (tx2 < 0 || tx2 >= w) continue;
                const tp = ty2 * w + tx2;
                if (hole[tp]) continue;
                const sp = ((cy + dy) * w + cx + dx) * 4,
                  tpi = tp * 4;
                const dr = px[sp] - px[tpi],
                  dg = px[sp + 1] - px[tpi + 1],
                  db = px[sp + 2] - px[tpi + 2];
                err += dr * dr + dg * dg + db * db;
              }
            }
            const e = err / cntT + penalty;
            if (e < bestErr) {
              bestErr = e;
              best = cy * w + cx;
            }
          }
      if (best < 0) {
        // No fully-known source patch in range: fall back to neighbour average for this pixel.
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (const [dx, dy] of N8) {
          const nx = tx + dx, ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || hole[ny * w + nx]) continue;
          const q = (ny * w + nx) * 4;
          r += px[q]; g += px[q + 1]; b += px[q + 2]; a += px[q + 3]; n++;
        }
        if (n) {
          px[p * 4] = r / n; px[p * 4 + 1] = g / n; px[p * 4 + 2] = b / n; px[p * 4 + 3] = a / n;
        }
        hole[p] = 0;
        conf[p] = pc;
        remaining--;
        continue;
      }
      const bx = best % w,
        by = (best - bx) / w;
      for (let dy = -pr; dy <= pr; dy++)
        for (let dx = -pr; dx <= pr; dx++) {
          const x = tx + dx,
            y = ty + dy;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const q = y * w + x;
          if (!hole[q]) continue;
          const s = ((by + dy) * w + bx + dx) * 4;
          px[q * 4] = px[s];
          px[q * 4 + 1] = px[s + 1];
          px[q * 4 + 2] = px[s + 2];
          px[q * 4 + 3] = px[s + 3];
          hole[q] = 0;
          conf[q] = pc;
          remaining--;
        }
    }
    o.onProgress?.(0.95 * (1 - remaining / total));
  }
}

/** Grows a binary mask by `r` pixels (square dilation), useful to cover watermark anti-aliasing. */
export function dilateMask(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && !v; k++) v = mask[y * w + k];
      tmp[y * w + x] = v ? 1 : 0;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && !v; k++) v = tmp[k * w + x];
      out[y * w + x] = v ? 1 : 0;
    }
  return out;
}
