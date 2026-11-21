import type { ComponentType } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { lazyTool } from "./lazy";

/**
 * Processor id → UI component for the "developer" category.
 * Loaded lazily by components/tools/tool-runner.tsx only on developer tool pages.
 * Every component is a separate chunk (see ./lazy.ts), so heavy formatters only load
 * on the page that uses them.
 */
const components: Record<string, ComponentType<ToolComponentProps>> = {
  "developer.json": lazyTool(() => import("./json-tool")),
  "developer.convert": lazyTool(() => import("./convert-tool")),
  "developer.xml": lazyTool(() => import("./xml-tool")),
  "developer.yaml": lazyTool(() => import("./yaml-tool")),
  "developer.code-format": lazyTool(() => import("./code-format-tool")),
  "developer.minify": lazyTool(() => import("./minify-tool")),
  "developer.sql-format": lazyTool(() => import("./sql-formatter")),
  "developer.sql-validate": lazyTool(() => import("./sql-validator")),
  "developer.base64": lazyTool(() => import("./base64-tool")),
  "developer.url": lazyTool(() => import("./url-tool")),
  "developer.entities": lazyTool(() => import("./entities-tool")),
  "developer.jwt-decode": lazyTool(() => import("./jwt-decoder")),
  "developer.jwt-generate": lazyTool(() => import("./jwt-generator")),
  "developer.uuid": lazyTool(() => import("./uuid-generator")),
  "developer.regex-test": lazyTool(() => import("./regex-tester")),
  "developer.regex-generate": lazyTool(() => import("./regex-generator")),
  "developer.timestamp": lazyTool(() => import("./timestamp-tool")),
  "developer.color": lazyTool(() => import("./color-converter")),
  "developer.gradient": lazyTool(() => import("./gradient-generator")),
  "developer.hash": lazyTool(() => import("./hash-generator")),
  "developer.html-preview": lazyTool(() => import("./html-preview")),
};

export default components;
