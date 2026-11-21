/**
 * PowerPoint (.pptx) → PDF. Reads the Open XML package with JSZip + DOMParser and redraws each
 * slide with pdf-lib: text boxes (position, size, bold/italic, colour, alignment, bullets),
 * pictures (PNG/JPEG), simple tables, solid shape fills and backgrounds, including decoration
 * shapes inherited from slide layouts and masters. Not reproduced: gradients, shadows, custom
 * geometry, charts, SmartArt, EMF/WMF/SVG pictures, embedded fonts and animations.
 * Requires DOMParser (browser, or jsdom in tests).
 */
import type JSZipType from "jszip";
import type { PDFFont, PDFPage, RGB } from "@cantoo/pdf-lib";
import { makeSanitizer } from "./layout";
import { pdfLib } from "./load";

const EMU_PER_PT = 12700;

export type Color = [number, number, number];

export interface PptxRun {
  text: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  color?: Color;
}

export interface PptxParagraph {
  runs: PptxRun[];
  align: "l" | "ctr" | "r" | "just";
  bullet?: string;
  level: number;
  indent: number;
  defaultSize: number;
}

export interface PptxShape {
  kind: "text" | "image" | "table";
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: Color;
  line?: Color;
  paragraphs?: PptxParagraph[];
  anchor?: "t" | "ctr" | "b";
  insets?: [number, number, number, number];
  wrap?: boolean;
  fontScale?: number;
  image?: { data: Uint8Array; mime: "image/png" | "image/jpeg" };
  table?: { cols: number[]; rows: { h: number; cells: PptxParagraph[][] }[] };
}

export interface PptxSlide {
  index: number;
  background?: Color;
  backgroundImage?: { data: Uint8Array; mime: "image/png" | "image/jpeg" };
  shapes: PptxShape[];
}

export interface ParsedPptx {
  width: number;
  height: number;
  slides: PptxSlide[];
  skippedImages: number;
  skippedObjects: number;
}

type Rels = Map<string, { target: string; type: string }>;

const kids = (el: Element | null | undefined, name: string): Element[] =>
  el ? Array.from(el.children).filter((c) => c.localName === name) : [];
const kid = (el: Element | null | undefined, name: string): Element | null => kids(el, name)[0] ?? null;
const desc = (el: Element | Document | null | undefined, name: string): Element | null =>
  el ? (el.getElementsByTagNameNS("*", name)[0] ?? null) : null;
const path = (el: Element | null | undefined, ...names: string[]): Element | null => {
  let cur: Element | null = el ?? null;
  for (const n of names) cur = kid(cur, n);
  return cur;
};
const num = (v: string | null | undefined, d = 0) => (v == null || v === "" || Number.isNaN(Number(v)) ? d : Number(v));
const attrR = (el: Element | null, name: string) =>
  el?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", name) ?? el?.getAttribute(`r:${name}`) ?? null;

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

export function resolvePart(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = (baseDir ? baseDir.split("/") : []).filter(Boolean);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

const dirOf = (p: string) => p.slice(0, p.lastIndexOf("/"));
const relsPathOf = (p: string) => `${dirOf(p)}/_rels/${p.slice(p.lastIndexOf("/") + 1)}.rels`;

async function readRels(zip: JSZipType, partPath: string): Promise<Rels> {
  const map: Rels = new Map();
  const f = zip.file(relsPathOf(partPath));
  if (!f) return map;
  const doc = parseXml(await f.async("string"));
  for (const r of Array.from(doc.getElementsByTagNameNS("*", "Relationship"))) {
    const mode = r.getAttribute("TargetMode");
    const target = r.getAttribute("Target") || "";
    map.set(r.getAttribute("Id") || "", {
      target: mode === "External" ? target : resolvePart(dirOf(partPath), target),
      type: (r.getAttribute("Type") || "").replace(/^.*\//, ""),
    });
  }
  return map;
}

function hexColor(v: string | null): Color | undefined {
  if (!v || !/^[0-9a-f]{6}$/i.test(v)) return undefined;
  return [parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255];
}

type Theme = Map<string, Color>;

async function readTheme(zip: JSZipType, masterPath: string, masterRels: Rels): Promise<Theme> {
  const theme: Theme = new Map();
  const rel = [...masterRels.values()].find((r) => r.type === "theme");
  const f = rel ? zip.file(rel.target) : null;
  if (!f) return theme;
  const doc = parseXml(await f.async("string"));
  const scheme = desc(doc, "clrScheme");
  for (const c of Array.from(scheme?.children ?? [])) {
    const srgb = kid(c, "srgbClr")?.getAttribute("val") ?? kid(c, "sysClr")?.getAttribute("lastClr") ?? null;
    const col = hexColor(srgb);
    if (col) theme.set(c.localName, col);
  }
  void masterPath;
  return theme;
}

function applyLum(c: Color, el: Element): Color {
  let [r, g, b] = c;
  const mod = kid(el, "lumMod")?.getAttribute("val");
  const off = kid(el, "lumOff")?.getAttribute("val");
  const shade = kid(el, "shade")?.getAttribute("val");
  const tint = kid(el, "tint")?.getAttribute("val");
  if (mod || off) {
    const m = num(mod, 100000) / 100000;
    const o = num(off, 0) / 100000;
    [r, g, b] = [r, g, b].map((v) => Math.min(1, Math.max(0, v * m + o))) as Color;
  }
  if (shade) [r, g, b] = [r, g, b].map((v) => v * (num(shade) / 100000)) as Color;
  if (tint) [r, g, b] = [r, g, b].map((v) => 1 - (1 - v) * (num(tint) / 100000)) as Color;
  return [r, g, b];
}

function colorOf(fillParent: Element | null, theme: Theme): Color | undefined {
  const solid = fillParent?.localName === "solidFill" ? fillParent : kid(fillParent, "solidFill");
  if (!solid) return undefined;
  const srgb = kid(solid, "srgbClr");
  if (srgb) {
    const c = hexColor(srgb.getAttribute("val"));
    return c ? applyLum(c, srgb) : undefined;
  }
  const scheme = kid(solid, "schemeClr");
  if (scheme) {
    const alias: Record<string, string> = { tx1: "dk1", bg1: "lt1", tx2: "dk2", bg2: "lt2" };
    const v = scheme.getAttribute("val") || "";
    const c = theme.get(alias[v] ?? v);
    return c ? applyLum(c, scheme) : undefined;
  }
  const sys = kid(solid, "sysClr");
  if (sys) return hexColor(sys.getAttribute("lastClr"));
  const prst = kid(solid, "prstClr")?.getAttribute("val");
  if (prst === "black") return [0, 0, 0];
  if (prst === "white") return [1, 1, 1];
  return undefined;
}

interface Xfrm {
  x: number;
  y: number;
  w: number;
  h: number;
}

function readXfrm(el: Element | null): Xfrm | null {
  const off = kid(el, "off");
  const ext = kid(el, "ext");
  if (!off || !ext) return null;
  return {
    x: num(off.getAttribute("x")) / EMU_PER_PT,
    y: num(off.getAttribute("y")) / EMU_PER_PT,
    w: num(ext.getAttribute("cx")) / EMU_PER_PT,
    h: num(ext.getAttribute("cy")) / EMU_PER_PT,
  };
}

/** Placeholder info inherited from layout/master: position and default text sizes per level. */
interface PhInfo {
  xfrm: Xfrm | null;
  sizes: (number | undefined)[];
  bullets: (string | undefined)[];
}

interface Styles {
  title: (number | undefined)[];
  body: (number | undefined)[];
  other: (number | undefined)[];
  bodyBullets: (string | undefined)[];
}

function levelSizes(lst: Element | null): (number | undefined)[] {
  return Array.from({ length: 9 }, (_, i) => {
    const sz = path(lst, `lvl${i + 1}pPr`, "defRPr")?.getAttribute("sz");
    return sz ? num(sz) / 100 : undefined;
  });
}
function levelBullets(lst: Element | null): (string | undefined)[] {
  return Array.from({ length: 9 }, (_, i) => {
    const p = kid(lst, `lvl${i + 1}pPr`);
    if (!p) return undefined;
    if (kid(p, "buNone")) return "";
    return kid(p, "buChar")?.getAttribute("char") ?? undefined;
  });
}

function phKey(sp: Element): { type: string; idx: string } | null {
  const ph = desc(kid(sp, "nvSpPr") ?? kid(sp, "nvPicPr") ?? kid(sp, "nvGraphicFramePr") ?? sp, "ph");
  if (!ph) return null;
  return { type: ph.getAttribute("type") || "body", idx: ph.getAttribute("idx") || "" };
}

function collectPlaceholders(spTree: Element | null): { type: string; idx: string; info: PhInfo }[] {
  const out: { type: string; idx: string; info: PhInfo }[] = [];
  for (const sp of kids(spTree, "sp")) {
    const k = phKey(sp);
    if (!k) continue;
    const lst = path(sp, "txBody", "lstStyle");
    out.push({ ...k, info: { xfrm: readXfrm(path(sp, "spPr", "xfrm")), sizes: levelSizes(lst), bullets: levelBullets(lst) } });
  }
  return out;
}

function findPh(list: { type: string; idx: string; info: PhInfo }[], key: { type: string; idx: string }) {
  const norm = (t: string) => (t === "ctrTitle" ? "title" : t === "obj" ? "body" : t);
  return (
    (key.idx ? list.find((p) => p.idx === key.idx) : undefined) ??
    list.find((p) => norm(p.type) === norm(key.type)) ??
    undefined
  );
}

interface Ctx {
  zip: JSZipType;
  rels: Rels;
  theme: Theme;
  styles: Styles;
  layoutPh: { type: string; idx: string; info: PhInfo }[];
  masterPh: { type: string; idx: string; info: PhInfo }[];
  stats: { skippedImages: number; skippedObjects: number };
  /** Skip placeholders (used for layout/master decoration shapes). */
  decorationsOnly: boolean;
}

async function loadImage(ctx: Ctx, rid: string | null): Promise<PptxShape["image"] | null> {
  if (!rid) return null;
  const rel = ctx.rels.get(rid);
  const f = rel ? ctx.zip.file(rel.target) : null;
  if (!rel || !f) return null;
  const ext = rel.target.split(".").pop()?.toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : null;
  if (!mime) {
    ctx.stats.skippedImages++;
    return null;
  }
  return { data: await f.async("uint8array"), mime };
}

function parseParagraphs(txBody: Element | null, ctx: Ctx, defaults: { sizes: (number | undefined)[]; bullets: (string | undefined)[]; isBody: boolean; color?: Color }): PptxParagraph[] {
  if (!txBody) return [];
  const lst = levelSizes(kid(txBody, "lstStyle"));
  const out: PptxParagraph[] = [];
  for (const p of kids(txBody, "p")) {
    const pPr = kid(p, "pPr");
    const level = num(pPr?.getAttribute("lvl"), 0);
    const defaultSize = lst[level] ?? defaults.sizes[level] ?? 18;
    const runs: PptxRun[] = [];
    for (const r of Array.from(p.children)) {
      if (r.localName === "br") {
        runs.push({ text: "\n" });
        continue;
      }
      if (r.localName !== "r" && r.localName !== "fld") continue;
      const rPr = kid(r, "rPr");
      const t = kid(r, "t")?.textContent ?? "";
      runs.push({
        text: rPr?.getAttribute("cap") === "all" ? t.toUpperCase() : t,
        size: rPr?.getAttribute("sz") ? num(rPr.getAttribute("sz")) / 100 : undefined,
        bold: rPr?.getAttribute("b") === "1" || rPr?.getAttribute("b") === "true" || undefined,
        italic: rPr?.getAttribute("i") === "1" || rPr?.getAttribute("i") === "true" || undefined,
        color: colorOf(rPr, ctx.theme) ?? defaults.color,
      });
    }
    let bullet: string | undefined;
    const hasText = runs.some((r) => r.text.trim());
    if (pPr && kid(pPr, "buNone")) bullet = undefined;
    else if (pPr && kid(pPr, "buChar")) bullet = kid(pPr, "buChar")!.getAttribute("char") || "•";
    else if (pPr && kid(pPr, "buAutoNum")) bullet = "#";
    else if (defaults.isBody && hasText) bullet = defaults.bullets[level] ?? ctx.styles.bodyBullets[level] ?? undefined;
    if (bullet === "") bullet = undefined;
    const algn = (pPr?.getAttribute("algn") as PptxParagraph["align"]) || "l";
    out.push({ runs, align: algn, bullet, level, indent: num(pPr?.getAttribute("marL")) / EMU_PER_PT || level * 24, defaultSize });
  }
  // Number auto-numbered paragraphs sequentially.
  let n = 0;
  for (const p of out) {
    if (p.bullet === "#") p.bullet = `${++n}.`;
    else n = 0;
  }
  return out;
}

async function parseTree(tree: Element | null, ctx: Ctx, map: (x: Xfrm) => Xfrm): Promise<PptxShape[]> {
  const shapes: PptxShape[] = [];
  for (const el of Array.from(tree?.children ?? [])) {
    switch (el.localName) {
      case "sp": {
        const ph = phKey(el);
        if (ctx.decorationsOnly && ph) break;
        const spPr = kid(el, "spPr");
        const inherited = ph ? (findPh(ctx.layoutPh, ph)?.info ?? findPh(ctx.masterPh, ph)?.info) : undefined;
        const masterInfo = ph ? findPh(ctx.masterPh, ph)?.info : undefined;
        const x = readXfrm(kid(spPr, "xfrm")) ?? inherited?.xfrm ?? masterInfo?.xfrm;
        if (!x) break;
        const isTitle = !!ph && /title/i.test(ph.type);
        const isBody = !!ph && !isTitle && /body|obj/.test(ph.type);
        const base = isTitle ? ctx.styles.title : ph ? ctx.styles.body : ctx.styles.other;
        const sizes = Array.from({ length: 9 }, (_, i) => inherited?.sizes[i] ?? masterInfo?.sizes[i] ?? base[i] ?? (isTitle ? 44 : 18));
        const txBody = kid(el, "txBody");
        const bodyPr = kid(txBody, "bodyPr");
        const fontColor = colorOf(path(el, "style", "fontRef"), ctx.theme);
        const paragraphs = parseParagraphs(txBody, ctx, {
          sizes,
          bullets: inherited?.bullets ?? masterInfo?.bullets ?? [],
          isBody,
          color: fontColor,
        });
        const fill = colorOf(spPr, ctx.theme) ?? (kid(spPr, "noFill") ? undefined : colorOf(path(el, "style", "fillRef"), ctx.theme));
        const ln = kid(spPr, "ln");
        const line = ln && !kid(ln, "noFill") ? colorOf(ln, ctx.theme) : undefined;
        const geom = kid(spPr, "prstGeom")?.getAttribute("prst");
        if (kid(spPr, "custGeom") || (geom && geom !== "rect" && geom !== "roundRect")) {
          if (!paragraphs.some((p) => p.runs.some((r) => r.text.trim()))) {
            ctx.stats.skippedObjects++;
            break;
          }
        }
        const anchor = (bodyPr?.getAttribute("anchor") as PptxShape["anchor"]) || (isTitle ? "ctr" : "t");
        const fontScale = num(kid(bodyPr, "normAutofit")?.getAttribute("fontScale"), 100000) / 100000;
        shapes.push({
          kind: "text",
          ...map(x),
          fill,
          line,
          paragraphs,
          anchor,
          wrap: bodyPr?.getAttribute("wrap") !== "none",
          fontScale,
          insets: [
            num(bodyPr?.getAttribute("lIns"), 91440) / EMU_PER_PT,
            num(bodyPr?.getAttribute("tIns"), 45720) / EMU_PER_PT,
            num(bodyPr?.getAttribute("rIns"), 91440) / EMU_PER_PT,
            num(bodyPr?.getAttribute("bIns"), 45720) / EMU_PER_PT,
          ],
        });
        break;
      }
      case "pic": {
        if (ctx.decorationsOnly && phKey(el)) break;
        const x = readXfrm(path(el, "spPr", "xfrm"));
        if (!x) break;
        const img = await loadImage(ctx, attrR(desc(kid(el, "blipFill"), "blip"), "embed"));
        if (img) shapes.push({ kind: "image", ...map(x), image: img });
        break;
      }
      case "graphicFrame": {
        const tbl = desc(el, "tbl");
        const x = readXfrm(kid(el, "xfrm"));
        if (!tbl || !x) {
          ctx.stats.skippedObjects++;
          break;
        }
        const cols = kids(kid(tbl, "tblGrid"), "gridCol").map((c) => num(c.getAttribute("w")) / EMU_PER_PT);
        const rows = kids(tbl, "tr").map((tr) => ({
          h: num(tr.getAttribute("h")) / EMU_PER_PT,
          cells: kids(tr, "tc").map((tc) =>
            parseParagraphs(kid(tc, "txBody"), ctx, { sizes: ctx.styles.other.map((s) => s ?? 14), bullets: [], isBody: false }),
          ),
        }));
        const m = map(x);
        const scale = cols.reduce((s, c) => s + c, 0) ? m.w / (x.w || 1) : 1;
        shapes.push({ kind: "table", ...m, table: { cols: cols.map((c) => c * scale), rows: rows.map((r) => ({ ...r, h: r.h * scale })) } });
        break;
      }
      case "grpSp": {
        const xf = path(el, "grpSpPr", "xfrm");
        const off = readXfrm(xf);
        const chOff = kid(xf, "chOff");
        const chExt = kid(xf, "chExt");
        let inner = map;
        if (off && chOff && chExt) {
          const cx = num(chOff.getAttribute("x")) / EMU_PER_PT;
          const cy = num(chOff.getAttribute("y")) / EMU_PER_PT;
          const sx = off.w / (num(chExt.getAttribute("cx")) / EMU_PER_PT || 1);
          const sy = off.h / (num(chExt.getAttribute("cy")) / EMU_PER_PT || 1);
          inner = (c: Xfrm) => map({ x: off.x + (c.x - cx) * sx, y: off.y + (c.y - cy) * sy, w: c.w * sx, h: c.h * sy });
        }
        shapes.push(...(await parseTree(el, ctx, inner)));
        break;
      }
      case "AlternateContent":
      case "contentPart":
        ctx.stats.skippedObjects++;
        break;
    }
  }
  return shapes;
}

async function readBackground(cSld: Element | null, ctx: Ctx): Promise<{ color?: Color; image?: PptxShape["image"] } | null> {
  const bgPr = path(cSld, "bg", "bgPr");
  if (bgPr) {
    const color = colorOf(bgPr, ctx.theme);
    if (color) return { color };
    const blip = desc(kid(bgPr, "blipFill"), "blip");
    if (blip) {
      const image = await loadImage(ctx, attrR(blip, "embed"));
      if (image) return { image };
    }
    return null;
  }
  const bgRef = path(cSld, "bg", "bgRef");
  if (bgRef) {
    const c = colorOf(bgRef, ctx.theme) ?? (() => {
      const s = kid(bgRef, "schemeClr");
      if (!s) return undefined;
      const fake = bgRef.ownerDocument.createElementNS("http://schemas.openxmlformats.org/drawingml/2006/main", "a:solidFill");
      fake.appendChild(s.cloneNode(true));
      return colorOf(fake, ctx.theme);
    })();
    if (c) return { color: c };
  }
  return null;
}

export async function parsePptx(data: ArrayBuffer | Uint8Array): Promise<ParsedPptx> {
  const JSZip = (await import("jszip")).default;
  let zip: JSZipType;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error("This file is not a valid .pptx (it is not a ZIP package). Old binary .ppt files are not supported.");
  }
  const presFile = zip.file("ppt/presentation.xml");
  if (!presFile) throw new Error("This file is not a PowerPoint presentation (ppt/presentation.xml is missing).");
  const pres = parseXml(await presFile.async("string"));
  const sldSz = desc(pres, "sldSz");
  const width = num(sldSz?.getAttribute("cx"), 9144000) / EMU_PER_PT;
  const height = num(sldSz?.getAttribute("cy"), 6858000) / EMU_PER_PT;
  const presRels = await readRels(zip, "ppt/presentation.xml");
  const slidePaths = Array.from(desc(pres, "sldIdLst")?.children ?? [])
    .map((s) => presRels.get(attrR(s, "id") ?? "")?.target)
    .filter((p): p is string => !!p);

  const stats = { skippedImages: 0, skippedObjects: 0 };
  const masterCache = new Map<string, { doc: Document; rels: Rels; theme: Theme; styles: Styles; ph: ReturnType<typeof collectPlaceholders> }>();
  const slides: PptxSlide[] = [];

  for (const [i, slidePath] of slidePaths.entries()) {
    const f = zip.file(slidePath);
    if (!f) continue;
    const slideDoc = parseXml(await f.async("string"));
    const slideRels = await readRels(zip, slidePath);
    const layoutPath = [...slideRels.values()].find((r) => r.type === "slideLayout")?.target;
    let layoutDoc: Document | null = null;
    let layoutRels: Rels = new Map();
    let masterPath: string | undefined;
    if (layoutPath && zip.file(layoutPath)) {
      layoutDoc = parseXml(await zip.file(layoutPath)!.async("string"));
      layoutRels = await readRels(zip, layoutPath);
      masterPath = [...layoutRels.values()].find((r) => r.type === "slideMaster")?.target;
    }
    let master = masterPath ? masterCache.get(masterPath) : undefined;
    if (masterPath && !master && zip.file(masterPath)) {
      const doc = parseXml(await zip.file(masterPath)!.async("string"));
      const rels = await readRels(zip, masterPath);
      const txStyles = desc(doc, "txStyles");
      master = {
        doc,
        rels,
        theme: await readTheme(zip, masterPath, rels),
        styles: {
          title: levelSizes(kid(txStyles, "titleStyle")),
          body: levelSizes(kid(txStyles, "bodyStyle")),
          other: levelSizes(kid(txStyles, "otherStyle")),
          bodyBullets: levelBullets(kid(txStyles, "bodyStyle")),
        },
        ph: collectPlaceholders(desc(doc, "spTree")),
      };
      masterCache.set(masterPath, master);
    }
    const theme = master?.theme ?? new Map();
    const styles: Styles = master?.styles ?? { title: [], body: [], other: [], bodyBullets: [] };
    const layoutPh = collectPlaceholders(desc(layoutDoc, "spTree"));
    const base = { zip, theme, styles, layoutPh, masterPh: master?.ph ?? [], stats };
    const identity = (x: Xfrm) => x;
    const shapes: PptxShape[] = [];
    const slideRoot = slideDoc.documentElement;
    const showMaster = slideRoot.getAttribute("showMasterSp") !== "0";
    const layoutShowMaster = layoutDoc?.documentElement.getAttribute("showMasterSp") !== "0";
    if (showMaster && master && layoutShowMaster)
      shapes.push(...(await parseTree(desc(master.doc, "spTree"), { ...base, rels: master.rels, decorationsOnly: true }, identity)));
    if (showMaster && layoutDoc)
      shapes.push(...(await parseTree(desc(layoutDoc, "spTree"), { ...base, rels: layoutRels, decorationsOnly: true }, identity)));
    const slideCtx: Ctx = { ...base, rels: slideRels, decorationsOnly: false };
    shapes.push(...(await parseTree(desc(slideDoc, "spTree"), slideCtx, identity)));
    const bg =
      (await readBackground(desc(slideDoc, "cSld"), slideCtx)) ??
      (layoutDoc ? await readBackground(desc(layoutDoc, "cSld"), { ...slideCtx, rels: layoutRels }) : null) ??
      (master ? await readBackground(desc(master.doc, "cSld"), { ...slideCtx, rels: master.rels }) : null);
    slides.push({ index: i + 1, shapes, background: bg?.color, backgroundImage: bg?.image });
  }
  if (!slides.length) throw new Error("No slides were found in this presentation.");
  return { width, height, slides, ...stats };
}

/** Draws parsed slides into a PDF, one page per slide at the slide's size. */
export async function pptxToPdf(parsed: ParsedPptx, opts: { slides?: number[] } = {}): Promise<{ bytes: Uint8Array; pages: number; replacedChars: number }> {
  const { PDFDocument, StandardFonts, rgb } = await pdfLib();
  const doc = await PDFDocument.create();
  const fonts = {
    r: await doc.embedFont(StandardFonts.Helvetica),
    b: await doc.embedFont(StandardFonts.HelveticaBold),
    i: await doc.embedFont(StandardFonts.HelveticaOblique),
    bi: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const san = makeSanitizer(new Set(fonts.r.getCharacterSet()));
  const W = parsed.width;
  const H = parsed.height;
  const toRgb = (c: Color): RGB => rgb(c[0], c[1], c[2]);
  const imgCache = new Map<Uint8Array, Awaited<ReturnType<typeof doc.embedPng>>>();
  const embed = async (im: NonNullable<PptxShape["image"]>) => {
    let e = imgCache.get(im.data);
    if (!e) {
      e = im.mime === "image/png" ? await doc.embedPng(im.data) : await doc.embedJpg(im.data);
      imgCache.set(im.data, e);
    }
    return e;
  };

  type Piece = { text: string; font: PDFFont; size: number; color: RGB; advance?: number };
  const adv = (pc: Piece) => pc.advance ?? pc.font.widthOfTextAtSize(pc.text, pc.size);
  const fontFor = (r: PptxRun) => (r.bold && r.italic ? fonts.bi : r.bold ? fonts.b : r.italic ? fonts.i : fonts.r);

  /** Lays out paragraphs into lines inside width; returns line descriptors. */
  const layoutText = (paras: PptxParagraph[], width: number, scale: number, wrap: boolean) => {
    const lines: { pieces: Piece[]; width: number; height: number; ascent: number; align: string; x0: number }[] = [];
    for (const p of paras) {
      const indent = p.bullet ? Math.max(p.indent, p.defaultSize * scale * 1.2) : p.indent;
      const avail = Math.max(10, width - indent);
      const tokens: (Piece & { space: boolean; nl: boolean })[] = [];
      for (const r of p.runs) {
        const size = (r.size ?? p.defaultSize) * scale;
        const font = fontFor(r);
        const color = toRgb(r.color ?? [0, 0, 0]);
        for (const part of san.sanitize(r.text).split(/(\n| +)/)) {
          if (!part) continue;
          tokens.push({ text: part === "\n" ? "" : part, font, size, color, space: /^ +$/.test(part), nl: part === "\n" });
        }
      }
      const pSize = (p.runs.find((r) => r.text.trim())?.size ?? p.defaultSize) * scale;
      let cur: Piece[] = [];
      let w = 0;
      let first = true;
      const push = () => {
        while (cur.length && !cur[cur.length - 1].text.trim()) {
          w -= cur[cur.length - 1].font.widthOfTextAtSize(cur[cur.length - 1].text, cur[cur.length - 1].size);
          cur.pop();
        }
        const size = cur.length ? Math.max(...cur.map((c) => c.size)) : pSize;
        if (first && p.bullet) {
          const bf = fonts.r;
          cur.unshift({ text: san.sanitize(p.bullet), font: bf, size, color: cur[0]?.color ?? rgb(0, 0, 0), advance: size * 1.1 });
        }
        lines.push({
          pieces: cur,
          width: w,
          height: size * 1.2,
          ascent: size * 0.95,
          align: p.align,
          x0: first && p.bullet ? indent - size * 1.1 : indent,
        });
        first = false;
        cur = [];
        w = 0;
      };
      for (const t of tokens) {
        if (t.nl) {
          push();
          continue;
        }
        const tw = t.font.widthOfTextAtSize(t.text, t.size);
        if (wrap && !t.space && w + tw > avail && cur.some((c) => c.text.trim())) push();
        if (t.space && !cur.length) continue;
        cur.push(t);
        w += tw;
      }
      push();
      // Bullet x0 marks the bullet position; text starts at indent.
    }
    return lines;
  };

  const pick = opts.slides?.length ? parsed.slides.filter((s) => opts.slides!.includes(s.index)) : parsed.slides;
  for (const slide of pick) {
    const page: PDFPage = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: toRgb(slide.background ?? [1, 1, 1]) });
    if (slide.backgroundImage) {
      try {
        page.drawImage(await embed(slide.backgroundImage), { x: 0, y: 0, width: W, height: H });
      } catch {
        parsed.skippedImages++;
      }
    }
    for (const s of slide.shapes) {
      const top = H - s.y;
      if (s.kind === "image" && s.image) {
        try {
          page.drawImage(await embed(s.image), { x: s.x, y: top - s.h, width: s.w, height: s.h });
        } catch {
          parsed.skippedImages++;
        }
        continue;
      }
      if (s.kind === "table" && s.table) {
        let y = top;
        for (const row of s.table.rows) {
          let x = s.x;
          const cellLines = row.cells.map((c, ci) => layoutText(c, (s.table!.cols[ci] ?? 50) - 8, 1, true));
          const need = Math.max(row.h, ...cellLines.map((ls) => ls.reduce((t, l) => t + l.height, 0) + 8));
          row.cells.forEach((_, ci) => {
            const cw = s.table!.cols[ci] ?? 50;
            page.drawRectangle({ x, y: y - need, width: cw, height: need, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.6 });
            let ly = y - 4;
            for (const l of cellLines[ci]) {
              let lx = x + 4 + l.x0;
              for (const pc of l.pieces) {
                if (pc.text.trim()) page.drawText(pc.text, { x: lx, y: ly - l.ascent, size: pc.size, font: pc.font, color: pc.color });
                lx += adv(pc);
              }
              ly -= l.height;
            }
            x += cw;
          });
          y -= need;
        }
        continue;
      }
      if (s.fill) page.drawRectangle({ x: s.x, y: top - s.h, width: s.w, height: s.h, color: toRgb(s.fill) });
      if (s.line) page.drawRectangle({ x: s.x, y: top - s.h, width: s.w, height: s.h, borderColor: toRgb(s.line), borderWidth: 0.75 });
      if (!s.paragraphs?.length) continue;
      const [l, t, r, b] = s.insets ?? [7.2, 3.6, 7.2, 3.6];
      const innerW = Math.max(10, s.w - l - r);
      const lines = layoutText(s.paragraphs, innerW, s.fontScale ?? 1, s.wrap !== false);
      const textH = lines.reduce((sum, ln) => sum + ln.height, 0);
      const innerH = s.h - t - b;
      let y = top - t - (s.anchor === "ctr" ? (innerH - textH) / 2 : s.anchor === "b" ? innerH - textH : 0);
      for (const ln of lines) {
        const textW = ln.pieces.reduce((sum, pc) => sum + adv(pc), 0);
        let x = s.x + l + (ln.align === "ctr" ? (innerW - textW) / 2 : ln.align === "r" ? innerW - textW : ln.x0);
        ln.pieces.forEach((pc) => {
          if (pc.text.trim()) page.drawText(pc.text, { x, y: y - ln.ascent, size: pc.size, font: pc.font, color: pc.color });
          x += adv(pc);
        });
        y -= ln.height;
      }
    }
  }
  doc.setCreator("UtilityHub");
  doc.setProducer("UtilityHub");
  return { bytes: await doc.save(), pages: doc.getPageCount(), replacedChars: san.count() };
}
