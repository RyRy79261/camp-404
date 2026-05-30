import { test, expect } from "@playwright/test";
import { login, resetTestState } from "./_helpers";

// The invite gate now lives AFTER auth: a signed-in user without a code on
// file is held at /signup/required until they enter a valid one. These specs
// rely on E2E_TEST_MODE=1 (test login route) and INVITE_CODES=TEST-INVITE in
// the dev server env. See playwright.config.ts's `webServer.env`.

test.describe("invite-code gate (post-auth)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("renders the invite form for a signed-in user without a code", async ({
    page,
  }) => {
    await login(page, { email: "newbie@example.com" });
    await page.goto("/signup/required");
    await expect(page.getByLabel("Invite code")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enter camp" }),
    ).toBeVisible();
  });

  test("an invalid code surfaces an error and stays on the gate", async ({
    page,
  }) => {
    await login(page, { email: "newbie@example.com" });
    await page.goto("/signup/required");
    await page.getByLabel("Invite code").fill("DEFINITELY-NOT-VALID");
    await page.getByRole("button", { name: "Enter camp" }).click();

    // Scope to our error alert by text — Next injects its own empty
    // role="alert" route announcer on every page, so a bare getByRole("alert")
    // is a strict-mode collision.
    await expect(
      page.getByRole("alert").filter({ hasText: /isn't valid/i }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/signup\/required/);
  });

  test("a valid code unlocks the questionnaire", async ({ page }) => {
    await login(page, { id: "gate-auth", email: "gate@example.com" });
    await page.goto("/signup/required");
    await page.getByLabel("Invite code").fill("TEST-INVITE");
    await page.getByRole("button", { name: "Enter camp" }).click();

    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  });
});
