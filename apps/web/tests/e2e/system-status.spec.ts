import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import {
  completeOnboarding,
  login,
  resetTestState,
  seedTeam,
  setRank,
} from "./_helpers";
import { goViaConsoleNav, navEntry, openConsoleNav } from "./lib/console-nav";

// /captains/system: whether each service is set up and answering, and the
// daily job schedule. Captain-only, preview-but-locked (D3): anyone else gets
// the heading and a lock, and the status is never read for them. Uses a god
// email (clears the access and approval gates) so `setRank` toggles only the
// clearance gate under test. Under E2E the database probe is the test store's
// twin (lib/system-probe.ts), so no real database is asked.

test.describe("/captains/system (test-mode)", () => {
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

  /** The label of a check row: the dt's first line, not the headline text. */
  const checkRow = (page: Page, label: string) =>
    page.locator("dt").filter({ hasText: label });

  test("a captain opens it from the nav and sees the checks and the schedule", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "system-captain", "captain");

    await page.goto("/");
    await goViaConsoleNav(page, "System status", "Captains");

    await expect(page).toHaveURL("/captains/system");
    await expect(
      page.getByRole("heading", { level: 1, name: "System status" }),
    ).toBeVisible();

    await expect(checkRow(page, "Database")).toBeVisible();
    await expect(checkRow(page, "Database")).toContainText("Connected");
    await expect(checkRow(page, "Sign-in")).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "Background work" }),
    ).toBeVisible();
    await expect(page.getByText(/Nothing runs on a schedule/)).toBeVisible();
    await expect(page.getByText("Upkeep", { exact: true })).toBeVisible();
    // No cron jobs (owner, 2026-09-24): no schedule times, no cron routes.
    await expect(page.getByText(/Daily at/)).toHaveCount(0);
    await expect(page.getByText(/\/api\/cron\//)).toHaveCount(0);
  });

  test("a member sees the locked shell and no status", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "system-member", "member");

    await page.goto("/captains/system");

    await expect(page).toHaveURL("/captains/system"); // no redirect home
    // Something PRESENT first, so the absences below are read off a page that
    // has painted.
    await expect(
      page.getByRole("heading", { level: 1, name: "System status" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "System status is captain-only. Your rank doesn't have clearance for this.",
      ),
    ).toBeVisible();
    await expect(page.getByText("Background work")).toHaveCount(0);
    await expect(checkRow(page, "Database")).toHaveCount(0);
    await expect(page.getByText("Upkeep", { exact: true })).toHaveCount(0);
  });

  test("a team lead sees the locked shell too: the page needs a captain", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "system-lead", "member");
    await seedTeam(request, "system-lead", "kitchen", true);

    await page.goto("/captains/system");

    await expect(
      page.getByRole("heading", { level: 1, name: "System status" }),
    ).toBeVisible();
    await expect(
      page.getByText("System status is captain-only.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByText("Background work")).toHaveCount(0);
    await expect(checkRow(page, "Database")).toHaveCount(0);
    // A lead's nav has no link to it either: their Captains menu holds the
    // builder and nothing of a captain's.
    const captains = await openConsoleNav(page, "Captains");
    await expect(navEntry(captains, "Questionnaires")).toBeVisible();
    await expect(navEntry(captains, "System status")).toHaveCount(0);
  });
});
