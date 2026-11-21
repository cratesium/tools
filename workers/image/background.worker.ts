/**
 * Background-removal worker. Loads a Transformers.js "background-removal" pipeline once per
 * worker (the worker lives as long as the tool component) and returns the predicted alpha mask
 * at the input's full resolution. Model files are downloaded from the Hugging Face Hub on first
 * use and cached by the browser (Cache API) for later visits.
 */

import type { BackgroundModelId } from "../../lib/processors/image/background-models";
import { backgroundModels } from "../../lib/processors/image/background-models";

interface WorkerScope {
  onmessage: ((e: MessageEvent<Request>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

interface Request {
  id: number;
  model: BackgroundModelId;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

const ctx = self as unknown as WorkerScope;

type Segmenter = (img: unknown) => Promise<{ data: Uint8ClampedArray | Uint8Array; width: number; height: number; channels: number }>;
const pipelines = new Map<string, Promise<{ run: Segmenter; device: string }>>();

async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

function load(modelId: BackgroundModelId, id: number) {
  const cached = pipelines.get(modelId);
  if (cached) return cached;
  const p = (async () => {
    const info = backgroundModels[modelId];
    const { pipeline, env } = await import("@huggingface/transformers");
    env.allowLocalModels = false;
    const gpu = await hasWebGpu();
    if (info.requiresWebGpu && !gpu) throw new Error(`${info.label} needs WebGPU, which this browser doesn't provide. Use the Portrait model instead.`);
    const progress_callback = (e: { status: string; progress?: number; loaded?: number; total?: number; file?: string }) => {
      if (e.status === "progress_total") ctx.postMessage({ id, type: "download", loaded: e.loaded ?? 0, total: e.total ?? 0 });
    };
    const tryDevice = async (device: "webgpu" | "wasm") =>
      (await pipeline("background-removal", info.repo, { device, dtype: info.dtype, progress_callback } as never)) as unknown as Segmenter;
    if (gpu) {
      try {
        return { run: await tryDevice("webgpu"), device: "WebGPU" };
      } catch (err) {
        if (info.requiresWebGpu) throw err;
      }
    }
    return { run: await tryDevice("wasm"), device: "WebAssembly (CPU)" };
  })();
  pipelines.set(modelId, p);
  p.catch(() => pipelines.delete(modelId));
  return p;
}

ctx.onmessage = async (e: MessageEvent<Request>) => {
  const { id, model, width, height, buffer } = e.data;
  try {
    const seg = await load(model, id);
    ctx.postMessage({ id, type: "status", message: `Running ${backgroundModels[model].label} on ${seg.device}…` });
    const { RawImage } = await import("@huggingface/transformers");
    const input = new RawImage(new Uint8ClampedArray(buffer), width, height, 4);
    const out = await seg.run(input);
    // Output is the input with the predicted alpha; extract it as a mask.
    const mask = new Uint8ClampedArray(width * height);
    if (out.width !== width || out.height !== height) throw new Error("Unexpected mask size from the model.");
    const ch = out.channels;
    for (let p = 0; p < mask.length; p++) mask[p] = ch === 4 ? out.data[p * 4 + 3] : out.data[p * ch];
    ctx.postMessage({ id, type: "done", mask: mask.buffer, device: seg.device }, [mask.buffer]);
  } catch (err) {
    ctx.postMessage({ id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
