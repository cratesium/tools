import type { ComponentType } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { lazyTool } from "../lazy";

/** Processor id → UI component for the "archive" category (each a separate chunk). */
const components: Record<string, ComponentType<ToolComponentProps>> = {
  "archive.extract": lazyTool(() => import("./extractor")),
  "archive.zip-create": lazyTool(() => import("./zip-creator")),
  "archive.compress": lazyTool(() => import("./compressor")),
  "archive.convert": lazyTool(() => import("./converter")),
  "archive.password": lazyTool(() => import("../security/password-generator")),
  "archive.remove-password": lazyTool(() => import("./password-remover")),
  "archive.compare": lazyTool(() => import("./compare")),
  "archive.test": lazyTool(() => import("./integrity")),
};

export default components;
