import type { Metadata } from "next";
import type { CategoryDefinition, ToolDefinition } from "@/types/tool";
import { SITE_NAME, absoluteUrl } from "@/lib/seo/site";
import { categoryMap } from "./categories";

export function toolPath(slug: string) {
  return `/tools/${slug}`;
}
export function categoryPath(slug: string) {
  return `/category/${slug}`;
}

export function buildToolMetadata(tool: ToolDefinition): Metadata {
  const url = absoluteUrl(toolPath(tool.slug));
  return {
    title: { absolute: tool.seoTitle },
    description: tool.seoDescription,
    keywords: [tool.name, ...(tool.keywords ?? []), ...tool.inputFormats, ...tool.outputFormats],
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: tool.seoTitle,
      description: tool.seoDescription,
      siteName: SITE_NAME,
    },
    twitter: { card: "summary_large_image", title: tool.seoTitle, description: tool.seoDescription },
    robots: tool.status === "planned" ? { index: false, follow: true } : undefined,
  };
}

export function buildCategoryMetadata(cat: CategoryDefinition): Metadata {
  const url = absoluteUrl(categoryPath(cat.slug));
  return {
    title: { absolute: cat.seoTitle },
    description: cat.seoDescription,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title: cat.seoTitle, description: cat.seoDescription, siteName: SITE_NAME },
    twitter: { card: "summary_large_image", title: cat.seoTitle, description: cat.seoDescription },
  };
}

/** JSON-LD graph for a tool page: WebApplication + BreadcrumbList + FAQPage. */
export function toolJsonLd(tool: ToolDefinition) {
  const url = absoluteUrl(toolPath(tool.slug));
  const cat = categoryMap[tool.category];
  const graph: Record<string, unknown>[] = [
    {
      "@type": "WebApplication",
      "@id": `${url}#app`,
      name: tool.name,
      url,
      description: tool.seoDescription,
      applicationCategory: tool.category === "developer" ? "DeveloperApplication" : "UtilitiesApplication",
      operatingSystem: "Any (web browser)",
      browserRequirements: "Requires JavaScript and a modern browser",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
        { "@type": "ListItem", position: 2, name: cat.name, item: absoluteUrl(categoryPath(cat.slug)) },
        { "@type": "ListItem", position: 3, name: tool.name, item: url },
      ],
    },
  ];
  if (tool.faqs.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: tool.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}
