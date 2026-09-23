import { test, expect } from "@playwright/test";
import { completeOnboarding, login, resetTestState, setRank } from "./_helpers";

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

// A signed-in member's own Home: to-dos, what's coming, their places — and
// nothing that is not theirs (owner, 2026-09-23).
test.describe("a member's own home", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("an approved member sees their page, not the camp's", async ({
    page,
    request,
  }) => {
    await login(page, {
      id: "home-member",
      email: "god@example.com",
      displayName: "Nova Reyes",
    });
    await page.goto("/");
    await completeOnboarding(request, "home-member");
    await setRank(request, "home-member", "member");

    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Hi Nova" }),
    ).toBeVisible();
    await expect(page.getByText("You’re all caught up.")).toBeVisible();
    // The e2e server has no calendar, and the page says so rather than
    // implying nothing is on.
    await expect(
      page.getByText("The camp calendar isn't connected yet."),
    ).toBeVisible();
    const shortcuts = page.getByRole("navigation", { name: "Your modules" });
    await expect(
      shortcuts.getByRole("link", { name: /Announcements/ }),
    ).toHaveAttribute("href", "/notifications");
    await expect(
      shortcuts.getByRole("link", { name: /My forms/ }),
    ).toBeVisible();
    // The whole-camp board is a captain's, and is not here.
    await expect(page.getByText("Is camp ready?")).toHaveCount(0);
    await expect(
      shortcuts.getByRole("link", { name: /Camp overview/ }),
    ).toHaveCount(0);
  });

  test("a captain gets the camp overview as one link, and it opens", async ({
    page,
    request,
  }) => {
    await login(page, { id: "home-captain", email: "god@example.com" });
    await page.goto("/");
    await completeOnboarding(request, "home-captain");
    await setRank(request, "home-captain", "captain");

    await page.goto("/");
    const shortcuts = page.getByRole("navigation", { name: "Your modules" });
    await shortcuts.getByRole("link", { name: /Camp overview/ }).click();
    await expect(page).toHaveURL("/captains/overview");
    await expect(
      page.getByRole("heading", { level: 1, name: "Camp overview" }),
    ).toBeVisible();
  });

  test("a member cannot open the camp overview", async ({ page, request }) => {
    await login(page, { id: "home-peek", email: "god@example.com" });
    await page.goto("/");
    await completeOnboarding(request, "home-peek");
    await setRank(request, "home-peek", "member");

    await page.goto("/captains/overview");
    await expect(
      page.getByRole("heading", { level: 1, name: "Camp overview" }),
    ).toBeVisible();
    await expect(page.getByText(/captain-only/)).toBeVisible();
    await expect(page.getByText("Is camp ready?")).toHaveCount(0);
  });
});
