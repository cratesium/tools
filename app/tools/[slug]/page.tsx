import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck, Server, Cloud } from "lucide-react";
import { tools, getTool, getRelatedTools, toSummary } from "@/lib/tools/registry";
import { categoryMap } from "@/lib/tools/categories";
import { buildToolMetadata, categoryPath, toolJsonLd } from "@/lib/tools/metadata";
import { Container } from "@/components/layout/container";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ToolRunner } from "@/components/tools/tool-runner";
import { ToolGrid } from "@/components/tools/tool-card";
import { Alert, Badge } from "@/components/ui/feedback";
import { JsonLd } from "@/components/ui/json-ld";
import type { ToolDefinition } from "@/types/tool";

export const dynamicParams = false;

export function generateStaticParams() {
  return tools.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: PageProps<"/tools/[slug]">) {
  const { slug } = await params;
  const tool = getTool(slug);
  return tool ? buildToolMetadata(tool) : {};
}

function privacyCopy(tool: ToolDefinition): { icon: typeof ShieldCheck; title: string; body: string } {
  if (tool.status === "api")
    return {
      icon: Server,
      title: "What is sent to a server",
      body:
        tool.category === "web"
          ? `${tool.name} needs a server-side request, so the URL or domain you enter is sent to UtilityHub's Cloudflare function${tool.dependencies?.length ? ` and to ${tool.dependencies.join(", ")}` : ""}. Nothing is logged or stored by UtilityHub beyond what the operation requires.`
          : `${tool.name} relies on ${tool.dependencies?.join(", ") || "an external service"}. Only the data needed for the operation is sent, and UtilityHub does not store it.`,
    };
  if (tool.dependencies?.length)
    return {
      icon: Cloud,
      title: "Private by design",
      body: `Your data is processed locally in your browser. ${tool.name} downloads its processing engine (${tool.dependencies.join(", ")}) the first time you use it, but your files and text never leave your device.`,
    };
  return {
    icon: ShieldCheck,
    title: "Private by design",
    body: `${tool.name} runs entirely in your browser. Your ${tool.inputFormats.length ? tool.inputFormats.slice(0, 3).join(", ") : "data"} ${tool.inputFormats.length === 1 ? "is" : "are"} never uploaded, stored or shared, and everything is cleared when you reset or close the tab.`,
  };
}

export default async function ToolPage({ params }: PageProps<"/tools/[slug]">) {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) notFound();
  const cat = categoryMap[tool.category];
  const related = getRelatedTools(tool).map(toSummary);
  const privacy = privacyCopy(tool);
  const PrivacyIcon = privacy.icon;
  const runnerTool = {
    id: tool.id,
    name: tool.name,
    slug: tool.slug,
    category: tool.category,
    processor: tool.processor,
    processorOptions: tool.processorOptions,
    inputFormats: tool.inputFormats,
    outputFormats: tool.outputFormats,
    status: tool.status,
  };

  return (
    <>
      <JsonLd data={toolJsonLd(tool)} />
      <Container className="pt-6 pb-4 sm:pt-8">
        <Breadcrumbs
          items={[
            { name: "Home", href: "/" },
            { name: cat.name, href: categoryPath(cat.slug) },
            { name: tool.name },
          ]}
        />
        <div className="mt-5 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{tool.name}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-muted sm:text-base">{tool.shortDescription}</p>
        </div>
        {tool.status !== "full" && tool.statusNote ? (
          <Alert
            className="mt-5 max-w-3xl"
            tone={tool.status === "planned" ? "warning" : "info"}
            title={
              tool.status === "partial"
                ? "Works with limitations"
                : tool.status === "api"
                  ? "Uses a server-side service"
                  : "Not implemented yet"
            }
          >
            {tool.statusNote}
          </Alert>
        ) : null}
      </Container>

      <Container className="py-4">
        <div className="rounded-2xl border border-border bg-bg-subtle p-3 sm:p-5">
          <ToolRunner tool={runnerTool} />
        </div>
      </Container>

      <Container className="py-10">
        <div className="grid gap-12 lg:grid-cols-[1fr_300px]">
          <article className="prose-uh max-w-none min-w-0">
            <h2>About the {tool.name}</h2>
            <p>{tool.description}</p>

            {tool.instructions.length ? (
              <>
                <h2>How to use the {tool.name}</h2>
                <ol>
                  {tool.instructions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </>
            ) : null}

            {tool.faqs.length ? (
              <>
                <h2>Frequently asked questions</h2>
                <div className="not-prose mt-4 divide-y divide-border rounded-xl border border-border bg-card">
                  {tool.faqs.map((f, i) => (
                    <details key={i} className="group px-4 py-3" open={i === 0}>
                      <summary className="cursor-pointer list-none text-[15px] font-medium text-fg marker:hidden">
                        <span className="flex items-center justify-between gap-4">
                          {f.q}
                          <span className="text-fg-subtle transition-transform group-open:rotate-45" aria-hidden>
                            +
                          </span>
                        </span>
                      </summary>
                      <p className="mt-2 text-sm leading-relaxed text-fg-muted">{f.a}</p>
                    </details>
                  ))}
                </div>
              </>
            ) : null}
          </article>

          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-[13px] font-medium text-fg">Supported formats</h2>
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-fg-subtle">Input</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {tool.inputFormats.length ? tool.inputFormats.map((f) => <Badge key={f}>{f}</Badge>) : <span className="text-fg-muted">—</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-subtle">Output</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {tool.outputFormats.length ? tool.outputFormats.map((f) => <Badge key={f}>{f}</Badge>) : <span className="text-fg-muted">—</span>}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-2 text-[13px] font-medium text-fg">
                <PrivacyIcon className="h-4 w-4" aria-hidden /> {privacy.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{privacy.body}</p>
            </div>
            {tool.dependencies?.length ? (
              <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="text-[13px] font-medium text-fg">External dependencies</h2>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-fg-muted">
                  {tool.dependencies.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-[13px] font-medium text-fg">Category</h2>
              <Link href={categoryPath(cat.slug)} className="mt-1 block text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline">
                {cat.name}
              </Link>
            </div>
          </aside>
        </div>
      </Container>

      {related.length ? (
        <Container className="pb-6">
          <h2 className="mb-4 text-lg font-semibold tracking-tight text-fg">Related tools</h2>
          <ToolGrid tools={related} />
        </Container>
      ) : null}
    </>
  );
}
