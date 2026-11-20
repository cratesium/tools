import { test, expect } from "@playwright/test";

test("homepage search suggests and navigates", async ({ page }) => {
  await page.goto("/");
  const box = page.getByRole("combobox", { name: "Search tools" });
  await box.fill("merge pdf");
  await expect(page.getByRole("option").first()).toContainText("Merge PDF");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/tools\/merge-pdf$/);
});

test("command palette opens with keyboard and searches", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard shortcut is desktop only");
  await page.goto("/about");
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Search tools" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill("json format");
  await expect(dialog.getByRole("option").first()).toContainText("JSON Formatter");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("tools page filters by category and query", async ({ page }) => {
  await page.goto("/tools");
  await expect(page.getByText("304 tools")).toBeVisible();
  await page.getByRole("button", { name: /^Security/ }).click();
  await expect(page.getByText("14 tools")).toBeVisible();
  await page.getByRole("searchbox", { name: "Filter tools" }).fill("sha");
  await expect(page.getByText(/^\d+ tools?$/)).not.toHaveText("14 tools");
  const n = await page.locator("main ul li").count();
  expect(n).toBeGreaterThanOrEqual(3); // SHA-1, SHA-256, SHA-512 (+ any tool mentioning SHA)
  expect(n).toBeLessThan(14);
});

test("tools page reads ?q= from the URL", async ({ page }) => {
  await page.goto("/tools?q=qr%20code");
  await expect(page.getByRole("searchbox", { name: "Filter tools" })).toHaveValue("qr code");
  expect(await page.locator("main ul li").count()).toBeGreaterThanOrEqual(10);
});
