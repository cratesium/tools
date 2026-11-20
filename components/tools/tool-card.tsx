import Link from "next/link";
import type { ToolSummary } from "@/types/tool";
import { CategoryIcon } from "@/components/ui/category-icon";
import { StatusBadge } from "@/components/ui/feedback";

export function ToolCard({ tool }: { tool: ToolSummary }) {
  return (
    <Link
      href={`/tools/${tool.slug}`}
      className="group flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-card"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg-subtle text-fg-muted transition-colors group-hover:text-fg">
          <CategoryIcon category={tool.category} />
        </span>
        <StatusBadge status={tool.status} />
      </div>
      <div className="space-y-1">
        <h3 className="text-[15px] font-medium tracking-tight text-fg">{tool.name}</h3>
        <p className="line-clamp-2 text-[13px] leading-relaxed text-fg-muted">{tool.shortDescription}</p>
      </div>
    </Link>
  );
}

export function ToolGrid({ tools }: { tools: ToolSummary[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {tools.map((t) => (
        <li key={t.slug}>
          <ToolCard tool={t} />
        </li>
      ))}
    </ul>
  );
}
