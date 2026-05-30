import { test, expect } from "@playwright/test";

test.describe("unauthenticated home page", () => {
  test("renders branding and both auth CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Camp 404" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Are you lost?" }),
    ).toHaveAttribute("href", "/signup");
    await expect(
      page.getByRole("link", { name: "Already found" }),
    ).toHaveAttribute("href", "/auth/sign-in");
  });

  test("Sign up link routes through the invite gate", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Are you lost?" }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(
      page.getByText("Camp 404 is invite-only", { exact: false }),
    ).toBeVisible();
  });
});
