/** Pure file-name transformations for the File Renamer and Bulk File Renamer. */

export type CaseMode = "keep" | "lower" | "upper" | "title" | "sentence" | "kebab" | "snake" | "camel";

export interface RenameRules {
  find?: string;
  replace?: string;
  useRegex?: boolean;
  caseSensitive?: boolean;
  prefix?: string;
  suffix?: string;
  numbering?: {
    enabled: boolean;
    start: number;
    step: number;
    padding: number;
    position: "prefix" | "suffix" | "replace";
    separator: string;
  };
  caseMode?: CaseMode;
  /** New extension (without dot). Empty = keep. "-" removes the extension. */
  extension?: string;
  extensionCase?: "keep" | "lower" | "upper";
  trimSpaces?: boolean;
}

export function splitName(name: string): { base: string; ext: string } {
  const i = name.lastIndexOf(".");
  if (i <= 0) return { base: name, ext: "" };
  return { base: name.slice(0, i), ext: name.slice(i + 1) };
}

function words(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter(Boolean);
}

export function applyCase(s: string, mode: CaseMode): string {
  switch (mode) {
    case "lower":
      return s.toLowerCase();
    case "upper":
      return s.toUpperCase();
    case "title":
      return s.toLowerCase().replace(/(^|[\s_\-.(\[])(\p{L})/gu, (_m, p, c: string) => p + c.toUpperCase());
    case "sentence":
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    case "kebab":
      return words(s).join("-").toLowerCase();
    case "snake":
      return words(s).join("_").toLowerCase();
    case "camel":
      return words(s)
        .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
        .join("");
    default:
      return s;
  }
}

/** Characters not allowed in file names on Windows/macOS/Linux. */
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g;

export function sanitizeFileName(name: string): string {
  let n = name.replace(ILLEGAL, "_").replace(/[. ]+$/, "");
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(n)) n = `_${n}`;
  return n || "_";
}

export function validateRegex(pattern: string, flags = "g"): string | null {
  try {
    new RegExp(pattern, flags);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid regular expression";
  }
}

/** Applies the rules to one name; `index` is the 0-based position in the list. */
export function renameOne(name: string, rules: RenameRules, index: number): string {
  let { base, ext } = splitName(name);
  if (rules.find) {
    if (rules.useRegex) {
      const re = new RegExp(rules.find, rules.caseSensitive === false ? "gi" : "g");
      base = base.replace(re, rules.replace ?? "");
    } else {
      const escaped = rules.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      base = base.replace(new RegExp(escaped, rules.caseSensitive === false ? "gi" : "g"), () => rules.replace ?? "");
    }
  }
  if (rules.trimSpaces) base = base.replace(/\s+/g, " ").trim();
  if (rules.caseMode && rules.caseMode !== "keep") base = applyCase(base, rules.caseMode);
  const num = rules.numbering;
  if (num?.enabled) {
    const n = String(num.start + index * num.step).padStart(num.padding, "0");
    if (num.position === "replace") base = n;
    else if (num.position === "prefix") base = `${n}${num.separator}${base}`;
    else base = `${base}${num.separator}${n}`;
  }
  base = `${rules.prefix ?? ""}${base}${rules.suffix ?? ""}`;
  if (rules.extension === "-") ext = "";
  else if (rules.extension) ext = rules.extension.replace(/^\./, "");
  if (rules.extensionCase === "lower") ext = ext.toLowerCase();
  else if (rules.extensionCase === "upper") ext = ext.toUpperCase();
  return sanitizeFileName(ext ? `${base}.${ext}` : base);
}

export interface RenamePreview {
  from: string;
  to: string;
  changed: boolean;
  conflict: boolean;
}

/**
 * Renames a list and resolves duplicates by appending " (2)", " (3)" …
 * Conflicts are flagged so the UI can show them.
 */
export function renameAll(names: string[], rules: RenameRules): RenamePreview[] {
  const raw = names.map((n, i) => renameOne(n, rules, i));
  const used = new Map<string, number>();
  return raw.map((to, i) => {
    const key = to.toLowerCase();
    let final = to;
    let conflict = false;
    if (used.has(key)) {
      conflict = true;
      const { base, ext } = splitName(to);
      let k = (used.get(key) ?? 1) + 1;
      while (used.has(`${base} (${k})${ext ? `.${ext}` : ""}`.toLowerCase())) k++;
      final = `${base} (${k})${ext ? `.${ext}` : ""}`;
      used.set(key, k);
    }
    used.set(final.toLowerCase(), used.get(final.toLowerCase()) ?? 1);
    return { from: names[i], to: final, changed: final !== names[i], conflict };
  });
}

/** Replace (or add/remove) the extension of a single name. */
export function changeExtension(name: string, newExt: string): string {
  const { base } = splitName(name);
  const e = newExt.trim().replace(/^\.+/, "");
  return sanitizeFileName(e ? `${base}.${e}` : base);
}
