/** Pure helpers for reading and setting the intrinsic size of SVG documents before rasterising. */

export interface SvgSize {
  width: number | null;
  height: number | null;
  viewBox: [number, number, number, number] | null;
}

const UNIT_PX: Record<string, number> = { "": 1, px: 1, pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, em: 16, rem: 16, ex: 8 };

/** Converts an SVG length ("120", "12.5mm", "2in") to CSS pixels. Percentages return null. */
export function svgLengthToPx(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = v.trim().match(/^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-z%]*)$/i);
  if (!m) return null;
  const unit = m[2].toLowerCase();
  if (unit === "%") return null;
  const f = UNIT_PX[unit];
  if (f == null) return null;
  const n = parseFloat(m[1]) * f;
  return n > 0 ? n : null;
}

function rootTag(svg: string): { tag: string; start: number; end: number } | null {
  const m = /<svg\b[^>]*>/i.exec(svg);
  return m ? { tag: m[0], start: m.index, end: m.index + m[0].length } : null;
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return m ? (m[2] ?? m[3] ?? null) : null;
}

export function parseSvgSize(svg: string): SvgSize {
  const root = rootTag(svg);
  if (!root) throw new Error("No <svg> element found.");
  const vbRaw = attr(root.tag, "viewBox");
  let viewBox: SvgSize["viewBox"] = null;
  if (vbRaw) {
    const n = vbRaw.trim().split(/[\s,]+/).map(Number);
    if (n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0) viewBox = [n[0], n[1], n[2], n[3]];
  }
  return { width: svgLengthToPx(attr(root.tag, "width")), height: svgLengthToPx(attr(root.tag, "height")), viewBox };
}

/** Intrinsic pixel size: explicit width/height, else derived from the viewBox, else 300×150 (the CSS default). */
export function intrinsicSvgSize(s: SvgSize): { width: number; height: number; source: "attributes" | "viewBox" | "default" } {
  const ratio = s.viewBox ? s.viewBox[2] / s.viewBox[3] : null;
  if (s.width && s.height) return { width: s.width, height: s.height, source: "attributes" };
  if (s.width && ratio) return { width: s.width, height: s.width / ratio, source: "attributes" };
  if (s.height && ratio) return { width: s.height * ratio, height: s.height, source: "attributes" };
  if (s.viewBox) return { width: s.viewBox[2], height: s.viewBox[3], source: "viewBox" };
  return { width: s.width ?? 300, height: s.height ?? 150, source: "default" };
}

/**
 * Returns the SVG text with explicit pixel width/height on the root element (and a viewBox, so
 * content scales), which every browser needs to rasterise at an exact size.
 */
export function setSvgSize(svg: string, width: number, height: number): string {
  const root = rootTag(svg);
  if (!root) throw new Error("No <svg> element found.");
  const size = parseSvgSize(svg);
  const intrinsic = intrinsicSvgSize(size);
  let tag = root.tag.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, "");
  const extra = [`width="${width}"`, `height="${height}"`];
  if (!size.viewBox) extra.push(`viewBox="0 0 ${intrinsic.width} ${intrinsic.height}"`);
  if (!/\sxmlns\s*=/.test(tag)) extra.push('xmlns="http://www.w3.org/2000/svg"');
  tag = tag.replace(/^<svg\b/i, `<svg ${extra.join(" ")}`);
  return svg.slice(0, root.start) + tag + svg.slice(root.end);
}

/** Size in bytes of a string when encoded as UTF-8. */
export function utf8Size(s: string): number {
  return new TextEncoder().encode(s).length;
}
