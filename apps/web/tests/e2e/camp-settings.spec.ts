import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { completeOnboarding, login, resetTestState, setRank } from "./_helpers";

// Phase 2 — the captain team-settings editor. Preview-but-locked (D3) for the
// gate, plus a real write round-trip: renaming through the server action +
// E2E-mode facade (which routes to the in-memory test store, not Neon) must
// persist across a reload AND flow to the roster's team filter. This is the only
// coverage of the facade/test-store WRITE path, which the unit tests can't reach.

test.describe("camp-settings — team editor (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  async function asRank(
    page: Page,
    request: APIRequestContext,
    authUserId: string,
    rank: "captain" | "member",
  ) {
    await login(page, { id: authUserId, email: "god@example.com" });
    await page.goto("/"); // lazily creates the camp user row
    await completeOnboarding(request, authUserId);
    await setRank(request, authUserId, rank);
  }

  test("a non-captain sees the locked shell, no editor", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "settings-member", "member");

    await page.goto("/captains/camp-settings");

    await expect(page).toHaveURL("/captains/camp-settings"); // no redirect
    await expect(
      page.getByRole("heading", { name: "Camp settings" }),
    ).toBeVisible();
    await expect(page.getByText("VIEW ONLY")).toBeVisible();
    // The editor is withheld — no rename controls render.
    await expect(page.getByRole("button", { name: /^Rename / })).toHaveCount(0);
  });

  test("a captain renames a team; it persists and flows to the roster filter", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "settings-captain", "captain");

    await page.goto("/captains/camp-settings");
    await expect(page.getByText("Kitchen", { exact: true })).toBeVisible();

    // Rename Kitchen → Cuisine through the editor.
    await page.getByRole("button", { name: "Rename Kitchen" }).click();
    await page.getByLabel("Rename Kitchen").fill("Cuisine");
    await page.getByRole("button", { name: "Save name for Kitchen" }).click();

    // Persisted via the test-store-backed facade: the row updates and survives a
    // reload (proving the write landed, not just optimistic local state).
    await expect(page.getByText("Cuisine", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Cuisine", { exact: true })).toBeVisible();
    await expect(page.getByText("Kitchen", { exact: true })).toHaveCount(0);

    // Cross-surface: the roster's team filter now offers the new label.
    await page.goto("/captains/camp-management");
    await expect(
      page
        .getByLabel("Filter by team")
        .locator("option", { hasText: "Cuisine" }),
    ).toHaveCount(1);
  });
});
