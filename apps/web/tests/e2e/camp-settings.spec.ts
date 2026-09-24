import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
  setRank,
} from "./_helpers";

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
    await expect(page.getByText("Captain access only")).toBeVisible();
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

  test("a captain renames, moves and archives Water; all of it persists", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "settings-water-captain", "captain");

    await page.goto("/captains/camp-settings");
    await expect(page.getByText("Water", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Rename Water" }).click();
    await page.getByLabel("Rename Water").fill("H2O");
    await page.getByRole("button", { name: "Save name for Water" }).click();
    await expect(page.getByText("H2O", { exact: true })).toBeVisible();

    // Water is the last team; one step up puts it above Sound.
    await page.getByRole("button", { name: "Move H2O up" }).click();
    await expect(page.getByRole("row").last()).toContainText("Sound");

    const active = page.getByRole("switch", { name: "H2O active" });
    await expect(active).toBeChecked();
    await active.click();
    await expect(active).not.toBeChecked();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Camp settings" }),
    ).toBeVisible();
    await expect(page.getByText("Water", { exact: true })).toHaveCount(0);
    const rows = page.getByRole("row");
    await expect(rows.last()).toContainText("Sound");
    const h2o = rows.filter({ hasText: "H2O" });
    await expect(h2o).toHaveCount(1);
    await expect(h2o).toContainText("Archived");
    await expect(
      page.getByRole("switch", { name: "H2O active" }),
    ).not.toBeChecked();
  });
});

test.describe("camp-management — a new team on a member (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a captain puts a member on Transport and Logistics and makes them its lead", async ({
    page,
    request,
  }) => {
    // An approved member, as calendar.spec.ts stands one up.
    await login(page, {
      id: "teams-driver",
      email: "teams-driver@example.com",
      displayName: "Tia Driver",
    });
    await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
    await completeOnboarding(request, "teams-driver");

    await login(page, { id: "teams-captain", email: "god@example.com" });
    await page.goto("/");
    await completeOnboarding(request, "teams-captain");
    await setRank(request, "teams-captain", "captain");

    async function openPanel() {
      await page.goto("/captains/camp-management");
      await expect(
        page.getByRole("heading", { level: 1, name: "Camp management" }),
      ).toBeVisible();
      // The table (desktop) and the card list (phone) both render every row.
      await page
        .getByRole("button", { name: "Open Tia Driver's profile" })
        .filter({ visible: true })
        .click();
      return page.getByRole("region", { name: "Tia Driver profile" });
    }

    let panel = await openPanel();
    const team = panel.getByRole("checkbox", {
      name: "Transport and Logistics",
    });
    await expect(team).not.toBeChecked();
    await team.click();
    await expect(team).toBeChecked();
    const lead = panel.locator("#lead-transport_and_logistics");
    await expect(lead).not.toBeChecked();
    await lead.click();
    await expect(lead).toBeChecked();

    await page.reload();
    panel = await openPanel();
    await expect(
      panel.getByRole("checkbox", { name: "Transport and Logistics" }),
    ).toBeChecked();
    await expect(panel.locator("#lead-transport_and_logistics")).toBeChecked();
  });
});
