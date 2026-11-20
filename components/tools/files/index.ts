import type { ComponentType } from "react";
import type { ToolComponentProps } from "@/types/tool";

/**
 * Processor id → UI component for the "files" category.
 * Loaded lazily by components/tools/tool-runner.tsx only on files tool pages.
 */
const components: Record<string, ComponentType<ToolComponentProps>> = {};

export default components;
