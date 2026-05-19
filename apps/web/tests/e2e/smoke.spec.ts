import { test, expect } from "@playwright/test";

test("home page renders Camp 404 branding", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Camp 404").first()).toBeVisible();
});

test("health endpoint responds", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toMatchObject({ ok: true });
});
