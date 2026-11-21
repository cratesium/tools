export interface EntrySignature {
  path: string;
  size: number;
  /** Content digest (CRC-32 hex or SHA-256 hex). Compared only when both sides use the same kind. */
  digest?: string;
  directory?: boolean;
}

export type DiffStatus = "added" | "removed" | "changed" | "unchanged";

export interface DiffRow {
  path: string;
  status: DiffStatus;
  sizeA?: number;
  sizeB?: number;
  digestA?: string;
  digestB?: string;
  reason?: string;
}

/**
 * Entry-level diff of two archives. "added" = only in B, "removed" = only in A.
 * An entry is "changed" when its size differs or both digests are known and differ.
 * Directories are ignored (they carry no content).
 */
export function diffArchiveEntries(a: EntrySignature[], b: EntrySignature[]): DiffRow[] {
  const mapA = new Map(a.filter((e) => !e.directory).map((e) => [e.path, e]));
  const mapB = new Map(b.filter((e) => !e.directory).map((e) => [e.path, e]));
  const rows: DiffRow[] = [];
  for (const [path, ea] of mapA) {
    const eb = mapB.get(path);
    if (!eb) {
      rows.push({ path, status: "removed", sizeA: ea.size, digestA: ea.digest });
      continue;
    }
    let status: DiffStatus = "unchanged";
    let reason: string | undefined;
    if (ea.size !== eb.size) {
      status = "changed";
      reason = "size differs";
    } else if (ea.digest && eb.digest && ea.digest !== eb.digest) {
      status = "changed";
      reason = "content differs";
    }
    rows.push({ path, status, sizeA: ea.size, sizeB: eb.size, digestA: ea.digest, digestB: eb.digest, reason });
  }
  for (const [path, eb] of mapB) if (!mapA.has(path)) rows.push({ path, status: "added", sizeB: eb.size, digestB: eb.digest });
  const order: Record<DiffStatus, number> = { changed: 0, added: 1, removed: 2, unchanged: 3 };
  return rows.sort((x, y) => order[x.status] - order[y.status] || x.path.localeCompare(y.path));
}

export function summariseDiff(rows: DiffRow[]): Record<DiffStatus, number> {
  const s: Record<DiffStatus, number> = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  for (const r of rows) s[r.status]++;
  return s;
}
