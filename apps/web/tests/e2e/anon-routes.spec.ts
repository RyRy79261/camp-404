import { test, expect } from "@playwright/test";
import { resetTestState } from "./_helpers";

// Every route a signed-out visitor can reach, and where the rest send them.
// Each check proves the destination RENDERED (its heading is on screen), not
// only that the URL changed: a redirect to a page that then errors would pass
// a URL check.

test.describe("signed-out visitor", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  const publicPages: { path: string; heading: string | RegExp }[] = [
    { path: "/", heading: "Camp 404" },
    { path: "/auth/sign-in", heading: "Welcome back" },
    { path: "/auth/sign-up", heading: "Create your account" },
    // Neon Auth drew these two; self-hosted, they are ours. The e2e server has
    // no email provider, so the forgot page says reset is off rather than
    // offering a link that cannot arrive.
    { path: "/auth/forgot-password", heading: "Password reset is off" },
    { path: "/auth/reset-password", heading: /This link can.t be used/ },
    // Public, because Google will not offer its sign-in without it.
    { path: "/privacy", heading: "Privacy" },
  ];

  for (const { path, heading } of publicPages) {
    test(`${path} renders for a signed-out visitor`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(path === "/" ? /\/$/ : new RegExp(path));
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    });
  }

  const memberPages = [
    "/tools/forms",
    "/tools/invite",
    "/profile",
    "/profile/edit",
    "/profile/security",
    "/family-tree",
    "/notifications",
    "/pending-approval",
    "/captains/audit",
  ];

  // The old hubs are gone: the console nav replaced them, and they send
  // everyone to the Overview at /, which is the landing page when signed out.
  for (const path of ["/tools", "/captains/tools"]) {
    test(`${path} now leads to the home page`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/$/);
      await expect(
        page.getByRole("heading", { name: "Camp 404" }),
      ).toBeVisible();
    });
  }

  test("an unknown auth path goes to sign-in rather than a blank page", async ({
    page,
  }) => {
    await page.goto("/auth/settings");
    await expect(page).toHaveURL(/\/auth\/sign-in/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("sign-in offers a passkey, and no Google button without Google keys", async ({
    page,
  }) => {
    await page.goto("/auth/sign-in");
    await expect(
      page.getByRole("button", { name: /Sign in with a passkey/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toHaveCount(0);
  });

  for (const path of memberPages) {
    test(`${path} sends a signed-out visitor to sign in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/auth\/sign-in/);
      await expect(
        page.getByRole("heading", { name: "Welcome back" }),
      ).toBeVisible();
    });
  }
});
