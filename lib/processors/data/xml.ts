/** Table → XML with safe element names. */

import { cellText, type Table } from "./table";

/**
 * Turns an arbitrary header into a valid XML element name: invalid characters become "_",
 * names that start with a digit, "-", "." or "xml" (reserved) get a leading "_".
 */
export function safeTagName(name: string, fallback = "field"): string {
  let s = name.trim().replace(/\s+/g, "_");
  // Allowed: letters, digits, _, -, . (colon is excluded to avoid accidental namespaces).
  s = s.replace(/[^A-Za-z0-9_.\-À-ÖØ-öø-˿Ͱ-ͽͿ-῿‌-‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�]/g, "_");
  if (!s) return fallback;
  if (/^[0-9.\-]/.test(s) || /^xml/i.test(s)) s = `_${s}`;
  return s;
}

/** Removes characters that are not allowed in XML 1.0 and escapes markup. */
export function escapeXml(s: string, attr = false): string {
  const clean = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");
  const r = clean.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return attr ? r.replace(/"/g, "&quot;").replace(/'/g, "&apos;") : r;
}

export interface XmlOptions {
  root?: string;
  row?: string;
  /** Write values as attributes of the row element instead of child elements. */
  attributes?: boolean;
  /** Indentation string; empty for compact output. */
  indent?: string;
  declaration?: boolean;
  /** Omit elements/attributes for empty cells. */
  skipEmpty?: boolean;
}

export function tableToXml(t: Table, opts: XmlOptions = {}): string {
  const root = safeTagName(opts.root ?? "rows", "rows");
  const row = safeTagName(opts.row ?? "row", "row");
  const ind = opts.indent ?? "  ";
  const nl = ind ? "\n" : "";
  const used = new Set<string>();
  const tags = t.headers.map((h, i) => {
    const base = safeTagName(h, `field${i + 1}`);
    let tag = base;
    let k = 2;
    while (used.has(tag)) tag = `${base}_${k++}`;
    used.add(tag);
    return tag;
  });
  const out: string[] = [];
  if (opts.declaration ?? true) out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(`<${root}>`);
  for (const r of t.rows) {
    if (opts.attributes) {
      const attrs = tags
        .map((tag, i) => [tag, cellText(r[i] ?? null)] as const)
        .filter(([, v]) => !(opts.skipEmpty && v === ""))
        .map(([tag, v]) => ` ${tag}="${escapeXml(v, true)}"`)
        .join("");
      out.push(`${ind}<${row}${attrs}/>`);
    } else {
      out.push(`${ind}<${row}>`);
      tags.forEach((tag, i) => {
        const v = cellText(r[i] ?? null);
        if (v === "") {
          if (!opts.skipEmpty) out.push(`${ind}${ind}<${tag}/>`);
        } else out.push(`${ind}${ind}<${tag}>${escapeXml(v)}</${tag}>`);
      });
      out.push(`${ind}</${row}>`);
    }
  }
  out.push(`</${root}>`);
  return out.join(nl) + nl;
}
