// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { tools, getTool, getToolsByCategory, getRelatedTools, getSearchIndex } from "@/lib/tools/registry";
import { categories } from "@/lib/tools/categories";
import { catalogue } from "@/lib/tools/catalogue";
import { searchTools } from "@/lib/tools/search";
import { categoryLoaders } from "@/components/tools/loaders";

describe("registry: catalogue integrity", () => {
  it("registers exactly 304 tools", () => {
    expect(tools).toHaveLength(304);
    expect(catalogue).toHaveLength(304);
  });

  it("matches the canonical catalogue (id, name, slug, category)", () => {
    for (const [id, name, slug, category] of catalogue) {
      const t = tools.find((x) => x.id === id);
      expect(t, `tool #${id}`).toBeDefined();
      expect(t!.name, `name of #${id}`).toBe(name);
      expect(t!.slug, `slug of #${id}`).toBe(slug);
      expect(t!.category, `category of #${id}`).toBe(category);
    }
  });

  it("has unique ids, slugs, SEO titles and descriptions", () => {
    const uniq = (xs: string[] | number[]) => new Set(xs as unknown[]).size === xs.length;
    expect(uniq(tools.map((t) => t.id))).toBe(true);
    expect(uniq(tools.map((t) => t.slug))).toBe(true);
    const live = tools.filter((t) => t.status !== "planned");
    const dupTitles = live.map((t) => t.seoTitle).filter((v, i, a) => a.indexOf(v) !== i);
    const dupDescs = live.map((t) => t.seoDescription).filter((v, i, a) => a.indexOf(v) !== i);
    const dupShort = live.map((t) => t.shortDescription).filter((v, i, a) => a.indexOf(v) !== i);
    expect(dupTitles).toEqual([]);
    expect(dupDescs).toEqual([]);
    expect(dupShort).toEqual([]);
  });

  it("uses valid URL slugs", () => {
    for (const t of tools) expect(t.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("assigns ids to the correct category ranges", () => {
    for (const c of categories) {
      const list = getToolsByCategory(c.slug);
      expect(list.length).toBe(c.range[1] - c.range[0] + 1);
      for (const t of list) {
        expect(t.id).toBeGreaterThanOrEqual(c.range[0]);
        expect(t.id).toBeLessThanOrEqual(c.range[1]);
      }
    }
    expect(categories).toHaveLength(13);
  });
});

describe("registry: content quality (implemented tools)", () => {
  const live = tools.filter((t) => t.status !== "planned");
  it.each(live.map((t) => [t.slug, t] as const))("%s has complete SEO content", (_s, t) => {
    expect(t.shortDescription.length).toBeGreaterThan(40);
    expect(t.description.length).toBeGreaterThan(120);
    expect(t.seoTitle.length).toBeLessThanOrEqual(70);
    expect(t.seoDescription.length).toBeGreaterThanOrEqual(90);
    expect(t.seoDescription.length).toBeLessThanOrEqual(175);
    expect(t.instructions.length).toBeGreaterThanOrEqual(3);
    expect(t.faqs.length).toBeGreaterThanOrEqual(3);
    expect(t.inputFormats.length + t.outputFormats.length).toBeGreaterThan(0);
    expect(t.processor).toMatch(new RegExp(`^${t.category}\\.[a-z0-9-]+$`));
    if (t.status !== "full") expect(t.statusNote, `${t.slug} needs statusNote`).toBeTruthy();
    for (const r of t.related) expect(getTool(r), `${t.slug} related → ${r}`).toBeDefined();
    expect(t.related).not.toContain(t.slug);
  });

  it("every implemented processor has a registered UI component", async () => {
    const missing: string[] = [];
    for (const c of categories) {
      const map = (await categoryLoaders[c.slug]()).default;
      for (const t of getToolsByCategory(c.slug)) {
        if (t.status === "planned") continue;
        if (!map[t.processor]) missing.push(`${t.slug} → ${t.processor}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("related tools resolve and exclude self", () => {
    for (const t of tools) {
      const rel = getRelatedTools(t);
      expect(rel.find((r) => r.slug === t.slug)).toBeUndefined();
    }
  });
});

describe("search", () => {
  const index = getSearchIndex();
  it("finds tools by exact name first", () => {
    expect(searchTools(index, "Merge PDF")[0].slug).toBe("merge-pdf");
    expect(searchTools(index, "word counter")[0].slug).toBe("word-counter");
  });
  it("supports multi-term and partial queries", () => {
    const r = searchTools(index, "jpg png");
    expect(r.map((t) => t.slug)).toContain("jpg-to-png");
    expect(searchTools(index, "qr").length).toBeGreaterThanOrEqual(10);
  });
  it("filters by category", () => {
    const r = searchTools(index, "", { category: "security" });
    expect(r).toHaveLength(14);
    expect(r.every((t) => t.category === "security")).toBe(true);
    expect(searchTools(index, "to", { category: "image" }).every((t) => t.category === "image")).toBe(true);
  });
  it("returns nothing for nonsense", () => {
    expect(searchTools(index, "zzqqxx")).toEqual([]);
  });
});
