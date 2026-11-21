/** Text and pixel comparison of two documents. Pure functions, no PDF.js dependency. */

export type DiffOp = { type: "same" | "add" | "del"; text: string };

export interface CompareOptions {
  ignoreCase?: boolean;
  ignoreWhitespace?: boolean;
}

/**
 * Line diff using a longest-common-subsequence table. Above ~4M cells it falls back to a
 * greedy prefix/suffix match so very large pages cannot freeze the tab.
 */
export function diffLines(a: string[], b: string[], opts: CompareOptions = {}): DiffOp[] {
  const norm = (s: string) => {
    let v = opts.ignoreWhitespace ? s.replace(/\s+/g, " ").trim() : s;
    if (opts.ignoreCase) v = v.toLowerCase();
    return v;
  };
  const A = a.map(norm);
  const B = b.map(norm);
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const ops: DiffOp[] = [];
  for (let i = 0; i < pre; i++) ops.push({ type: "same", text: b[i] });
  const a0 = pre;
  const b0 = pre;
  const n = A.length - pre - suf;
  const m = B.length - pre - suf;
  if (n * m > 4_000_000) {
    for (let i = 0; i < n; i++) ops.push({ type: "del", text: a[a0 + i] });
    for (let j = 0; j < m; j++) ops.push({ type: "add", text: b[b0 + j] });
  } else if (n || m) {
    const w = m + 1;
    const dp = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        dp[i * w + j] = A[a0 + i] === B[b0 + j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (A[a0 + i] === B[b0 + j]) {
        ops.push({ type: "same", text: b[b0 + j] });
        i++;
        j++;
      } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
        ops.push({ type: "del", text: a[a0 + i] });
        i++;
      } else {
        ops.push({ type: "add", text: b[b0 + j] });
        j++;
      }
    }
    while (i < n) ops.push({ type: "del", text: a[a0 + i++] });
    while (j < m) ops.push({ type: "add", text: b[b0 + j++] });
  }
  for (let i = B.length - suf; i < B.length; i++) ops.push({ type: "same", text: b[i] });
  return ops;
}

export interface PageComparison {
  page: number;
  ops: DiffOp[];
  added: number;
  removed: number;
  /** Page exists only in the first or second document. */
  missing?: "a" | "b";
}

export function comparePageTexts(pagesA: string[], pagesB: string[], opts: CompareOptions = {}): PageComparison[] {
  const out: PageComparison[] = [];
  const count = Math.max(pagesA.length, pagesB.length);
  const split = (s: string | undefined) => (s ? s.split("\n").filter((l) => l.trim() !== "") : []);
  for (let p = 0; p < count; p++) {
    const ops = diffLines(split(pagesA[p]), split(pagesB[p]), opts);
    out.push({
      page: p + 1,
      ops,
      added: ops.filter((o) => o.type === "add").length,
      removed: ops.filter((o) => o.type === "del").length,
      missing: p >= pagesA.length ? "a" : p >= pagesB.length ? "b" : undefined,
    });
  }
  return out;
}

/**
 * Pixel diff of two RGBA buffers of equal size. Output is a faded grayscale copy of `a` with
 * changed pixels painted red. `threshold` is the per-pixel colour distance (0–441) that counts as a change.
 */
export function pixelDiff(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 40,
): { data: Uint8ClampedArray; changed: number; ratio: number } {
  const n = width * height;
  if (a.length < n * 4 || b.length < n * 4) throw new Error("Image buffers are smaller than width × height.");
  const out = new Uint8ClampedArray(n * 4);
  let changed = 0;
  const t2 = threshold * threshold;
  for (let i = 0; i < n; i++) {
    const k = i * 4;
    const dr = a[k] - b[k];
    const dg = a[k + 1] - b[k + 1];
    const db = a[k + 2] - b[k + 2];
    if (dr * dr + dg * dg + db * db > t2) {
      changed++;
      out[k] = 230;
      out[k + 1] = 30;
      out[k + 2] = 30;
    } else {
      const g = 0.299 * a[k] + 0.587 * a[k + 1] + 0.114 * a[k + 2];
      const v = 255 - (255 - g) * 0.25;
      out[k] = out[k + 1] = out[k + 2] = v;
    }
    out[k + 3] = 255;
  }
  return { data: out, changed, ratio: n ? changed / n : 0 };
}
