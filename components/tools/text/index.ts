import type { ComponentType } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { lazyTool } from "./lazy";

/**
 * Processor id → UI component for the "text" category.
 * Loaded lazily by components/tools/tool-runner.tsx only on text tool pages.
 * Each component is its own chunk (see ./lazy.ts), so libraries such as marked,
 * DOMPurify, Turndown and jsdiff load only on the tool that needs them.
 */
const components: Record<string, ComponentType<ToolComponentProps>> = {
  "text.word-counter": lazyTool(() => import("./word-counter")),
  "text.case": lazyTool(() => import("./case-converter")),
  "text.whitespace": lazyTool(() => import("./remove-extra-spaces")),
  "text.dedupe": lazyTool(() => import("./dedupe-lines")),
  "text.sort": lazyTool(() => import("./sort-lines")),
  "text.reverse": lazyTool(() => import("./reverse-tool")),
  "text.repeat": lazyTool(() => import("./text-repeater")),
  "text.diff": lazyTool(() => import("./text-diff")),
  "text.slug": lazyTool(() => import("./slug-tool")),
  "text.lorem": lazyTool(() => import("./lorem-ipsum")),
  "text.markdown-editor": lazyTool(() => import("./markdown-editor")),
  "text.markdown-to-html": lazyTool(() => import("./markdown-to-html")),
  "text.html-to-markdown": lazyTool(() => import("./html-to-markdown")),
  "text.encoder": lazyTool(() => import("./text-encoder")),
};

export default components;
