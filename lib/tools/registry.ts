import type { CategorySlug, ToolDefinition, ToolSummary } from "@/types/tool";
import { categories } from "./categories";
import { pdfTools } from "./data/pdf";
import { imageTools } from "./data/image";
import { videoTools } from "./data/video";
import { audioTools } from "./data/audio";
import { archiveTools } from "./data/archive";
import { textTools } from "./data/text";
import { developerTools } from "./data/developer";
import { dataTools } from "./data/data";
import { securityTools } from "./data/security";
import { qrTools } from "./data/qr";
import { calculatorsTools } from "./data/calculators";
import { filesTools } from "./data/files";
import { webTools } from "./data/web";

/**
 * Central registry of all 304 tools. Server-side only: this module carries every
 * description and FAQ, so client components should receive ToolSummary objects
 * (see toSummary / getSearchIndex) instead of importing it.
 */
export const tools: ToolDefinition[] = [
  ...pdfTools,
  ...imageTools,
  ...videoTools,
  ...audioTools,
  ...archiveTools,
  ...textTools,
  ...developerTools,
  ...dataTools,
  ...securityTools,
  ...qrTools,
  ...calculatorsTools,
  ...filesTools,
  ...webTools,
].sort((a, b) => a.id - b.id);

const bySlug = new Map(tools.map((t) => [t.slug, t]));

export function getTool(slug: string): ToolDefinition | undefined {
  return bySlug.get(slug);
}

export function getToolsByCategory(category: CategorySlug): ToolDefinition[] {
  return tools.filter((t) => t.category === category);
}

export function toSummary(t: ToolDefinition): ToolSummary {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    category: t.category,
    shortDescription: t.shortDescription,
    status: t.status,
    ...(t.keywords?.length ? { keywords: t.keywords } : {}),
  };
}

export function getSearchIndex(): ToolSummary[] {
  return tools.map(toSummary);
}

/** Related tools: explicit `related` first, then same-category neighbours. */
export function getRelatedTools(tool: ToolDefinition, limit = 6): ToolDefinition[] {
  const out: ToolDefinition[] = [];
  const seen = new Set([tool.slug]);
  for (const s of tool.related) {
    const t = bySlug.get(s);
    if (t && !seen.has(s)) {
      out.push(t);
      seen.add(s);
    }
  }
  if (out.length < limit) {
    const siblings = getToolsByCategory(tool.category);
    const idx = siblings.findIndex((t) => t.slug === tool.slug);
    const ordered = [...siblings.slice(idx + 1), ...siblings.slice(0, idx)];
    for (const t of ordered) {
      if (out.length >= limit) break;
      if (!seen.has(t.slug)) {
        out.push(t);
        seen.add(t.slug);
      }
    }
  }
  return out.slice(0, limit);
}

export function getPopularTools(limit = 12): ToolDefinition[] {
  const flagged = tools.filter((t) => t.popular);
  return flagged.slice(0, limit);
}

export function getFeaturedTools(limit = 6): ToolDefinition[] {
  return tools.filter((t) => t.featured).slice(0, limit);
}

export function getRecentTools(limit = 8): ToolDefinition[] {
  return [...tools]
    .filter((t) => t.addedAt && t.status !== "planned")
    .sort((a, b) => (b.addedAt! > a.addedAt! ? 1 : b.addedAt! < a.addedAt! ? -1 : b.id - a.id))
    .slice(0, limit);
}

export function getStatusCounts() {
  const counts = { full: 0, partial: 0, api: 0, planned: 0 };
  for (const t of tools) counts[t.status]++;
  return counts;
}

export function getCategoryCounts(): Record<CategorySlug, number> {
  const counts = Object.fromEntries(categories.map((c) => [c.slug, 0])) as Record<CategorySlug, number>;
  for (const t of tools) counts[t.category]++;
  return counts;
}
