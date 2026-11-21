/** Regex testing logic shared by the main thread and the regex Web Worker. Pure. */

export const VALID_FLAGS = "dgimsuvy";

export interface RegexGroup {
  index: number;
  name?: string;
  value: string | undefined;
  start?: number;
  end?: number;
}

export interface RegexMatch {
  index: number;
  end: number;
  value: string;
  groups: RegexGroup[];
}

export interface RegexRunResult {
  ok: boolean;
  error?: string;
  matches: RegexMatch[];
  truncated: boolean;
  groupNames: string[];
  replaced?: string;
  /** Number of capture groups in the pattern. */
  groupCount: number;
}

export function validateFlags(flags: string): string | null {
  const seen = new Set<string>();
  for (const f of flags) {
    if (!VALID_FLAGS.includes(f)) return `Unknown flag "${f}". Valid flags: ${VALID_FLAGS.split("").join(", ")}.`;
    if (seen.has(f)) return `Flag "${f}" is repeated.`;
    seen.add(f);
  }
  if (seen.has("u") && seen.has("v")) return 'Flags "u" and "v" cannot be combined.';
  return null;
}

export function compileRegex(pattern: string, flags: string): RegExp {
  const fe = validateFlags(flags);
  if (fe) throw new SyntaxError(fe);
  return new RegExp(pattern, flags);
}

export function runRegex(pattern: string, flags: string, text: string, replacement?: string, maxMatches = 5000): RegexRunResult {
  let re: RegExp;
  try {
    // Always collect indices so groups can be located in the text.
    re = compileRegex(pattern, flags.includes("d") ? flags : flags + "d");
  } catch (e) {
    return { ok: false, error: (e as Error).message, matches: [], truncated: false, groupNames: [], groupCount: 0 };
  }
  const groupCount = new RegExp(`${re.source}|`, re.flags.replace(/[gyd]/g, "")).exec("")!.length - 1;
  const groupNameByIndex = captureGroupNames(pattern);
  const groupNames = Object.values(groupNameByIndex);
  const matches: RegexMatch[] = [];
  let truncated = false;
  const global = re.flags.includes("g");
  const toMatch = (m: RegExpExecArray): RegexMatch => {
    const groups: RegexGroup[] = [];
    for (let i = 1; i < m.length; i++) {
      const r = m.indices?.[i];
      groups.push({ index: i, name: groupNameByIndex[i], value: m[i], start: r?.[0], end: r?.[1] });
    }
    return { index: m.index, end: m.index + m[0].length, value: m[0], groups };
  };
  if (global) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (matches.length >= maxMatches) {
        truncated = true;
        break;
      }
      matches.push(toMatch(m));
      if (m[0].length === 0) re.lastIndex = advance(text, re.lastIndex, re.flags.includes("u") || re.flags.includes("v"));
    }
  } else {
    const m = re.exec(text);
    if (m) matches.push(toMatch(m));
  }
  let replaced: string | undefined;
  if (replacement !== undefined) {
    try {
      replaced = text.replace(new RegExp(re.source, re.flags.replace("d", "")), replacement);
    } catch (e) {
      return { ok: false, error: (e as Error).message, matches, truncated, groupNames, groupCount };
    }
  }
  return { ok: true, matches, truncated, groupNames, replaced, groupCount };
}

function advance(s: string, i: number, unicode: boolean): number {
  if (!unicode || i >= s.length) return i + 1;
  const c = s.charCodeAt(i);
  if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
    const d = s.charCodeAt(i + 1);
    if (d >= 0xdc00 && d <= 0xdfff) return i + 2;
  }
  return i + 1;
}

export interface Segment {
  text: string;
  match?: number;
}

/** Splits text into plain and matched segments for highlighting. */
export function segmentText(text: string, matches: RegexMatch[]): Segment[] {
  const out: Segment[] = [];
  let pos = 0;
  matches.forEach((m, i) => {
    if (m.end === m.index) return;
    if (m.index > pos) out.push({ text: text.slice(pos, m.index) });
    out.push({ text: text.slice(m.index, m.end), match: i });
    pos = m.end;
  });
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

export interface RegexWorkerRequest {
  id: number;
  pattern: string;
  flags: string;
  text: string;
  replacement?: string;
}

export interface RegexWorkerResponse {
  id: number;
  result: RegexRunResult;
}

/** Maps capture-group index → name by scanning the pattern source. */
export function captureGroupNames(pattern: string): Record<number, string> {
  const out: Record<number, string> = {};
  let idx = 0;
  let inClass = 0;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (inClass) {
      if (c === "[") inClass++;
      else if (c === "]") inClass--;
      continue;
    }
    if (c === "[") {
      inClass = 1;
      continue;
    }
    if (c !== "(") continue;
    if (pattern[i + 1] !== "?") {
      idx++;
      continue;
    }
    const named = /^\(\?<([A-Za-z_$][\w$]*)>/.exec(pattern.slice(i));
    if (named) {
      idx++;
      out[idx] = named[1];
    }
  }
  return out;
}
