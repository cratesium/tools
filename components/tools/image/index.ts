import type { ComponentType } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { lazyTool } from "../lazy";

/** Processor id → UI component for the "image" category (each a separate chunk). */
const components: Record<string, ComponentType<ToolComponentProps>> = {
  "image.compress": lazyTool(() => import("./compressor")),
  "image.resize": lazyTool(() => import("./resizer")),
  "image.crop": lazyTool(() => import("./cropper")),
  "image.rotate": lazyTool(() => import("./rotator")),
  "image.flip": lazyTool(() => import("./flipper")),
  "image.convert": lazyTool(() => import("./converter")),
  "image.trace": lazyTool(() => import("./tracer")),
  "image.background": lazyTool(() => import("./background")),
  "image.watermark": lazyTool(() => import("./watermark")),
  "image.inpaint": lazyTool(() => import("./inpaint")),
  "image.filter": lazyTool(() => import("./filter")),
  "image.adjust": lazyTool(() => import("./adjust")),
  "image.grayscale": lazyTool(() => import("./grayscale")),
  "image.metadata-remove": lazyTool(() => import("./metadata-remover")),
  "image.metadata-view": lazyTool(() => import("./metadata-viewer")),
  "image.base64": lazyTool(() => import("./base64")),
};

export default components;
