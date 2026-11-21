import type { ComponentType } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { lazyTool } from "../lazy";

/** Processor id → UI component for the "web" category (each a separate chunk). */
const components: Record<string, ComponentType<ToolComponentProps>> = {
  "web.shorten": lazyTool(() => import("./url-shortener")),
  "web.expand": lazyTool(() => import("./url-expander")),
  "web.screenshot": lazyTool(() => import("./screenshot")),
  "web.status": lazyTool(() => import("./status-checker")),
  "web.headers": lazyTool(() => import("./header-checker")),
  "web.dns": lazyTool(() => import("./dns-lookup")),
  "web.whois": lazyTool(() => import("./whois")),
  "web.ip": lazyTool(() => import("./ip-lookup")),
  "web.myip": lazyTool(() => import("./my-ip")),
  "web.user-agent": lazyTool(() => import("./user-agent")),
  "web.meta": lazyTool(() => import("./meta-analyzer")),
  "web.og": lazyTool(() => import("./og-preview")),
  "web.robots": lazyTool(() => import("./robots-generator")),
  "web.sitemap": lazyTool(() => import("./sitemap-generator")),
  "web.word-count": lazyTool(() => import("./word-counter")),
  "web.html-viewer": lazyTool(() => import("./html-viewer")),
  "web.links": lazyTool(() => import("./link-extractor")),
  "web.broken-links": lazyTool(() => import("./broken-links")),
  "web.ssl": lazyTool(() => import("./ssl-checker")),
};

export default components;
