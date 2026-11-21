import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Lock, Zap, Globe2 } from "lucide-react";
import { Container } from "@/components/layout/container";
import { InlineSearch } from "@/components/search/command-search";
import { ToolGrid } from "@/components/tools/tool-card";
import { CategoryIcon } from "@/components/ui/category-icon";
import { JsonLd } from "@/components/ui/json-ld";
import { categories } from "@/lib/tools/categories";
import {
  getCategoryCounts,
  getFeaturedTools,
  getPopularTools,
  getRecentTools,
  tools,
  toSummary,
} from "@/lib/tools/registry";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  alternates: { canonical: absoluteUrl("/") },
};

export default function Home() {
  const counts = getCategoryCounts();
  const fallback = tools.filter((t) => t.status !== "planned");
  const popularTools = getPopularTools(12);
  const popular = (popularTools.length ? popularTools : fallback.slice(0, 12)).map(toSummary);
  const shown = new Set(popular.map((t) => t.slug));
  const featured = getFeaturedTools(20).filter((t) => !shown.has(t.slug)).slice(0, 6).map(toSummary);
  featured.forEach((t) => shown.add(t.slug));
  const recent = getRecentTools(40).filter((t) => !shown.has(t.slug)).slice(0, 8).map(toSummary);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${absoluteUrl("/tools")}?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <section className="border-b border-border">
        <Container className="flex flex-col items-center py-16 text-center sm:py-24">
          <p className="rounded-full border border-border bg-card px-3 py-1 text-xs text-fg-muted shadow-xs">
            {tools.length} tools · 13 categories · no sign-up
          </p>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-balance text-fg sm:text-6xl">
            Every everyday tool, in your browser.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-pretty text-fg-muted sm:text-lg">
            Convert, compress and edit PDFs, images, video and audio. Format code, crunch numbers and inspect websites. Files stay on your device.
          </p>
          <div className="mt-8 w-full max-w-xl">
            <InlineSearch />
          </div>
          <div className="mt-5 flex flex-wrap justify-center gap-2 text-[13px]">
            {["merge-pdf", "image-compressor", "json-formatter", "video-to-gif", "qr-code-generator", "word-counter"].map((s) => {
              const t = tools.find((x) => x.slug === s);
              return t ? (
                <Link key={s} href={`/tools/${s}`} className="rounded-full border border-border px-3 py-1 text-fg-muted hover:border-border-strong hover:text-fg">
                  {t.name}
                </Link>
              ) : null;
            })}
          </div>
        </Container>
      </section>

      <Container className="py-16">
        <SectionHeader title="Popular tools" href="/tools" />
        <ToolGrid tools={popular} />
      </Container>

      <section id="categories" className="scroll-mt-16 border-y border-border bg-bg-subtle">
        <Container className="py-16">
          <SectionHeader title="Browse by category" />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/category/${c.slug}`}
                  className="group flex h-full gap-4 rounded-xl border border-border bg-card p-5 transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-card"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-bg-subtle text-fg">
                    <CategoryIcon category={c.slug} className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-[15px] font-medium text-fg">
                      {c.name}
                      <span className="font-mono text-xs font-normal text-fg-subtle">{counts[c.slug]}</span>
                    </span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-fg-muted">{c.description}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {featured.length ? (
        <Container className="py-16">
          <SectionHeader title="Featured" />
          <ToolGrid tools={featured} />
        </Container>
      ) : null}

      {recent.length ? (
        <Container className="pb-16">
          <SectionHeader title="Recently added" />
          <ToolGrid tools={recent} />
        </Container>
      ) : null}

      <section className="border-t border-border">
        <Container className="grid gap-10 py-16 md:grid-cols-3">
          {[
            { icon: Lock, title: "Private by default", body: "PDF, image, video, audio, archive and data tools process files locally with WebAssembly, Web Workers and the Canvas API. Nothing is uploaded." },
            { icon: Zap, title: "Fast and free", body: "Every page is statically generated and served from Cloudflare's edge. Heavy engines like FFmpeg load only when a tool needs them." },
            { icon: Globe2, title: "Honest about limits", body: "Tools that need a server, such as DNS-over-HTTP checks or website screenshots, are clearly labelled, and so are conversions that cannot preserve layout." },
          ].map((f) => (
            <div key={f.title}>
              <f.icon className="h-5 w-5 text-fg" aria-hidden strokeWidth={1.75} />
              <h2 className="mt-4 text-[15px] font-medium text-fg">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{f.body}</p>
            </div>
          ))}
        </Container>
      </section>

      <Container className="pb-4">
        <div className="prose-uh max-w-3xl">
          <h2>Free online tools that respect your privacy</h2>
          <p>
            UtilityHub brings together {tools.length} single-purpose utilities that would otherwise need a dozen different apps. Merge or split a PDF, compress a photo
            for email, trim a video, convert an audio file, open a RAR archive, format a JSON payload, generate a QR code for your Wi-Fi network or work out an
            EMI – each tool has its own page with clear instructions, supported formats and answers to common questions.
          </p>
          <p>
            Most tools run entirely in your browser. When you drop a file onto a tool, it is read into memory on your own device and processed there with
            open-source engines such as pdf-lib, PDF.js, FFmpeg.wasm, SheetJS and the Web Crypto API. The result is generated locally and offered as a download.
            Close the tab and it is gone.
          </p>
        </div>
      </Container>
    </>
  );
}

function SectionHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="mb-6 flex items-end justify-between">
      <h2 className="text-xl font-semibold tracking-tight text-fg">{title}</h2>
      {href ? (
        <Link href={href} className="flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
          View all <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
