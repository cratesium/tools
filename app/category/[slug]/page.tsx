import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ToolGrid } from "@/components/tools/tool-card";
import { CategoryIcon } from "@/components/ui/category-icon";
import { JsonLd } from "@/components/ui/json-ld";
import { categories, getCategory } from "@/lib/tools/categories";
import { getToolsByCategory, toSummary } from "@/lib/tools/registry";
import { buildCategoryMetadata, categoryPath, toolPath } from "@/lib/tools/metadata";
import { absoluteUrl } from "@/lib/seo/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return categories.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/category/[slug]">) {
  const { slug } = await params;
  const cat = getCategory(slug);
  return cat ? buildCategoryMetadata(cat) : {};
}

export default async function CategoryPage({ params }: PageProps<"/category/[slug]">) {
  const { slug } = await params;
  const cat = getCategory(slug);
  if (!cat) notFound();
  const list = getToolsByCategory(cat.slug);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: cat.name,
        description: cat.seoDescription,
        url: absoluteUrl(categoryPath(cat.slug)),
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: list.length,
          itemListElement: list.map((t, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: t.name,
            url: absoluteUrl(toolPath(t.slug)),
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: cat.name, item: absoluteUrl(categoryPath(cat.slug)) },
        ],
      },
    ],
  };
  return (
    <Container className="py-8">
      <JsonLd data={jsonLd} />
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: cat.name }]} />
      <div className="mt-6 flex items-start gap-4">
        <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-fg sm:flex">
          <CategoryIcon category={cat.slug} className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{cat.name}</h1>
          <p className="mt-3 max-w-2xl text-fg-muted">{cat.description}</p>
          <p className="mt-2 text-sm text-fg-subtle">{list.length} tools</p>
        </div>
      </div>
      <div className="mt-10">
        <ToolGrid tools={list.map(toSummary)} />
      </div>
      <nav aria-label="Other categories" className="mt-16 border-t border-border pt-8">
        <h2 className="text-sm font-medium text-fg">Other categories</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {categories
            .filter((c) => c.slug !== cat.slug)
            .map((c) => (
              <li key={c.slug}>
                <Link
                  href={categoryPath(c.slug)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[13px] text-fg-muted hover:border-border-strong hover:text-fg"
                >
                  <CategoryIcon category={c.slug} className="h-3.5 w-3.5" /> {c.shortName}
                </Link>
              </li>
            ))}
        </ul>
      </nav>
    </Container>
  );
}
