/**
 * Pixel jobs that may run inside workers/image/filter.worker.ts or, as a fallback, on the main
 * thread. Everything here is pure (no DOM), so the same code path is used in both places.
 */

import {
  adjust,
  applyInRegion,
  flipHorizontal,
  flipVertical,
  gaussianBlur,
  grayscale,
  pixelate,
  rotate90,
  unsharpMask,
  type Adjustments,
  type GrayscaleMethod,
  type Pixels,
  type Rect,
} from "./pixels";
import { inpaint, type InpaintMethod } from "./inpaint";
import { blurBackground } from "./composite";

export type ImageJob =
  | { op: "blur"; sigma: number; region?: Rect | null }
  | { op: "sharpen"; amount: number; radius: number; threshold: number }
  | { op: "pixelate"; block: number; region?: Rect | null }
  | { op: "adjust"; adjustments: Adjustments }
  | { op: "grayscale"; method: GrayscaleMethod; amount: number; sepia: number }
  | { op: "flip"; horizontal: boolean; vertical: boolean }
  | { op: "rotate90"; quarterTurns: number }
  | { op: "inpaint"; mask: Uint8Array; method: InpaintMethod; patchRadius?: number; searchRadius?: number; iterations?: number }
  | { op: "blur-background"; mask: Uint8ClampedArray; sigma: number }
  | { op: "trace"; options: Record<string, number | boolean | string> };

export interface JobResult {
  pixels?: Pixels;
  text?: string;
}

export async function executeJob(job: ImageJob, src: Pixels, onProgress?: (f: number) => void, shouldAbort?: () => boolean): Promise<JobResult> {
  const same = (data: Uint8ClampedArray): JobResult => ({ pixels: { data, width: src.width, height: src.height } });
  switch (job.op) {
    case "blur": {
      const fn = (p: Pixels) => gaussianBlur(p, job.sigma);
      return same(job.region ? applyInRegion(src, job.region, fn, Math.ceil(job.sigma * 3)) : fn(src));
    }
    case "sharpen":
      return same(unsharpMask(src, job.amount, job.radius, job.threshold));
    case "pixelate": {
      const fn = (p: Pixels) => pixelate(p, job.block);
      return same(job.region ? applyInRegion(src, job.region, fn, 0) : fn(src));
    }
    case "adjust":
      return same(adjust(src, job.adjustments));
    case "grayscale":
      return same(grayscale(src, job.method, job.amount, job.sepia));
    case "flip": {
      let d = src.data;
      if (job.horizontal) d = flipHorizontal({ ...src, data: d });
      if (job.vertical) d = flipVertical({ ...src, data: d });
      return same(d === src.data ? new Uint8ClampedArray(d) : d);
    }
    case "rotate90":
      return { pixels: rotate90(src, job.quarterTurns) };
    case "inpaint":
      return same(
        inpaint(src, job.mask, {
          method: job.method,
          patchRadius: job.patchRadius,
          searchRadius: job.searchRadius,
          iterations: job.iterations,
          onProgress,
          shouldAbort,
        }),
      );
    case "blur-background":
      return same(blurBackground(src, job.mask, job.sigma));
    case "trace": {
      const mod = await import("imagetracerjs");
      const tracer = (mod as { default?: ImageTracerApi }).default ?? (mod as unknown as ImageTracerApi);
      const svg = tracer.imagedataToSVG({ width: src.width, height: src.height, data: src.data }, job.options);
      return { text: svg };
    }
  }
}

export interface ImageTracerApi {
  imagedataToSVG(img: { width: number; height: number; data: Uint8ClampedArray }, options?: Record<string, unknown> | string): string;
}
