import type { ComponentType } from "react";
import type { CategorySlug, ToolComponentProps } from "@/types/tool";

export type ComponentMap = Record<string, ComponentType<ToolComponentProps>>;

/**
 * One dynamic import per category: a tool page only downloads its own category's
 * UI code, and heavy processing libraries are imported lazily inside each tool.
 */
export const categoryLoaders: Record<CategorySlug, () => Promise<{ default: ComponentMap }>> = {
  pdf: () => import("./pdf"),
  image: () => import("./image"),
  video: () => import("./video"),
  audio: () => import("./audio"),
  archive: () => import("./archive"),
  text: () => import("./text"),
  developer: () => import("./developer"),
  data: () => import("./data"),
  security: () => import("./security"),
  qr: () => import("./qr"),
  calculators: () => import("./calculators"),
  files: () => import("./files"),
  web: () => import("./web"),
};
