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
  ];

  for (const { path, heading } of publicPages) {
    test(`${path} renders for a signed-out visitor`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(path === "/" ? /\/$/ : new RegExp(path));
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    });
  }

  const memberPages = [
    "/tools",
    "/tools/forms",
    "/tools/invite",
    "/profile",
    "/profile/edit",
    "/family-tree",
    "/notifications",
    "/pending-approval",
    "/captains/tools",
    "/captains/audit",
  ];

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
