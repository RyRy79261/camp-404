import { test, expect } from "@playwright/test";

test.describe("unauthenticated home page", () => {
  test("renders branding and both auth CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Camp 404" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign up" })).toHaveAttribute(
      "href",
      "/signup",
    );
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/auth/sign-in",
    );
  });

  test("Sign up link routes through the invite gate", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(
      page.getByText("Sign-up is invite-only", { exact: false }),
    ).toBeVisible();
  });
});
