import { createElement, lazy, Suspense, type ComponentType } from "react";
import type { ToolComponentProps } from "@/types/tool";

/**
 * Wraps a dynamically imported tool component so each tool UI (and the libraries it
 * imports) is its own chunk. The category index stays tiny; only the visited tool's
 * code is downloaded. A Suspense boundary is included because ToolRunner has none.
 */
export function lazyTool(load: () => Promise<{ default: ComponentType<ToolComponentProps> }>): ComponentType<ToolComponentProps> {
  const Lazy = lazy(load);
  function LazyTool(props: ToolComponentProps) {
    return createElement(
      Suspense,
      { fallback: createElement("div", { className: "min-h-[240px] text-sm text-fg-subtle", "aria-busy": true }, "Loading…") },
      createElement(Lazy, props),
    );
  }
  return LazyTool;
}
