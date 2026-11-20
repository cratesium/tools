import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { tools, getStatusCounts } from "@/lib/tools/registry";
import { categories } from "@/lib/tools/categories";

/**
 * Generates docs/TOOL-STATUS.md from the registry when GENERATE_STATUS=1
 * (npm run status). Otherwise it just sanity-checks the counts.
 */
describe("status report", () => {
  it("summarises implementation status", () => {
    const c = getStatusCounts();
    expect(c.full + c.partial + c.api + c.planned).toBe(304);
    if (!process.env.GENERATE_STATUS) return;
    const label = { full: "✅ Full", partial: "🟡 Partial", api: "🔌 API / server", planned: "⏳ Planned" } as const;
    let md = `# Tool implementation status\n\nGenerated from the registry (\`npm run status\`).\n\n`;
    md += `| Status | Count |\n| --- | --- |\n`;
    for (const k of ["full", "partial", "api", "planned"] as const) md += `| ${label[k]} | ${c[k]} |\n`;
    md += `| **Total** | **${tools.length}** |\n\n`;
    md += `- **Full**: works end to end in the browser.\n- **Partial**: works with documented limitations.\n- **API / server**: needs a Cloudflare Pages Function, binding or external service.\n- **Planned**: registered, not yet implemented.\n\n`;
    for (const cat of categories) {
      md += `## ${cat.name} (${cat.range[0]}–${cat.range[1]})\n\n| # | Tool | Status | Notes |\n| --- | --- | --- | --- |\n`;
      for (const t of tools.filter((x) => x.category === cat.slug)) {
        const note = [t.statusNote, t.dependencies?.length ? `Depends on: ${t.dependencies.join("; ")}` : ""]
          .filter(Boolean)
          .join(" ")
          .replace(/\|/g, "\\|");
        md += `| ${t.id} | [${t.name}](../app/tools/[slug]/page.tsx) \`/tools/${t.slug}\` | ${label[t.status]} | ${note} |\n`;
      }
      md += `\n`;
    }
    writeFileSync("docs/TOOL-STATUS.md", md);
  });
});
