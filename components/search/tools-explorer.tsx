"use client";

import { useMemo, useState , useSyncExternalStore } from "react";
import { Search } from "lucide-react";
import type { CategorySlug, ToolSummary } from "@/types/tool";
import { searchTools } from "@/lib/tools/search";
import { ToolGrid } from "@/components/tools/tool-card";
import { cn } from "@/lib/utils/cn";

const noopSubscribe = () => () => {};

export function ToolsExplorer({
  tools,
  categories,
}: {
  tools: ToolSummary[];
  categories: { slug: CategorySlug; name: string; count: number }[];
}) {
  const search = useSyncExternalStore(noopSubscribe, () => window.location.search, () => "");
  const params = new URLSearchParams(search);
  const urlCat = params.get("category");
  const [qState, setQ] = useState<string | null>(null);
  const [catState, setCat] = useState<CategorySlug | "all" | null>(null);
  const q = qState ?? params.get("q") ?? "";
  const cat = catState ?? (urlCat && categories.some((c) => c.slug === urlCat) ? (urlCat as CategorySlug) : "all");

  const results = useMemo(() => searchTools(tools, q, { category: cat }), [tools, q, cat]);

  return (
    <div className="space-y-6">
      <div className="flex h-11 items-center gap-3 rounded-xl border border-border bg-card px-4 shadow-xs focus-within:border-border-strong">
        <Search className="h-4 w-4 text-fg-subtle" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter tools by name, format or task…"
          aria-label="Filter tools"
          className="h-full w-full bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
        />
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
        {[{ slug: "all" as const, name: "All", count: tools.length }, ...categories].map((c) => (
          <button
            key={c.slug}
            type="button"
            aria-pressed={cat === c.slug}
            onClick={() => setCat(c.slug)}
            className={cn(
              "rounded-full border px-3 py-1 text-[13px] transition-colors",
              cat === c.slug
                ? "border-fg bg-accent text-accent-fg"
                : "border-border bg-card text-fg-muted hover:border-border-strong hover:text-fg",
            )}
          >
            {c.name} <span className="opacity-60">{c.count}</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-fg-subtle" aria-live="polite">
        {results.length} tool{results.length === 1 ? "" : "s"}
      </p>
      {results.length ? <ToolGrid tools={results} /> : <p className="py-16 text-center text-fg-muted">No tools match your search.</p>}
    </div>
  );
}
