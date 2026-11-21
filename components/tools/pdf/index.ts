import type { ComponentType } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { lazyTool } from "../lazy";

/** Processor id → UI component for the "pdf" category (each a separate chunk). */
const components: Record<string, ComponentType<ToolComponentProps>> = {
  "pdf.merge": lazyTool(() => import("./merge")),
  "pdf.split": lazyTool(() => import("./split")),
  "pdf.compress": lazyTool(() => import("./compress")),
  "pdf.rotate": lazyTool(() => import("./rotate")),
  "pdf.pages": lazyTool(() => import("./pages")),
  "pdf.protect": lazyTool(() => import("./protect")),
  "pdf.unlock": lazyTool(() => import("./unlock")),
  "pdf.watermark": lazyTool(() => import("./watermark")),
  "pdf.watermark-remove": lazyTool(() => import("./watermark-remove")),
  "pdf.page-text": lazyTool(() => import("./page-text")),
  "pdf.crop": lazyTool(() => import("./crop")),
  "pdf.editor": lazyTool(() => import("./editor")),
  "pdf.forms": lazyTool(() => import("./forms")),
  "pdf.flatten": lazyTool(() => import("./flatten")),
  "pdf.repair": lazyTool(() => import("./repair")),
  "pdf.ocr": lazyTool(() => import("./ocr")),
  "pdf.search": lazyTool(() => import("./search")),
  "pdf.compare": lazyTool(() => import("./compare")),
  "pdf.extract-images": lazyTool(() => import("./extract-images")),
  "pdf.extract-text": lazyTool(() => import("./extract-text")),
  "pdf.tables": lazyTool(() => import("./tables")),
  "pdf.metadata": lazyTool(() => import("./metadata")),
  "pdf.to-html": lazyTool(() => import("./to-html")),
  "pdf.html-to-pdf": lazyTool(() => import("./html-to-pdf")),
  "pdf.epub": lazyTool(() => import("./epub")),
  "pdf.to-word": lazyTool(() => import("./to-word")),
  "pdf.excel-to-pdf": lazyTool(() => import("./excel-to-pdf")),
  "pdf.pptx": lazyTool(() => import("./pptx")),
  "pdf.to-image": lazyTool(() => import("./to-image")),
  "pdf.from-images": lazyTool(() => import("./from-images")),
};

export default components;
