/**
 * Speech-recognition worker (Whisper via Transformers.js). The model is downloaded from the
 * Hugging Face Hub on first use and cached by the browser. Audio arrives as 16 kHz mono
 * chunks (≤30 s, cut at quiet points by the main thread); each chunk is transcribed in turn so
 * progress is real, and segment timestamps are offset to the chunk's position.
 */

interface WorkerScope {
  onmessage: ((e: MessageEvent<Request>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

interface Request {
  id: number;
  model: string;
  language: string | null;
  task: "transcribe" | "translate";
  chunks: { offset: number; buffer: ArrayBuffer }[];
}

interface Segment {
  start: number;
  end: number;
  text: string;
}

type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string; chunks?: { timestamp: [number, number | null]; text: string }[] }>;

const ctx = self as unknown as WorkerScope;
const pipelines = new Map<string, Promise<{ run: Asr; device: string }>>();

async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!gpu && !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

function load(model: string, id: number) {
  const cached = pipelines.get(model);
  if (cached) return cached;
  const p = (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.allowLocalModels = false;
    const progress_callback = (e: { status: string; loaded?: number; total?: number }) => {
      if (e.status === "progress_total") ctx.postMessage({ id, type: "download", loaded: e.loaded ?? 0, total: e.total ?? 0 });
    };
    if (await hasWebGpu()) {
      try {
        const run = (await pipeline("automatic-speech-recognition", model, { device: "webgpu", dtype: { encoder_model: "fp32", decoder_model_merged: "q4" }, progress_callback } as never)) as unknown as Asr;
        return { run, device: "WebGPU" };
      } catch {
        // fall back to WASM below
      }
    }
    const run = (await pipeline("automatic-speech-recognition", model, { device: "wasm", dtype: "q8", progress_callback } as never)) as unknown as Asr;
    return { run, device: "WebAssembly (CPU)" };
  })();
  pipelines.set(model, p);
  p.catch(() => pipelines.delete(model));
  return p;
}

ctx.onmessage = async (e: MessageEvent<Request>) => {
  const { id, model, language, task, chunks } = e.data;
  try {
    const asr = await load(model, id);
    const segments: Segment[] = [];
    for (let i = 0; i < chunks.length; i++) {
      ctx.postMessage({ id, type: "progress", done: i, total: chunks.length, device: asr.device });
      const audio = new Float32Array(chunks[i].buffer);
      const dur = audio.length / 16000;
      const r = await asr.run(audio, { language: language ?? undefined, task, return_timestamps: true });
      const off = chunks[i].offset;
      if (r.chunks?.length) {
        for (const c of r.chunks) {
          const text = c.text.trim();
          if (!text) continue;
          const s = Math.max(0, c.timestamp[0] ?? 0);
          const en = c.timestamp[1] ?? dur;
          segments.push({ start: off + s, end: off + Math.min(dur, Math.max(s, en)), text });
        }
      } else if (r.text.trim()) segments.push({ start: off, end: off + dur, text: r.text.trim() });
      ctx.postMessage({ id, type: "partial", segments });
    }
    ctx.postMessage({ id, type: "done", segments, device: asr.device });
  } catch (err) {
    ctx.postMessage({ id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
