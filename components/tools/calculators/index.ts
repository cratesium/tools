import type { ComponentType } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { lazyTool } from "./lazy";

/**
 * Processor id → UI component for the "calculators" category.
 * Loaded lazily by components/tools/tool-runner.tsx only on calculator pages; each tool
 * UI is its own chunk via lazyTool.
 */
const components: Record<string, ComponentType<ToolComponentProps>> = {
  "calculators.percentage": lazyTool(() => import("./percentage")),
  "calculators.percentage-change": lazyTool(() => import("./percentage-change")),
  "calculators.discount": lazyTool(() => import("./discount")),
  "calculators.gst": lazyTool(() => import("./gst")),
  "calculators.income-tax": lazyTool(() => import("./income-tax")),
  "calculators.loan": lazyTool(() => import("./loan")),
  "calculators.interest": lazyTool(() => import("./interest")),
  "calculators.dates": lazyTool(() => import("./dates")),
  "calculators.time": lazyTool(() => import("./time-calc")),
  "calculators.time-zone": lazyTool(() => import("./time-zone")),
  "calculators.units": lazyTool(() => import("./unit-converter")),
  "calculators.health": lazyTool(() => import("./health")),
};

export default components;
