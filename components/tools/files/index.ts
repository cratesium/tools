import type { ComponentType } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { lazyTool } from "../lazy";

/** Processor id → UI component for the "files" category (each a separate chunk). */
const components: Record<string, ComponentType<ToolComponentProps>> = {
  "files.rename": lazyTool(() => import("./renamer")),
  "files.bulk-rename": lazyTool(() => import("./bulk-renamer")),
  "files.size": lazyTool(() => import("./size-checker")),
  "files.type": lazyTool(() => import("./type-checker")),
  "files.extension": lazyTool(() => import("./extension-changer")),
  "files.metadata": lazyTool(() => import("./metadata-viewer")),
  "files.metadata-remove": lazyTool(() => import("./metadata-remover")),
  "files.hash": lazyTool(() => import("./hash-checker")),
  "files.duplicates": lazyTool(() => import("./duplicate-finder")),
  "files.folder-size": lazyTool(() => import("./folder-size")),
  "files.compare": lazyTool(() => import("./file-compare")),
  "files.folder-compare": lazyTool(() => import("./folder-compare")),
  "files.merge": lazyTool(() => import("./merger")),
  "files.split": lazyTool(() => import("./splitter")),
  "files.list": lazyTool(() => import("./list-generator")),
  "files.names": lazyTool(() => import("./name-extractor")),
  "files.organize": lazyTool(() => import("./organizer")),
};

export default components;
