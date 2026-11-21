import type { ComponentType } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { lazyTool } from "./lazy";

/**
 * Processor id → UI component for the "qr" category.
 * Each tool is its own lazily loaded chunk; heavy libraries (qrcode, jsqr,
 * jsbarcode, @zxing/library) are imported inside the tools on demand.
 */
const components: Record<string, ComponentType<ToolComponentProps>> = {
  "qr.generate": lazyTool(() => import("./qr-generator")),
  "qr.logo": lazyTool(() => import("./qr-logo")),
  "qr.scan": lazyTool(() => import("./qr-scanner")),
  "qr.barcode": lazyTool(() => import("./barcode-generator")),
  "qr.barcode-scan": lazyTool(() => import("./barcode-scanner")),
};

export default components;
