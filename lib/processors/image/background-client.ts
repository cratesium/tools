/**
 * Main-thread client for workers/image/background.worker.ts. One instance per tool component;
 * the worker keeps the loaded model in memory until dispose() so repeated runs are fast.
 */

import type { BackgroundModelId } from "./background-models";
import type { Pixels } from "./pixels";

export interface MaskProgress {
  onDownload?: (loaded: number, total: number) => void;
  onStatus?: (message: string) => void;
  signal?: AbortSignal;
}

export class BackgroundSegmenter {
  private worker: Worker | null = null;
  private seq = 0;

  private ensure(): Worker {
    if (!this.worker) this.worker = new Worker(new URL("../../../workers/image/background.worker.ts", import.meta.url), { type: "module" });
    return this.worker;
  }

  /** Returns a full-resolution alpha mask (0–255 per pixel) for the subject. */
  predict(px: Pixels, model: BackgroundModelId, cb: MaskProgress = {}): Promise<{ mask: Uint8ClampedArray; device: string }> {
    const w = this.ensure();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        // Terminating is the only way to stop inference; the model reloads from cache next time.
        this.dispose();
        reject(new DOMException("Aborted", "AbortError"));
      };
      cb.signal?.addEventListener("abort", onAbort, { once: true });
      const done = () => {
        w.removeEventListener("message", onMsg);
        cb.signal?.removeEventListener("abort", onAbort);
      };
      const onMsg = (e: MessageEvent) => {
        const m = e.data as { id: number; type: string; loaded?: number; total?: number; message?: string; mask?: ArrayBuffer; device?: string };
        if (m.id !== id) return;
        if (m.type === "download") cb.onDownload?.(m.loaded ?? 0, m.total ?? 0);
        else if (m.type === "status") cb.onStatus?.(m.message ?? "");
        else if (m.type === "done") {
          done();
          resolve({ mask: new Uint8ClampedArray(m.mask!), device: m.device ?? "" });
        } else if (m.type === "error") {
          done();
          reject(new Error(m.message || "Background removal failed."));
        }
      };
      w.addEventListener("message", onMsg);
      w.onerror = (e) => {
        done();
        this.dispose();
        reject(new Error(e.message || "The background-removal worker crashed (possibly out of memory)."));
      };
      const copy = px.data.slice();
      w.postMessage({ id, model, width: px.width, height: px.height, buffer: copy.buffer }, [copy.buffer]);
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
  }
}
