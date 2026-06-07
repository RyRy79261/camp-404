import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { completeOnboarding, login, resetTestState, setRank } from "./_helpers";

// Preview-but-locked (decision D3) for the two captain surfaces that used to
// hard-redirect non-captains. A non-captain now gets a 200 with the page chrome
// + a CaptainLock and NO data; a captain gets the full surface. Uses a god email
// (clears the access + approval gates) so `setRank` toggles only the clearance
// gate under test.

test.describe("captain surfaces — preview-but-locked (test-mode)", () => {
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

  test("/captains/tools: a non-captain sees the locked shell, no tool data", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "tools-member", "member");

    await page.goto("/captains/tools");

    await expect(page).toHaveURL("/captains/tools"); // no redirect home
    await expect(
      page.getByRole("heading", { name: "Camp tools" }),
    ).toBeVisible();
    await expect(page.getByText("VIEW ONLY")).toBeVisible();
    await expect(
      page.getByText(/this tooling is captain-only/i),
    ).toBeVisible();
    // The tool list is withheld — no tool cards rendered.
    await expect(
      page.getByRole("link", { name: /Announcements & notifications/ }),
    ).toHaveCount(0);
  });

  test("/captains/tools: a captain sees the tool list", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "tools-captain", "captain");

    await page.goto("/captains/tools");

    await expect(
      page.getByRole("link", { name: /Announcements & notifications/ }),
    ).toBeVisible();
    await expect(page.getByText("VIEW ONLY")).toHaveCount(0);
  });

  test("/captains/announcements: a non-captain sees the locked shell, no composer", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "ann-member", "member");

    await page.goto("/captains/announcements");

    await expect(page).toHaveURL("/captains/announcements"); // no redirect home
    await expect(
      page.getByRole("heading", { name: "Announcements & notifications" }),
    ).toBeVisible();
    await expect(page.getByText("VIEW ONLY")).toBeVisible();
    // The composer is withheld — its Title field never renders.
    await expect(page.getByLabel("Title")).toHaveCount(0);
  });

  test("/captains/announcements: a captain sees the composer", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "ann-captain", "captain");

    await page.goto("/captains/announcements");

    await expect(page.getByLabel("Title")).toBeVisible();
    await expect(page.getByText("VIEW ONLY")).toHaveCount(0);
  });

  // camp-management is NOT preview-but-locked any more: any approved member may
  // browse a PUBLIC roster (names, handles, country, role, teams) and open a
  // public card. The captain-only facets — approval status/stats, the Pending /
  // Outstanding chips, and approve/reject/assign — are withheld SERVER-SIDE
  // (members receive the redacted PublicRosterRow projection). The roster read
  // flows through lib/roster.ts (test-store-backed under E2E_TEST_MODE), so both
  // ranks render without touching Neon.
  test("/captains/camp-management: a non-captain browses the public roster (no captain chrome)", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "roster-member", "member");

    await page.goto("/captains/camp-management");

    await expect(page).toHaveURL("/captains/camp-management"); // no redirect
    await expect(
      page.getByRole("heading", { name: "Camp management" }),
    ).toBeVisible();
    // Members CAN now browse + search the roster.
    await expect(page.getByLabel("Search the roster")).toBeVisible();
    // …and rows actually render (browse-positive: catch a zero-rows / error
    // regression that would otherwise look "locked down" yet be broken).
    await expect(
      page.getByRole("button", { name: /Open .*profile/ }).first(),
    ).toBeVisible();
    // …but the captain-only chrome is withheld: no Pending filter chip, and the
    // old "Captain access only" lock is gone.
    await expect(page.getByRole("button", { name: /Pending/ })).toHaveCount(0);
    await expect(page.getByText("Captain access only")).toHaveCount(0);
  });

  test("/captains/camp-management: a captain sees the full triage surface", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "roster-captain", "captain");

    await page.goto("/captains/camp-management");

    await expect(page.getByLabel("Search the roster")).toBeVisible();
    // The captain-only Pending filter chip is present.
    await expect(page.getByRole("button", { name: /Pending/ })).toBeVisible();
  });
});
