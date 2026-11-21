import type { ComponentType } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { lazyTool } from "./lazy";

/**
 * Processor id → UI component for the "data" category. Each tool is its own chunk;
 * SheetJS is imported on demand inside the tools.
 */
const components: Record<string, ComponentType<ToolComponentProps>> = {
  "data.convert": lazyTool(() => import("./convert")),
  "data.csv-viewer": lazyTool(() => import("./csv-viewer")),
  "data.csv-editor": lazyTool(() => import("./csv-editor")),
  "data.csv-merger": lazyTool(() => import("./csv-merger")),
  "data.csv-splitter": lazyTool(() => import("./csv-splitter")),
  "data.excel-viewer": lazyTool(() => import("./excel-viewer")),
  "data.excel-merger": lazyTool(() => import("./excel-merger")),
  "data.excel-splitter": lazyTool(() => import("./excel-splitter")),
  "data.excel-sheets": lazyTool(() => import("./excel-sheet-extractor")),
  "data.dedupe": lazyTool(() => import("./data-dedupe")),
  "data.sort": lazyTool(() => import("./data-sorter")),
  "data.filter": lazyTool(() => import("./data-filter")),
};

export default components;
