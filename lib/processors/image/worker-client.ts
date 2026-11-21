/**
 * Runs an ImageJob in a dedicated Web Worker (one per job) with real progress and cancellation.
 * Falls back to the main thread when workers can't be created (e.g. very old browsers).
 */

import type { ImageJob, JobResult } from "./jobs";
import type { Pixels } from "./pixels";

export async function runImageJob(job: ImageJob, src: Pixels, opts: { signal?: AbortSignal; onProgress?: (f: number) => void } = {}): Promise<JobResult> {
  if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL("../../../workers/image/filter.worker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  if (!worker) {
    const { executeJob } = await import("./jobs");
    return executeJob(job, src, opts.onProgress, () => !!opts.signal?.aborted);
  }
  const w = worker;
  return new Promise<JobResult>((resolve, reject) => {
    const cleanup = () => {
      w.terminate();
      opts.signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    opts.signal?.addEventListener("abort", onAbort);
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: string; value?: number; width?: number; height?: number; buffer?: ArrayBuffer; text?: string; message?: string };
      if (m.type === "progress") opts.onProgress?.(m.value ?? 0);
      else if (m.type === "done") {
        cleanup();
        if (m.buffer) resolve({ pixels: { data: new Uint8ClampedArray(m.buffer), width: m.width!, height: m.height! } });
        else resolve({ text: m.text ?? "" });
      } else if (m.type === "error") {
        cleanup();
        reject(new Error(m.message || "Image processing failed."));
      }
    };
    w.onerror = (e) => {
      cleanup();
      reject(new Error(e.message || "The image worker crashed (the image may be too large for available memory)."));
    };
    // Copy the pixels so the caller's buffer stays usable; transfer the copy.
    const copy = src.data.slice();
    const transfer: Transferable[] = [copy.buffer];
    w.postMessage({ job, width: src.width, height: src.height, buffer: copy.buffer }, transfer);
  });
}
