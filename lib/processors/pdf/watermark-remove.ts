/**
 * Watermark removal for watermarks that are identifiable in the PDF structure:
 *  - /Watermark annotations,
 *  - marked content tagged /Artifact with /Subtype /Watermark (Acrobat, Word, many tools),
 *  - form XObjects marked as watermarks via /PieceInfo /ADBE_CompoundType /Private /Watermark,
 *  - optional content groups (layers) chosen by the user,
 *  - text objects whose shown text contains a user string (single-byte or UTF-16 encodings).
 * Watermarks flattened into images or drawn as plain vector paths cannot be recognised.
 */
import type { PDFDict, PDFPage, PDFRef, PDFStream } from "@cantoo/pdf-lib";
import {
  dictGet,
  parseContentStream,
  removeMarkedContent,
  removeTextObjectsContaining,
  serializeContentStream,
  type CsOperation,
  type CsValue,
} from "./content-stream";
import { lookupDict, nameOf, pageContentBytes, replaceStreamContent, setPageContent, streamBytes } from "./edit-utils";
import { loadPdf, pdfLib, type PdfLib } from "./load";

export interface LayerInfo {
  /** Object reference, e.g. "12 0 R". */
  ref: string;
  name: string;
}

export interface WatermarkAnalysis {
  pages: number;
  layers: LayerInfo[];
  watermarkAnnotations: number;
  artifactWatermarks: number;
  watermarkXObjects: number;
}

export interface RemoveWatermarkOptions {
  password?: string;
  removeAnnotations?: boolean;
  removeArtifacts?: boolean;
  /** Layer refs (from analyze) whose content should be removed. */
  layers?: string[];
  /** Remove text objects containing this text. */
  text?: string;
}

export interface RemoveWatermarkReport {
  annotations: number;
  artifacts: number;
  layerSections: number;
  textObjects: number;
  xobjects: number;
}

function isWatermarkXObject(lib: PdfLib, dict: PDFDict): boolean {
  const piece = lookupDict(lib, dict, "PieceInfo");
  const compound = lookupDict(lib, piece, "ADBE_CompoundType");
  const priv = compound?.lookup(lib.PDFName.of("Private"));
  return nameOf(lib, priv) === "Watermark";
}

function refKey(obj: unknown): string | undefined {
  return obj && typeof obj === "object" && "objectNumber" in obj ? (obj as PDFRef).toString() : undefined;
}

/** Inspects a PDF for removable watermark structures. */
export async function analyzeWatermarks(data: Uint8Array, password?: string): Promise<WatermarkAnalysis> {
  const lib = await pdfLib();
  const doc = await loadPdf(data, { password });
  const layers: LayerInfo[] = [];
  const ocprops = lookupDict(lib, doc.catalog, "OCProperties");
  const ocgs = ocprops?.lookup(lib.PDFName.of("OCGs"));
  if (ocgs instanceof lib.PDFArray) {
    for (let i = 0; i < ocgs.size(); i++) {
      const ref = ocgs.get(i);
      const dict = ocgs.lookup(i);
      if (!(dict instanceof lib.PDFDict)) continue;
      const nameObj = dict.lookup(lib.PDFName.of("Name"));
      const name =
        nameObj instanceof lib.PDFString || nameObj instanceof lib.PDFHexString ? nameObj.decodeText() : `Layer ${i + 1}`;
      layers.push({ ref: refKey(ref) ?? `#${i}`, name });
    }
  }
  let watermarkAnnotations = 0;
  let artifactWatermarks = 0;
  let watermarkXObjects = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (annots)
      for (let i = 0; i < annots.size(); i++) {
        const a = annots.lookup(i);
        if (a instanceof lib.PDFDict && nameOf(lib, a.lookup(lib.PDFName.of("Subtype"))) === "Watermark") watermarkAnnotations++;
      }
    const res = page.node.Resources();
    const xobjs = lookupDict(lib, res, "XObject");
    if (xobjs)
      for (const [, v] of xobjs.entries()) {
        const s = doc.context.lookup(v);
        if (s instanceof lib.PDFStream && isWatermarkXObject(lib, s.dict)) watermarkXObjects++;
      }
    const ops = parseContentStream(pageContentBytes(lib, page));
    for (const o of ops)
      if (o.op === "BDC" && isWatermarkProps(lib, o.operands[1], lookupDict(lib, res, "Properties"))) artifactWatermarks++;
  }
  return { pages: doc.getPageCount(), layers, watermarkAnnotations, artifactWatermarks, watermarkXObjects };
}

function isWatermarkProps(lib: PdfLib, props: CsValue | undefined, properties: PDFDict | undefined): boolean {
  if (!props) return false;
  if (props.t === "dict") {
    const st = dictGet(props, "/Subtype");
    return st?.t === "name" && st.raw === "/Watermark";
  }
  if (props.t === "name" && properties) {
    const d = properties.lookup(lib.PDFName.of(props.raw.slice(1)));
    return d instanceof lib.PDFDict && nameOf(lib, d.lookup(lib.PDFName.of("Subtype"))) === "Watermark";
  }
  return false;
}

/** True when an OC property (OCG or OCMD) references any removed layer. */
function referencesLayer(lib: PdfLib, obj: unknown, removed: Set<string>, context: PDFPage["doc"]["context"]): boolean {
  const key = refKey(obj);
  if (key && removed.has(key)) return true;
  const dict = obj instanceof lib.PDFDict ? obj : key ? context.lookup(obj as PDFRef) : undefined;
  if (!(dict instanceof lib.PDFDict)) return false;
  const ocgs = dict.get(lib.PDFName.of("OCGs"));
  if (!ocgs) return false;
  if (refKey(ocgs) && removed.has(refKey(ocgs)!)) return true;
  const arr = context.lookup(ocgs);
  if (arr instanceof lib.PDFArray) for (let i = 0; i < arr.size(); i++) if (removed.has(refKey(arr.get(i)) ?? "")) return true;
  return false;
}

export async function removeWatermarks(
  data: Uint8Array,
  opts: RemoveWatermarkOptions = {},
): Promise<{ bytes: Uint8Array; report: RemoveWatermarkReport }> {
  const lib = await pdfLib();
  const { PDFName, PDFDict, PDFStream, PDFArray } = lib;
  const doc = await loadPdf(data, { password: opts.password });
  const ctx = doc.context;
  const removeAnn = opts.removeAnnotations ?? true;
  const removeArt = opts.removeArtifacts ?? true;
  const layers = new Set(opts.layers ?? []);
  const text = (opts.text ?? "").trim();
  const report: RemoveWatermarkReport = { annotations: 0, artifacts: 0, layerSections: 0, textObjects: 0, xobjects: 0 };
  const visited = new Set<string>();

  const processOps = (ops: CsOperation[], resources: PDFDict | undefined): { ops: CsOperation[]; changed: boolean } => {
    const properties = lookupDict(lib, resources, "Properties");
    const xobjects = lookupDict(lib, resources, "XObject");
    let changed = false;
    const res = removeMarkedContent(
      ops,
      (tag, props) => {
        if (removeArt && tag === "/Artifact" && isWatermarkProps(lib, props, properties)) {
          report.artifacts++;
          return true;
        }
        if (layers.size && tag === "/OC" && props?.t === "name" && properties) {
          const target = properties.get(PDFName.of(props.raw.slice(1)));
          if (target && referencesLayer(lib, target, layers, ctx)) {
            report.layerSections++;
            return true;
          }
        }
        return false;
      },
      (op) => {
        if (op.op !== "Do" || op.operands[0]?.t !== "name" || !xobjects) return false;
        const ref = xobjects.get(PDFName.of(op.operands[0].raw.slice(1)));
        const xo = ref ? ctx.lookup(ref) : undefined;
        if (!(xo instanceof PDFStream)) return false;
        if (removeArt && isWatermarkXObject(lib, xo.dict)) {
          report.xobjects++;
          return true;
        }
        const oc = xo.dict.get(PDFName.of("OC"));
        if (layers.size && oc && referencesLayer(lib, oc, layers, ctx)) {
          report.xobjects++;
          return true;
        }
        // Recurse into nested form XObjects (watermarks are often drawn inside them).
        const key = refKey(ref);
        if (key && !visited.has(key) && nameOf(lib, xo.dict.lookup(PDFName.of("Subtype"))) === "Form") {
          visited.add(key);
          processForm(ref as PDFRef, xo, resources);
        }
        return false;
      },
    );
    if (res.removed) changed = true;
    let out = res.ops;
    if (text) {
      const t = removeTextObjectsContaining(out, text);
      if (t.removed) {
        report.textObjects += t.removed;
        changed = true;
        out = t.ops;
      }
    }
    return { ops: out, changed };
  };

  const processForm = (ref: PDFRef, xo: PDFStream, parentRes: PDFDict | undefined) => {
    let bytes: Uint8Array;
    try {
      bytes = streamBytes(lib, xo);
    } catch {
      return;
    }
    const own = lookupDict(lib, xo.dict, "Resources") ?? parentRes;
    const r = processOps(parseContentStream(bytes), own);
    if (r.changed) ctx.assign(ref, replaceStreamContent(lib, ctx, xo, serializeContentStream(r.ops)));
  };

  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (annots && (removeAnn || layers.size)) {
      for (let i = annots.size() - 1; i >= 0; i--) {
        const a = annots.lookup(i);
        if (!(a instanceof PDFDict)) continue;
        const isWm = removeAnn && nameOf(lib, a.lookup(PDFName.of("Subtype"))) === "Watermark";
        const oc = a.get(PDFName.of("OC"));
        const inLayer = layers.size > 0 && !!oc && referencesLayer(lib, oc, layers, ctx);
        if (isWm || inLayer) {
          annots.remove(i);
          report.annotations++;
        }
      }
    }
    let bytes: Uint8Array;
    try {
      bytes = pageContentBytes(lib, page);
    } catch {
      continue;
    }
    const r = processOps(parseContentStream(bytes), page.node.Resources());
    if (r.changed) setPageContent(lib, page, serializeContentStream(r.ops));
  }

  // Drop removed layers from the document's layer list.
  if (layers.size) {
    const ocprops = lookupDict(lib, doc.catalog, "OCProperties");
    const prune = (arr: unknown) => {
      if (!(arr instanceof PDFArray)) return;
      for (let i = arr.size() - 1; i >= 0; i--) {
        const item = arr.get(i);
        if (layers.has(refKey(item) ?? "")) arr.remove(i);
        else prune(ctx.lookup(item));
      }
    };
    if (ocprops) {
      prune(ocprops.lookup(PDFName.of("OCGs")));
      const d = lookupDict(lib, ocprops, "D");
      if (d) for (const k of ["ON", "OFF", "Order", "Locked"]) prune(d.lookup(PDFName.of(k)));
    }
  }

  return { bytes: await doc.save({ useObjectStreams: true }), report };
}
