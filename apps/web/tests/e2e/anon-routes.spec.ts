import { test, expect } from "@playwright/test";
import { CAMP_PATH_HEADER } from "../../lib/camp-path";
import { completeOnboarding, login, resetTestState } from "./_helpers";

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
    { path: "/terms", heading: "Terms of use" },
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
    // My lift (decision 11 A), new in the program manifest PR.
    "/lift",
    "/notifications",
    "/pending-approval",
    "/captains/audit",
  ];

  // The old hubs are gone: the console nav replaced them, and they send
  // everyone to Home at /, which is the landing page when signed out.
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
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
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

  // A push, email or reminder link opens one of these. Signing in used to
  // lose the target; the gate now names it in ?next= (lib/sign-in-redirect.ts,
  // set from the x-camp-path header proxy.ts writes).
  const deepLinks = [
    "/notifications",
    "/announcements/00000000-0000-4000-8000-000000000001",
    "/questionnaires/00000000-0000-4000-8000-000000000002",
  ];
  for (const path of deepLinks) {
    test(`${path} keeps its target through sign-in`, async ({ page }) => {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: "Welcome back" }),
      ).toBeVisible();
      const url = new URL(page.url());
      expect(url.pathname).toBe("/auth/sign-in");
      expect(url.searchParams.get("next")).toBe(path);
    });
  }

  test("signing in returns to the page the link named", async ({
    page,
    request,
  }) => {
    await page.goto("/notifications");
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    const next = new URL(page.url()).searchParams.get("next");
    expect(next).toBe("/notifications");

    // The test login stands in for the form. Its return leg is the one Google
    // and a finished sign-in take: /auth forwards a signed-in member to next.
    await login(page, {
      id: "deep-link-member",
      email: "god@example.com",
      displayName: "Deep Link",
    });
    await page.goto("/");
    await completeOnboarding(request, "deep-link-member");
    await page.goto(`/auth?next=${encodeURIComponent(next!)}`);
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Notifications" }),
    ).toBeVisible();
  });

  // The spoof names a real console window a member could be sent to, so a
  // `next` of the requested page shows the header was ignored, not merely
  // unreadable. The dotted page is one the proxy's matcher must still cover.
  for (const path of ["/profile", "/announcements/a.b"]) {
    test(`a spoofed ${CAMP_PATH_HEADER} header on ${path} does not choose where sign-in returns`, async ({
      page,
    }) => {
      await page.setExtraHTTPHeaders({ [CAMP_PATH_HEADER]: "/captains/audit" });
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: "Welcome back" }),
      ).toBeVisible();
      expect(new URL(page.url()).searchParams.get("next")).toBe(path);
    });
  }

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
