import { test, expect } from "@playwright/test";

test("URL QR code generator renders and downloads a PNG", async ({ page }) => {
  await page.goto("/tools/url-qr-code-generator");
  await page.getByTestId("input").first().fill("example.com/hello");
  await expect(page.getByTestId("output").first()).toBeVisible();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: /PNG/ }).first().click();
  const d = await dl;
  expect(d.suggestedFilename()).toMatch(/\.png$/);
});

test("barcode generator validates EAN-13 input", async ({ page }) => {
  await page.goto("/tools/barcode-generator");
  const fmt = page.getByLabel("Format");
  const options = await fmt.locator("option").allTextContents();
  const ean = options.find((o) => /EAN-13/.test(o));
  if (ean) await fmt.selectOption({ label: ean });
  await page.getByTestId("input").fill("ABC");
  await expect(page.getByTestId("error").or(page.getByRole("alert")).first()).toBeVisible();
  await page.getByTestId("input").fill("5901234123457");
  await expect(page.getByTestId("output")).toBeVisible();
});
