import type { ComponentType } from "react";
import type { ToolComponentProps } from "@/types/tool";

/**
 * Processor id → UI component for the "image" category.
 * Loaded lazily by components/tools/tool-runner.tsx only on image tool pages.
 */
const components: Record<string, ComponentType<ToolComponentProps>> = {};

export default components;
