/**
 * Runs pixel-heavy image jobs (blur, sharpen, pixelate, adjustments, inpainting, tracing) off the
 * main thread. One worker is created per job and terminated afterwards, so no state is shared
 * between jobs or visitors. Pixel buffers are transferred, not copied.
 */

import { executeJob, type ImageJob } from "../../lib/processors/image/jobs";

interface Request {
  job: ImageJob;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

interface WorkerScope {
  onmessage: ((e: MessageEvent<Request>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

const ctx = self as unknown as WorkerScope;

ctx.onmessage = async (e: MessageEvent<Request>) => {
  const { job, width, height, buffer } = e.data;
  try {
    let last = 0;
    const res = await executeJob(job, { data: new Uint8ClampedArray(buffer), width, height }, (f) => {
      const now = Date.now();
      if (now - last > 80 || f >= 1) {
        last = now;
        ctx.postMessage({ type: "progress", value: f });
      }
    });
    if (res.pixels) {
      const out = res.pixels.data;
      // Ensure we transfer a standalone buffer.
      const buf = out.byteOffset === 0 && out.byteLength === out.buffer.byteLength ? out.buffer : out.slice().buffer;
      ctx.postMessage({ type: "done", width: res.pixels.width, height: res.pixels.height, buffer: buf }, [buf as ArrayBuffer]);
    } else ctx.postMessage({ type: "done", text: res.text ?? "" });
  } catch (err) {
    ctx.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
