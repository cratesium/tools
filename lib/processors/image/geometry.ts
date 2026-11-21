/** Pure size, crop and rotation maths used by the resize, crop and rotate tools. */

import type { Rect } from "./pixels";

export interface ResizeOptions {
  mode: "px" | "percent";
  width?: number;
  height?: number;
  percent?: number;
  lockAspect: boolean;
  /** Never enlarge beyond the source size. */
  noUpscale?: boolean;
}

/**
 * Computes target dimensions. In px mode with the aspect lock on, a missing side is derived from
 * the other; when both are given the image fits inside the box. Results are at least 1×1.
 */
export function computeResize(srcW: number, srcH: number, o: ResizeOptions): { width: number; height: number } {
  let w: number, h: number;
  if (o.mode === "percent") {
    const p = (o.percent ?? 100) / 100;
    w = srcW * p;
    h = srcH * p;
  } else {
    const tw = o.width && o.width > 0 ? o.width : undefined;
    const th = o.height && o.height > 0 ? o.height : undefined;
    if (!tw && !th) {
      w = srcW;
      h = srcH;
    } else if (o.lockAspect) {
      const ratio = srcW / srcH;
      if (tw && th) {
        const scale = Math.min(tw / srcW, th / srcH);
        w = srcW * scale;
        h = srcH * scale;
      } else if (tw) {
        w = tw;
        h = tw / ratio;
      } else {
        h = th!;
        w = th! * ratio;
      }
    } else {
      w = tw ?? srcW;
      h = th ?? srcH;
    }
  }
  if (o.noUpscale && (w > srcW || h > srcH)) {
    const s = Math.min(srcW / w, srcH / h);
    w *= s;
    h *= s;
  }
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}

/** Fits (w, h) inside a maximum long edge, keeping aspect. Returns the input when already smaller. */
export function fitWithin(w: number, h: number, maxEdge: number): { width: number; height: number; scale: number } {
  const long = Math.max(w, h);
  if (!maxEdge || long <= maxEdge) return { width: w, height: h, scale: 1 };
  const scale = maxEdge / long;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
}

/** Bounding box of a w×h rectangle rotated by `deg` degrees. */
export function rotatedBounds(w: number, h: number, deg: number): { width: number; height: number } {
  const a = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(a)),
    s = Math.abs(Math.sin(a));
  // Round away tiny floating-point noise so 90° gives exactly h×w.
  const bw = w * c + h * s,
    bh = w * s + h * c;
  return { width: Math.round(bw - 1e-9), height: Math.round(bh - 1e-9) };
}

export const aspectPresets: { label: string; value: number | null }[] = [
  { label: "Free", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
  { label: "4:5", value: 4 / 5 },
  { label: "2:3", value: 2 / 3 },
];

/** Largest centred rectangle of the given aspect ratio that fits inside w×h. */
export function centeredAspectRect(w: number, h: number, aspect: number, fill = 1): Rect {
  let cw = w * fill,
    ch = cw / aspect;
  if (ch > h * fill) {
    ch = h * fill;
    cw = ch * aspect;
  }
  return { x: Math.round((w - cw) / 2), y: Math.round((h - ch) / 2), width: Math.round(cw), height: Math.round(ch) };
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "move";

/**
 * Applies a drag (dx, dy in image pixels) to a crop rectangle from its starting state,
 * enforcing bounds, a minimum size and an optional aspect ratio.
 */
export function dragCrop(start: Rect, handle: Handle, dx: number, dy: number, bounds: { width: number; height: number }, aspect: number | null, min = 8): Rect {
  const W = bounds.width,
    H = bounds.height;
  if (handle === "move") {
    const x = Math.min(Math.max(0, start.x + dx), W - start.width);
    const y = Math.min(Math.max(0, start.y + dy), H - start.height);
    return { x: Math.round(x), y: Math.round(y), width: start.width, height: start.height };
  }
  let x1 = start.x,
    y1 = start.y,
    x2 = start.x + start.width,
    y2 = start.y + start.height;
  if (handle.includes("w")) x1 = Math.min(Math.max(0, x1 + dx), x2 - min);
  if (handle.includes("e")) x2 = Math.max(Math.min(W, x2 + dx), x1 + min);
  if (handle.includes("n")) y1 = Math.min(Math.max(0, y1 + dy), y2 - min);
  if (handle.includes("s")) y2 = Math.max(Math.min(H, y2 + dy), y1 + min);
  if (aspect) {
    let w = x2 - x1,
      h = y2 - y1;
    const horizontalOnly = handle === "e" || handle === "w";
    const verticalOnly = handle === "n" || handle === "s";
    if (horizontalOnly) h = w / aspect;
    else if (verticalOnly) w = h * aspect;
    else if (w / h > aspect) h = w / aspect;
    else w = h * aspect;
    // Anchor the opposite edge/corner and clamp to bounds while keeping the ratio.
    const anchorX = handle.includes("w") ? x2 : handle.includes("e") ? x1 : (x1 + x2) / 2;
    const anchorY = handle.includes("n") ? y2 : handle.includes("s") ? y1 : (y1 + y2) / 2;
    const maxW = handle.includes("w") ? anchorX : handle.includes("e") ? W - anchorX : 2 * Math.min(anchorX, W - anchorX);
    const maxH = handle.includes("n") ? anchorY : handle.includes("s") ? H - anchorY : 2 * Math.min(anchorY, H - anchorY);
    const scale = Math.min(1, maxW / w, maxH / h);
    w *= scale;
    h *= scale;
    x1 = handle.includes("w") ? anchorX - w : handle.includes("e") ? anchorX : anchorX - w / 2;
    y1 = handle.includes("n") ? anchorY - h : handle.includes("s") ? anchorY : anchorY - h / 2;
    x2 = x1 + w;
    y2 = y1 + h;
  }
  return { x: Math.round(x1), y: Math.round(y1), width: Math.round(x2 - x1), height: Math.round(y2 - y1) };
}

/** Normalises a user-typed crop rectangle into the image bounds, keeping a minimum size of 1px. */
export function clampCrop(r: Rect, W: number, H: number): Rect {
  const width = Math.max(1, Math.min(W, Math.round(r.width) || 1));
  const height = Math.max(1, Math.min(H, Math.round(r.height) || 1));
  const x = Math.max(0, Math.min(W - width, Math.round(r.x) || 0));
  const y = Math.max(0, Math.min(H - height, Math.round(r.y) || 0));
  return { x, y, width, height };
}
