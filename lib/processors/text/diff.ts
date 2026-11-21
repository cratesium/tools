/** Text comparison built on jsdiff. Pure; returns render-ready structures. */
import { createTwoFilesPatch, diffArrays, diffChars, diffLines, diffWordsWithSpace, type ChangeObject } from "diff";

export type DiffGranularity = "lines" | "words" | "chars";

export interface DiffOptions {
  granularity: DiffGranularity;
  ignoreCase: boolean;
  /** Ignore leading/trailing whitespace and changes in amount of whitespace (lines mode). */
  ignoreWhitespace: boolean;
}

export interface DiffPart {
  type: "equal" | "added" | "removed";
  value: string;
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
  /** Unit of the counts: lines, words or characters. */
  unit: string;
  identical: boolean;
}

function normalizeWs(s: string) {
  return s.replace(/\r\n?/g, "\n");
}

export function computeDiff(a: string, b: string, o: DiffOptions): DiffPart[] {
  const left = normalizeWs(a);
  const right = normalizeWs(b);
  let changes: ChangeObject<string>[];
  if (o.granularity === "lines") {
    // Lines without a trailing newline would otherwise differ from the same line followed by one.
    const l = left.endsWith("\n") || !left ? left : left + "\n";
    const r = right.endsWith("\n") || !right ? right : right + "\n";
    // jsdiff's own ignoreWhitespace only trims; collapse inner runs of whitespace too.
    const norm = (x: string) => {
      let v = o.ignoreWhitespace ? x.replace(/\s+/g, " ").trim() : x;
      if (o.ignoreCase) v = v.toLowerCase();
      return v;
    };
    if (o.ignoreWhitespace || o.ignoreCase) {
      // diffLines has no comparator option; diff the line arrays with one instead.
      const split = (s: string) => (s ? s.slice(0, -1).split("\n") : []);
      changes = diffArrays(split(l), split(r), { comparator: (x: string, y: string) => norm(x) === norm(y) }).map((c) => ({
        added: c.added,
        removed: c.removed,
        count: c.count,
        value: c.value.map((v) => `${v}\n`).join(""),
      }));
    } else {
      changes = diffLines(l, r);
    }
  } else if (o.granularity === "words") {
    changes = diffWordsWithSpace(left, right, { ignoreCase: o.ignoreCase });
  } else {
    changes = diffChars(left, right, { ignoreCase: o.ignoreCase });
  }
  return changes.map((c) => ({ type: c.added ? "added" : c.removed ? "removed" : "equal", value: c.value }));
}

const countUnits = (value: string, g: DiffGranularity) =>
  g === "lines"
    ? value.split("\n").length - (value.endsWith("\n") ? 1 : 0)
    : g === "words"
      ? (value.match(/\S+/g) ?? []).length
      : [...value].length;

export function diffStats(parts: DiffPart[], g: DiffGranularity): DiffStats {
  const s = { added: 0, removed: 0, unchanged: 0 };
  for (const p of parts) {
    const n = countUnits(p.value, g);
    if (p.type === "added") s.added += n;
    else if (p.type === "removed") s.removed += n;
    else s.unchanged += n;
  }
  return { ...s, unit: g === "lines" ? "lines" : g === "words" ? "words" : "characters", identical: s.added === 0 && s.removed === 0 };
}

export interface SideBySideRow {
  type: "equal" | "changed" | "added" | "removed";
  leftNo: number | null;
  rightNo: number | null;
  left: string | null;
  right: string | null;
}

/** Pairs removed/added runs of a line diff into aligned rows for a two-column view. */
export function sideBySide(parts: DiffPart[]): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let ln = 1;
  let rn = 1;
  const toLines = (v: string) => {
    const ls = v.split("\n");
    if (ls[ls.length - 1] === "") ls.pop();
    return ls;
  };
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.type === "equal") {
      for (const l of toLines(p.value)) rows.push({ type: "equal", leftNo: ln++, rightNo: rn++, left: l, right: l });
    } else if (p.type === "removed") {
      const removed = toLines(p.value);
      const next = parts[i + 1];
      const added = next && next.type === "added" ? toLines(next.value) : [];
      if (added.length) i++;
      const n = Math.max(removed.length, added.length);
      for (let k = 0; k < n; k++) {
        const l = removed[k] ?? null;
        const r = added[k] ?? null;
        rows.push({
          type: l != null && r != null ? "changed" : l != null ? "removed" : "added",
          leftNo: l != null ? ln++ : null,
          rightNo: r != null ? rn++ : null,
          left: l,
          right: r,
        });
      }
    } else {
      for (const l of toLines(p.value)) rows.push({ type: "added", leftNo: null, rightNo: rn++, left: null, right: l });
    }
  }
  return rows;
}

/** Inline character-level highlights for a changed row. */
export function inlineChanges(left: string, right: string): { left: DiffPart[]; right: DiffPart[] } {
  const parts = diffWordsWithSpace(left, right);
  const L: DiffPart[] = [];
  const R: DiffPart[] = [];
  for (const c of parts) {
    if (c.added) R.push({ type: "added", value: c.value });
    else if (c.removed) L.push({ type: "removed", value: c.value });
    else {
      L.push({ type: "equal", value: c.value });
      R.push({ type: "equal", value: c.value });
    }
  }
  return { left: L, right: R };
}

export function unifiedPatch(a: string, b: string, o: Pick<DiffOptions, "ignoreCase" | "ignoreWhitespace">, context = 3): string {
  return createTwoFilesPatch("original.txt", "changed.txt", normalizeWs(a), normalizeWs(b), undefined, undefined, {
    context,
    ignoreWhitespace: o.ignoreWhitespace,
  });
}
