/**
 * XML well-formedness checking, pretty printing, minifying and JSON conversion.
 *
 * The formatter is a small tokenizer that works on the source text, so comments,
 * CDATA sections, processing instructions and DOCTYPE declarations are kept exactly
 * as written (a parse → rebuild round trip through an object model would lose them).
 */
import { XMLParser, XMLValidator } from "fast-xml-parser";

export interface XmlValidation {
  valid: boolean;
  message?: string;
  code?: string;
  line?: number;
  column?: number;
}

export function validateXml(xml: string): XmlValidation {
  if (!xml.trim()) return { valid: false, message: "Input is empty", line: 1, column: 1 };
  const r = XMLValidator.validate(xml, { allowBooleanAttributes: false });
  if (r === true) return { valid: true };
  return { valid: false, message: r.err.msg, code: r.err.code, line: r.err.line, column: r.err.col };
}

export type XmlTokenType = "decl" | "pi" | "comment" | "cdata" | "doctype" | "open" | "close" | "selfclose" | "text";

export interface XmlToken {
  type: XmlTokenType;
  raw: string;
  name?: string;
}

/** Splits XML into tokens. Assumes reasonably well-formed input; unknown "<" sequences become text. */
export function tokenizeXml(xml: string): XmlToken[] {
  const tokens: XmlToken[] = [];
  let i = 0;
  const n = xml.length;
  const pushText = (raw: string) => {
    if (!raw) return;
    const last = tokens[tokens.length - 1];
    if (last?.type === "text") last.raw += raw;
    else tokens.push({ type: "text", raw });
  };
  while (i < n) {
    const lt = xml.indexOf("<", i);
    if (lt < 0) {
      pushText(xml.slice(i));
      break;
    }
    if (lt > i) pushText(xml.slice(i, lt));
    i = lt;
    if (xml.startsWith("<!--", i)) {
      const end = xml.indexOf("-->", i + 4);
      const stop = end < 0 ? n : end + 3;
      tokens.push({ type: "comment", raw: xml.slice(i, stop) });
      i = stop;
    } else if (xml.startsWith("<![CDATA[", i)) {
      const end = xml.indexOf("]]>", i + 9);
      const stop = end < 0 ? n : end + 3;
      tokens.push({ type: "cdata", raw: xml.slice(i, stop) });
      i = stop;
    } else if (xml.startsWith("<?", i)) {
      const end = xml.indexOf("?>", i + 2);
      const stop = end < 0 ? n : end + 2;
      const raw = xml.slice(i, stop);
      tokens.push({ type: /^<\?xml\s/i.test(raw) ? "decl" : "pi", raw });
      i = stop;
    } else if (/^<!DOCTYPE/i.test(xml.slice(i, i + 9))) {
      // DOCTYPE may contain an internal subset in [ ... ] with its own '>' characters.
      let j = i + 9;
      let depth = 0;
      let quote = "";
      for (; j < n; j++) {
        const c = xml[j];
        if (quote) {
          if (c === quote) quote = "";
        } else if (c === '"' || c === "'") quote = c;
        else if (c === "[") depth++;
        else if (c === "]") depth--;
        else if (c === ">" && depth <= 0) break;
      }
      tokens.push({ type: "doctype", raw: xml.slice(i, j + 1) });
      i = j + 1;
    } else if (xml[i + 1] === "/") {
      const end = xml.indexOf(">", i);
      const stop = end < 0 ? n : end + 1;
      const raw = xml.slice(i, stop);
      tokens.push({ type: "close", raw, name: raw.slice(2).replace(/[\s>].*$/s, "") });
      i = stop;
    } else if (/[A-Za-z_:]/.test(xml[i + 1] ?? "")) {
      let j = i + 1;
      let quote = "";
      for (; j < n; j++) {
        const c = xml[j];
        if (quote) {
          if (c === quote) quote = "";
        } else if (c === '"' || c === "'") quote = c;
        else if (c === ">") break;
      }
      const raw = xml.slice(i, j + 1);
      const name = raw.slice(1).replace(/[\s/>].*$/s, "");
      tokens.push({ type: /\/\s*>$/.test(raw) ? "selfclose" : "open", raw, name });
      i = j + 1;
    } else {
      pushText("<");
      i++;
    }
  }
  return tokens;
}

/** Normalises whitespace between attributes of a start tag without touching attribute values. */
function normalizeTag(raw: string): string {
  return raw
    .split(/("[^"]*"|'[^']*')/)
    .map((p, i) => (i % 2 ? p : p.replace(/\s+/g, " ").replace(/\s*=\s*/g, "=")))
    .join("")
    .replace(/\s*\/>$/, "/>")
    .replace(/\s+>$/, ">");
}

export interface XmlFormatOptions {
  indent?: number | "tab";
  /** Write empty elements as <a/> instead of <a></a>. */
  selfCloseEmpty?: boolean;
  /** Normalise whitespace inside start tags (attribute values are never changed). */
  normalizeTags?: boolean;
}

export function formatXml(xml: string, opts: XmlFormatOptions = {}): string {
  const unit = opts.indent === "tab" ? "\t" : " ".repeat(opts.indent ?? 2);
  const tokens = tokenizeXml(xml.replace(/^﻿/, ""));
  const lines: string[] = [];
  const tag = (raw: string) => (opts.normalizeTags === false ? raw : normalizeTag(raw));
  let depth = 0;
  const pad = () => unit.repeat(Math.max(0, depth));
  const isText = (t?: XmlToken) => t && (t.type === "text" || t.type === "cdata");

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "open") {
      // xml:space="preserve": copy the element verbatim.
      if (/\sxml:space\s*=\s*["']preserve["']/.test(t.raw)) {
        let d = 0;
        let raw = "";
        let j = i;
        for (; j < tokens.length; j++) {
          const u = tokens[j];
          raw += u.raw;
          if (u.type === "open") d++;
          else if (u.type === "close") d--;
          if (d === 0) break;
        }
        lines.push(pad() + raw);
        i = j;
        continue;
      }
      const next = tokens[i + 1];
      if (next?.type === "close") {
        lines.push(pad() + (opts.selfCloseEmpty ? tag(t.raw).replace(/\s*>$/, "/>") : tag(t.raw) + next.raw));
        i++;
        continue;
      }
      // Simple content: <a>text</a> or <a><![CDATA[..]]></a> stays on one line.
      if (isText(next) && tokens[i + 2]?.type === "close" && (next!.type === "cdata" || next!.raw.trim())) {
        const body = next!.type === "cdata" ? next!.raw : next!.raw.trim();
        if (!body.includes("\n")) {
          lines.push(pad() + tag(t.raw) + body + tokens[i + 2].raw);
          i += 2;
          continue;
        }
      }
      if (isText(next) && !next!.raw.trim() && tokens[i + 2]?.type === "close") {
        lines.push(pad() + (opts.selfCloseEmpty ? tag(t.raw).replace(/\s*>$/, "/>") : tag(t.raw) + tokens[i + 2].raw));
        i += 2;
        continue;
      }
      lines.push(pad() + tag(t.raw));
      depth++;
    } else if (t.type === "close") {
      depth--;
      lines.push(pad() + t.raw.replace(/\s+>$/, ">"));
    } else if (t.type === "selfclose") {
      lines.push(pad() + tag(t.raw));
    } else if (t.type === "text") {
      const s = t.raw.trim();
      if (!s) continue;
      for (const l of s.split(/\r?\n/)) {
        const lt = l.trim();
        if (lt) lines.push(pad() + lt);
      }
    } else {
      lines.push(pad() + t.raw);
    }
  }
  return lines.join("\n");
}

export function minifyXml(xml: string, opts: { removeComments?: boolean } = {}): string {
  const tokens = tokenizeXml(xml.replace(/^﻿/, ""));
  let out = "";
  let preserve = 0;
  for (const t of tokens) {
    if (preserve) {
      out += t.raw;
      if (t.type === "open") preserve++;
      else if (t.type === "close") preserve--;
      continue;
    }
    switch (t.type) {
      case "comment":
        if (!opts.removeComments) out += t.raw;
        break;
      case "text":
        if (t.raw.trim()) out += t.raw.trim().replace(/\s*\n\s*/g, " ");
        break;
      case "open":
        if (/\sxml:space\s*=\s*["']preserve["']/.test(t.raw)) preserve = 1;
        out += normalizeTag(t.raw);
        break;
      case "selfclose":
        out += normalizeTag(t.raw);
        break;
      case "close":
        out += t.raw.replace(/\s+>$/, ">");
        break;
      default:
        out += t.raw;
    }
  }
  return out;
}

export interface XmlToJsonOptions {
  /** Include attributes (prefixed with attributePrefix). */
  attributes?: boolean;
  attributePrefix?: string;
  textKey?: string;
  /** Convert numeric and boolean text to numbers/booleans. */
  parseValues?: boolean;
  /** Keep the root element as the top-level key. */
  keepRoot?: boolean;
}

export function xmlToJson(xml: string, opts: XmlToJsonOptions = {}): unknown {
  const v = validateXml(xml);
  if (!v.valid) throw new XmlError(v);
  const parser = new XMLParser({
    ignoreAttributes: opts.attributes === false,
    attributeNamePrefix: opts.attributePrefix ?? "@",
    textNodeName: opts.textKey ?? "#text",
    parseTagValue: opts.parseValues ?? false,
    parseAttributeValue: opts.parseValues ?? false,
    trimValues: true,
    ignoreDeclaration: true,
    ignorePiTags: true,
    cdataPropName: false,
    processEntities: true,
  });
  const obj = parser.parse(xml) as Record<string, unknown>;
  if (opts.keepRoot === false) {
    const keys = Object.keys(obj);
    if (keys.length === 1) return obj[keys[0]];
  }
  return obj;
}

export class XmlError extends Error {
  line?: number;
  column?: number;
  constructor(v: XmlValidation) {
    super(v.line ? `${v.message} (line ${v.line}, column ${v.column})` : v.message ?? "Invalid XML");
    this.name = "XmlError";
    this.line = v.line;
    this.column = v.column;
  }
}

export function escapeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeXmlAttr(s: string): string {
  return escapeXmlText(s).replace(/"/g, "&quot;");
}

/** Makes an arbitrary JSON key a valid XML element name. */
export function xmlName(key: string): string {
  let n = key.replace(/[^\p{L}\p{N}_.\-:]/gu, "_");
  if (!n || !/^[\p{L}_]/u.test(n) || /^xml/i.test(n)) n = "_" + n;
  return n;
}

export interface JsonToXmlOptions {
  rootName?: string;
  itemName?: string;
  indent?: number | "tab";
  declaration?: boolean;
  /** Keys starting with this prefix become attributes. */
  attributePrefix?: string;
  textKey?: string;
}

export function jsonToXml(value: unknown, opts: JsonToXmlOptions = {}): string {
  const unit = opts.indent === "tab" ? "\t" : " ".repeat(opts.indent ?? 2);
  const nl = unit ? "\n" : "";
  const itemName = xmlName(opts.itemName || "item");
  const attrPrefix = opts.attributePrefix ?? "@";
  const textKey = opts.textKey ?? "#text";
  const lines: string[] = [];

  const prim = (v: unknown) => (v === null || v === undefined ? "" : escapeXmlText(String(v)));

  const emit = (name: string, v: unknown, depth: number) => {
    const pad = unit.repeat(depth);
    if (Array.isArray(v)) {
      // Repeated elements with the same name; nested arrays get <item> children.
      for (const x of v) {
        if (Array.isArray(x)) {
          lines.push(`${pad}<${name}>`);
          for (const y of x) emit(itemName, y, depth + 1);
          lines.push(`${pad}</${name}>`);
        } else emit(name, x, depth);
      }
      return;
    }
    if (v && typeof v === "object") {
      const entries = Object.entries(v as Record<string, unknown>);
      const attrs = entries.filter(([k, x]) => attrPrefix && k.startsWith(attrPrefix) && (x === null || typeof x !== "object"));
      const text = entries.find(([k]) => k === textKey);
      const children = entries.filter(([k]) => !attrs.some(([a]) => a === k) && k !== textKey);
      const attrStr = attrs.map(([k, x]) => ` ${xmlName(k.slice(attrPrefix.length))}="${escapeXmlAttr(x == null ? "" : String(x))}"`).join("");
      if (!children.length) {
        const t = text ? prim(text[1]) : "";
        lines.push(t ? `${pad}<${name}${attrStr}>${t}</${name}>` : `${pad}<${name}${attrStr}/>`);
        return;
      }
      lines.push(`${pad}<${name}${attrStr}>`);
      if (text) lines.push(`${pad}${unit}${prim(text[1])}`);
      for (const [k, x] of children) emit(xmlName(k), x, depth + 1);
      lines.push(`${pad}</${name}>`);
      return;
    }
    const t = prim(v);
    lines.push(t === "" ? `${pad}<${name}/>` : `${pad}<${name}>${t}</${name}>`);
  };

  const root = opts.rootName === "" ? "" : xmlName(opts.rootName || "root");
  if (opts.declaration !== false) lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  const isObj = value && typeof value === "object" && !Array.isArray(value);
  if (!root) {
    // No wrapper: requires an object with exactly one key.
    const keys = isObj ? Object.keys(value as object) : [];
    if (keys.length !== 1) throw new Error("Without a root element the JSON must be an object with exactly one top-level key");
    emit(xmlName(keys[0]), (value as Record<string, unknown>)[keys[0]], 0);
  } else if (Array.isArray(value)) {
    lines.push(`<${root}>`);
    for (const x of value) emit(itemName, x, 1);
    lines.push(`</${root}>`);
  } else emit(root, value, 0);
  return lines.join(nl);
}
