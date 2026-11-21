/** Client-side orchestration of the Broken Link Checker: batches, retries of skipped links, real progress. */
import type { LinkCheckResult } from "./api";

export interface BatchOptions {
  batchSize?: number;
  /** Checks one batch (POST /api/check-links in the UI, a mock in tests). */
  check: (batch: string[], signal?: AbortSignal) => Promise<LinkCheckResult[]>;
  onProgress?: (done: number, total: number, latest: LinkCheckResult[]) => void;
  signal?: AbortSignal;
  /** How many times links skipped for the server's subrequest budget are re-sent. */
  maxRetries?: number;
}

export async function checkLinksInBatches(urls: string[], opts: BatchOptions): Promise<LinkCheckResult[]> {
  const size = Math.max(1, opts.batchSize ?? 10);
  const results = new Map<string, LinkCheckResult>();
  const queue = [...new Set(urls)];
  const tries = new Map<string, number>();
  const total = queue.length;
  while (queue.length) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const batch = queue.splice(0, size);
    const res = await opts.check(batch, opts.signal);
    const fresh: LinkCheckResult[] = [];
    for (const r of res) {
      if (r.verdict === "skipped" && (tries.get(r.url) ?? 0) < (opts.maxRetries ?? 2)) {
        tries.set(r.url, (tries.get(r.url) ?? 0) + 1);
        queue.push(r.url);
        continue;
      }
      results.set(r.url, r);
      fresh.push(r);
    }
    opts.onProgress?.(results.size, total, fresh);
  }
  return urls.filter((u, i) => urls.indexOf(u) === i).map((u) => results.get(u)!).filter(Boolean);
}

export function summarize(results: LinkCheckResult[]) {
  const by = (v: LinkCheckResult["verdict"]) => results.filter((r) => r.verdict === v).length;
  return { total: results.length, ok: by("ok"), redirect: by("redirect"), broken: by("broken"), error: by("error"), blocked: by("blocked"), skipped: by("skipped") };
}
