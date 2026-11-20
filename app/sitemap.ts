import type { MetadataRoute } from "next";
import { tools } from "@/lib/tools/registry";
import { categories } from "@/lib/tools/categories";
import { absoluteUrl } from "@/lib/seo/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/tools"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    ...categories.map((c) => ({
      url: absoluteUrl(`/category/${c.slug}`),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...tools
      .filter((t) => t.status !== "planned")
      .map((t) => ({
        url: absoluteUrl(`/tools/${t.slug}`),
        lastModified: now,
        changeFrequency: "monthly" as const,
        priority: t.popular ? 0.8 : 0.7,
      })),
    ...["/about", "/contact", "/privacy", "/terms"].map((p) => ({
      url: absoluteUrl(p),
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
