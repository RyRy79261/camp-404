import { test, expect } from "@playwright/test";

// Minimal "is the server alive?" smoke. Detailed coverage of the home
// page, the invite gate, and the API contracts lives in home.spec.ts,
// signup.spec.ts, and api.spec.ts respectively.

test("home page renders Camp 404 branding", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Camp 404").first()).toBeVisible();
});
