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

  test("the console nav: a member sees no captain destinations", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "nav-member", "member");

    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Console" });
    await expect(nav.getByRole("link", { name: "Overview" })).toBeVisible();
    for (const name of [
      "Questionnaires",
      "Payments",
      "Camp settings",
      "Audit",
    ]) {
      await expect(nav.getByRole("link", { name })).toHaveCount(0);
    }
  });

  test("the console nav: a captain sees every destination", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "nav-captain", "captain");

    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Console" });
    for (const name of [
      "Roster",
      "Questionnaires",
      "Announcements",
      "Payments",
      "Camp settings",
      "Audit",
    ]) {
      await expect(nav.getByRole("link", { name })).toBeVisible();
    }
  });

  test("/captains/tools now leads to the Overview", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "tools-captain", "captain");

    await page.goto("/captains/tools");

    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Overview" }),
    ).toBeVisible();
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
    await expect(page.getByText("Team leads and captains only")).toBeVisible();
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
    await expect(page.getByText("Team leads and captains only")).toHaveCount(0);
  });

  // camp-management is NOT preview-but-locked any more: any approved member may
  // browse a PUBLIC roster (names, handles, country, role, teams), see who has
  // APPLIED (owner's ruling, 2026-09-22) and open a public card. The
  // captain-only facets — the approval stats strip, the Outstanding chip, join
  // date, email, ID and approve/reject/assign — are withheld SERVER-SIDE
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
    // The Pending chip is theirs now too.
    await expect(page.getByRole("button", { name: /^Pending/ })).toBeVisible();
    // …but the captain-only chrome is withheld: no Outstanding chip (blocking
    // required actions), and the old "Captain access only" lock is gone.
    await expect(
      page.getByRole("button", { name: /^Outstanding/ }),
    ).toHaveCount(0);
    await expect(page.getByText("Captain access only")).toHaveCount(0);
  });

  // The owner's ruling has two halves, and this is both of them on one screen.
  test("/captains/camp-management: a member sees who applied, and not who was declined", async ({
    page,
    request,
  }) => {
    // Two more people in the store. Each row is created the way the app makes
    // one — a first authenticated page load — then moved to its standing
    // through the same test seam the approval specs use.
    for (const [id, displayName, status] of [
      ["roster-applicant", "Pia Applicant", "pending"],
      ["roster-declined", "Rex Declined", "rejected"],
    ] as const) {
      await login(page, { id, email: "god@example.com", displayName });
      await page.goto("/"); // lazily creates the camp user row
      const res = await request.post("/api/test/set-approval", {
        data: { authUserId: id, status },
      });
      expect(res.ok()).toBe(true);
    }

    await asRank(page, request, "roster-viewer", "member");
    await page.goto("/captains/camp-management");

    // Assert what IS on the page before any absence, so this cannot pass
    // against a document that never painted.
    await expect(
      page.getByRole("heading", { name: "Camp management" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open Pia Applicant's profile" }).first(),
    ).toBeVisible();
    // She is marked as an applicant, and the chip counts exactly her.
    await expect(page.getByRole("button", { name: /^Pending 1/ })).toBeVisible();
    await expect(page.getByText("Pending", { exact: true }).first()).toBeVisible();

    // The declined sign-up is not on a member's roster at all — the default of
    // MEMBERS_SEE_REJECTED in apps/web/lib/camp-roster.ts.
    await expect(page.getByText("Rex Declined")).toHaveCount(0);
    await expect(page.getByText("Declined", { exact: true })).toHaveCount(0);
  });

  test("/captains/camp-management: a captain sees the full triage surface", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "roster-captain", "captain");

    await page.goto("/captains/camp-management");

    await expect(page.getByLabel("Search the roster")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Pending/ })).toBeVisible();
    // The captain-only Outstanding filter chip is present.
    await expect(
      page.getByRole("button", { name: /^Outstanding/ }),
    ).toBeVisible();
  });
});
