import { test, expect } from "@playwright/test";
import { tools } from "@/lib/tools/registry";
import { categories } from "@/lib/tools/categories";

// Sweep every tool route once (desktop only): SEO tags, H1, tool UI mounts, no runtime errors.
test.describe("every tool route", () => {
  test.skip(({ isMobile }) => isMobile, "route sweep runs on desktop only");
  test.describe.configure({ mode: "parallel" });

  for (const t of tools) {
    test(`#${t.id} /tools/${t.slug}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const res = await page.goto(`/tools/${t.slug}`);
      expect(res?.status()).toBe(200);
      await expect(page).toHaveTitle(t.seoTitle);
      await expect(page.locator("h1")).toHaveText(t.name);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", t.seoDescription);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/tools/${t.slug}$`));
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", t.seoTitle);
      await expect(page.locator('script[type="application/ld+json"]').first()).toBeAttached();
      await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
      if (t.status === "planned") {
        await expect(page.getByText("Not available yet")).toBeVisible();
      } else {
        await expect(page.getByTestId("tool-ui")).toBeVisible({ timeout: 20_000 });
        await expect(page.getByTestId("tool-ui")).toHaveAttribute("data-processor", t.processor);
      }
      expect(errors, errors.join("\n")).toEqual([]);
    });
  }
});

test.describe("category and static routes", () => {
  for (const c of categories) {
    test(`/category/${c.slug}`, async ({ page }) => {
      const res = await page.goto(`/category/${c.slug}`);
      expect(res?.status()).toBe(200);
      await expect(page.locator("h1")).toHaveText(c.name);
      await expect(page.locator("main ul li a[href^='/tools/']")).toHaveCount(c.range[1] - c.range[0] + 1);
    });
  }
  for (const p of ["/", "/tools", "/about", "/contact", "/privacy", "/terms"]) {
    test(`static ${p}`, async ({ page }) => {
      const res = await page.goto(p);
      expect(res?.status()).toBe(200);
      await expect(page.locator("h1")).toBeVisible();
    });
  }
  test("sitemap and robots", async ({ request }) => {
    const sm = await (await request.get("/sitemap.xml")).text();
    expect(sm).toContain("/tools/merge-pdf");
    expect(sm).toContain("/category/web");
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  });
  test("unknown route returns 404 page", async ({ page }) => {
    const res = await page.goto("/tools/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("Page not found")).toBeVisible();
  });
});
