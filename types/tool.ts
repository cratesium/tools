/**
 * Core type definitions for the UtilityHub tool catalogue.
 * The registry (lib/tools/registry.ts) is the single source of truth for
 * every page, listing, search result and sitemap entry.
 */

export type CategorySlug =
  | "pdf"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "text"
  | "developer"
  | "data"
  | "security"
  | "qr"
  | "calculators"
  | "files"
  | "web";

/**
 * full     – works end-to-end in the browser (or with the bundled Cloudflare function) with no caveats.
 * partial  – works, but with documented limitations (e.g. layout not preserved, heuristic extraction).
 * api      – needs a server-side Cloudflare Pages Function, binding, or third-party service to run.
 * planned  – registered and documented but not yet implemented. The page says so honestly.
 */
export type ImplementationStatus = "full" | "partial" | "api" | "planned";

export interface FAQ {
  q: string;
  a: string;
}

export interface ToolDefinition {
  /** Catalogue number, 1–304. Never reused. */
  id: number;
  name: string;
  /** URL slug: /tools/{slug}. Globally unique, lowercase, hyphenated. */
  slug: string;
  category: CategorySlug;
  /** One sentence, shown on cards. ~80–140 chars. */
  shortDescription: string;
  /** 2–4 sentences of tool-specific explanation shown on the tool page. */
  description: string;
  /** Human-readable formats, e.g. ["PDF"], ["Text"], ["JPG", "PNG"]. */
  inputFormats: string[];
  outputFormats: string[];
  /**
   * Processor identifier: "<category>.<operation>". Must map to a UI component
   * registered in components/tools/<category>/index.ts. Several tools may share
   * one processor component and differ only by processorOptions.
   */
  processor: string;
  processorOptions?: Record<string, string | number | boolean | string[]>;
  /** <title>, max ~60 chars. Unique. */
  seoTitle: string;
  /** Meta description, ~120–160 chars. Unique. */
  seoDescription: string;
  /** 3–6 imperative steps. */
  instructions: string[];
  /** 3–5 tool-specific FAQs. */
  faqs: FAQ[];
  /** Slugs of related tools (3–6). Must exist in the registry. */
  related: string[];
  status: ImplementationStatus;
  /** Required when status is partial/api/planned: what is limited or needed. */
  statusNote?: string;
  /** External services this tool relies on at runtime (shown on the page). */
  dependencies?: string[];
  /** Extra search terms. */
  keywords?: string[];
  popular?: boolean;
  featured?: boolean;
  /** ISO date the tool was added; used for "Recently added". */
  addedAt?: string;
}

export interface CategoryDefinition {
  slug: CategorySlug;
  name: string;
  shortName: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  /** lucide-react icon name, resolved in components/ui/icons.tsx */
  icon: string;
  /** Inclusive id range in the catalogue. */
  range: [number, number];
}

/** Minimal shape passed to the browser for search and listings. */
export interface ToolSummary {
  id: number;
  name: string;
  slug: string;
  category: CategorySlug;
  shortDescription: string;
  status: ImplementationStatus;
  keywords?: string[];
}

/** Props every tool UI component receives. */
export interface ToolComponentProps {
  tool: Pick<
    ToolDefinition,
    "id" | "name" | "slug" | "category" | "processor" | "processorOptions" | "inputFormats" | "outputFormats" | "status"
  >;
}
