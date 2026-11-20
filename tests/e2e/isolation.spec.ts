import { test, expect } from "@playwright/test";

// Two independent browser contexts = two visitors. State must never leak between them.
test("two visitors on the same tool are isolated", async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pa = await a.newPage();
  const pb = await b.newPage();
  await Promise.all([pa.goto("/tools/word-counter"), pb.goto("/tools/word-counter")]);
  await pa.getByTestId("input").fill("alpha beta gamma");
  await pb.getByTestId("input").fill("one");
  await expect(pa.getByTestId("stats")).toContainText("3");
  await expect(pb.getByTestId("input")).toHaveValue("one");
  await expect(pa.getByTestId("input")).toHaveValue("alpha beta gamma");
  await pa.getByTestId("reset").click();
  await expect(pa.getByTestId("input")).toHaveValue("");
  await expect(pb.getByTestId("input")).toHaveValue("one");
  await a.close();
  await b.close();
});

test("two tabs in one session keep independent tool state", async ({ context }) => {
  const p1 = await context.newPage();
  const p2 = await context.newPage();
  await p1.goto("/tools/word-counter");
  await p2.goto("/tools/word-counter");
  await p1.getByTestId("input").fill("first tab");
  await expect(p2.getByTestId("input")).toHaveValue("");
});
