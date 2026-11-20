import type { CategorySlug, ToolSummary } from "@/types/tool";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Ranked, dependency-free search over tool summaries. Pure and deterministic so it
 * can be unit tested and run in the browser without loading the full registry.
 */
export function searchTools(
  index: ToolSummary[],
  query: string,
  opts: { category?: CategorySlug | "all"; limit?: number } = {},
): ToolSummary[] {
  const { category = "all", limit } = opts;
  const pool = category === "all" ? index : index.filter((t) => t.category === category);
  const q = normalize(query);
  if (!q) return limit ? pool.slice(0, limit) : pool;
  const terms = q.split(" ");

  const scored: { t: ToolSummary; score: number }[] = [];
  for (const t of pool) {
    const name = normalize(t.name);
    const slug = t.slug.replace(/-/g, " ");
    const desc = normalize(t.shortDescription);
    const kw = normalize((t.keywords ?? []).join(" "));
    const hay = `${name} ${slug} ${kw} ${desc} ${t.category}`;
    let score = 0;
    let all = true;
    for (const term of terms) {
      if (!hay.includes(term)) {
        all = false;
        break;
      }
      if (name.split(" ").some((w) => w.startsWith(term))) score += 10;
      else if (kw.includes(term)) score += 6;
      else if (desc.includes(term)) score += 2;
      else score += 1;
    }
    if (!all) continue;
    if (name === q) score += 100;
    else if (name.startsWith(q)) score += 40;
    else if (name.includes(q)) score += 20;
    if (t.status === "planned") score -= 5;
    scored.push({ t, score });
  }
  scored.sort((a, b) => b.score - a.score || a.t.id - b.t.id);
  const res = scored.map((s) => s.t);
  return limit ? res.slice(0, limit) : res;
}
