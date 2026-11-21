import type { ComponentType } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { lazyTool } from "../lazy";

/** Processor id → UI component for the "video" category (each a separate chunk). */
const components: Record<string, ComponentType<ToolComponentProps>> = {
  "video.convert": lazyTool(() => import("./convert")),
};

export default components;
