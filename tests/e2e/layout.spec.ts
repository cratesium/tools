import { test, expect } from "@playwright/test";

const pages = ["/", "/tools", "/category/pdf", "/tools/word-counter", "/tools/merge-pdf", "/tools/json-formatter", "/tools/emi-calculator"];

for (const p of pages) {
  test(`no horizontal overflow on ${p}`, async ({ page }) => {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("mobile menu opens and lists categories", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("navigation", { name: "Mobile" }).getByRole("link")).toHaveCount(14);
});

test("theme toggle switches and persists", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  const wasDark = await html.evaluate((el) => el.classList.contains("dark"));
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await expect(html).toHaveClass(wasDark ? /^(?!.*dark)/ : /dark/);
  await page.reload();
  expect(await html.evaluate((el) => el.classList.contains("dark"))).toBe(!wasDark);
});
