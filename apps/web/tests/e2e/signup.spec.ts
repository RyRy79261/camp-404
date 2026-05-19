import { test, expect } from "@playwright/test";

// These specs rely on the dev server having INVITE_CODES=TEST-INVITE in
// its environment. See playwright.config.ts's `webServer.env`.

test.describe("invite-code gate", () => {
  test("renders the invite form on /signup", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByLabel("Invite code")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  });

  test("an invalid code surfaces an error and stays on /signup", async ({
    page,
  }) => {
    await page.goto("/signup");
    await page.getByLabel("Invite code").fill("DEFINITELY-NOT-VALID");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("alert")).toContainText(/isn't valid/i);
    await expect(page).toHaveURL(/\/signup$/);
    // Cookie must NOT have been set on a bad code.
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "camp404_invite")).toBeUndefined();
  });

  test("a valid code sets the cookie and redirects to Stack's sign-up", async ({
    page,
  }) => {
    await page.goto("/signup");
    await page.getByLabel("Invite code").fill("TEST-INVITE");
    await page.getByRole("button", { name: "Continue" }).click();

    // Stack's hosted UI lives under /handler — we don't assert anything
    // about its DOM, just that the redirect happened and our cookie is set.
    await expect(page).toHaveURL(/\/handler\/sign-up/);
    const cookies = await page.context().cookies();
    const invite = cookies.find((c) => c.name === "camp404_invite");
    expect(invite?.value).toBe("TEST-INVITE");
    expect(invite?.httpOnly).toBe(true);
  });
});
