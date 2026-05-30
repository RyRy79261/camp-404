import { test, expect } from "@playwright/test";

test.describe("unauthenticated home page", () => {
  test("renders branding and the single auth CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Camp 404" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Are you lost?" }),
    ).toHaveAttribute("href", "/auth/sign-in");
  });

  test("the lost link lands on the sign-in screen", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Are you lost?" }).click();
    await expect(page).toHaveURL(/\/auth\/sign-in$/);
  });
});
