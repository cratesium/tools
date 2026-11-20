import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ToolsExplorer } from "@/components/search/tools-explorer";
import { getCategoryCounts, getSearchIndex } from "@/lib/tools/registry";
import { categories } from "@/lib/tools/categories";
import { absoluteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "All 304 Online Tools",
  description:
    "Browse and search every UtilityHub tool: PDF, image, video, audio, archive, text, developer, data, security, QR code, calculator, file and web utilities.",
  alternates: { canonical: absoluteUrl("/tools") },
};

export default function ToolsPage() {
  const counts = getCategoryCounts();
  return (
    <Container className="py-8">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "All tools" }]} />
      <h1 className="mt-5 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">All tools</h1>
      <p className="mt-3 max-w-2xl text-fg-muted">
        Every tool in the UtilityHub catalogue, searchable by name, file format or task.
      </p>
      <div className="mt-8">
        <ToolsExplorer
          tools={getSearchIndex()}
          categories={categories.map((c) => ({ slug: c.slug, name: c.shortName, count: counts[c.slug] }))}
        />
      </div>
    </Container>
  );
}
