import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { completeOnboarding, login, resetTestState, setRank } from "./_helpers";
import {
  closeConsoleNav,
  consoleNavGroups,
  expectDesktop,
  navEntry,
  openConsoleNav,
  usesPhoneLayout,
} from "./lib/console-nav";

/**
 * The roster view on screen. The roster ships TWO views and keeps both in the
 * DOM, a table from md up (`hidden md:block`) and a card list below it
 * (`md:hidden`), so every row button exists twice: scope to the one this
 * width shows.
 */
function rosterView(page: Page) {
  return usesPhoneLayout(page)
    ? page
        .getByRole("list")
        .filter({ has: page.getByRole("button", { name: /Open .*profile/ }) })
        .first()
    : page.getByRole("table");
}

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

    // The captain destinations all live in the Captains folder, in the Start
    // menu's Captains group, and a member's Start menu (or phone home screen)
    // draws no such group. Read once the Me group is on screen.
    const groups = await consoleNavGroups(page);
    expect(groups).toContain("Me");
    expect(groups).not.toContain("Captains");
  });

  test("the console nav: a captain sees every destination", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "nav-captain", "captain");

    await page.goto("/");

    const camp = await openConsoleNav(page, "Camp");
    await expect(navEntry(camp, "Roster")).toBeVisible();
    await closeConsoleNav(page);
    const captains = await openConsoleNav(page, "Captains");
    for (const name of [
      "Camp overview",
      "Questionnaires",
      "Announcements",
      "Payments",
      "Camp settings",
      "Audit log",
      "System status",
    ]) {
      await expect(navEntry(captains, name)).toBeVisible();
    }
  });

  test("/captains/tools now leads to Home", async ({ page, request }) => {
    await asRank(page, request, "tools-captain", "captain");

    await page.goto("/captains/tools");

    await expect(page).toHaveURL(/\/$/);
    await expectDesktop(page);
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
    // Scope to the view this width shows (rosterView); an unscoped `.first()`
    // could assert against the hidden copy. `.first()` inside the view is
    // honest: there are several rows and any one proves rendering.
    const roster = rosterView(page);
    await expect(
      roster.getByRole("button", { name: /Open .*profile/ }).first(),
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
    // Scoped to the view on screen, because the other holds a second copy of
    // every row (see rosterView).
    const roster = rosterView(page);
    await expect(
      roster.getByRole("button", { name: "Open Pia Applicant's profile" }),
    ).toBeVisible();
    // She is marked as an applicant, and the chip counts exactly her.
    await expect(
      page.getByRole("button", { name: /^Pending 1/ }),
    ).toBeVisible();
    // Exactly one "Pending" badge in the view: hers. Unscoped this would also
    // match the Pending filter chip.
    await expect(roster.getByText("Pending", { exact: true })).toHaveCount(1);

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
  // #129: a captain chasing a member needs to say WHAT to finish, not how
  // many. A member who signs in and stops before the questionnaire still owes
  // the burner-profile gate (seedBurnerProfileAction), and the captain's panel
  // names it.
  test("/captains/camp-management: a captain sees which actions a member still owes", async ({
    page,
    request,
  }) => {
    await login(page, {
      id: "roster-owes",
      email: "god@example.com",
      displayName: "Nia Owes",
    });
    await page.goto("/"); // lazily creates the row and its pending gate
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);

    await asRank(page, request, "roster-chaser", "captain");
    await page.goto("/captains/camp-management");
    await expect(
      page.getByRole("heading", { name: "Camp management" }),
    ).toBeVisible();

    // The table (desktop) and the card list (phone) both render every row, so
    // take whichever copy this viewport shows.
    await page
      .getByRole("button", { name: "Open Nia Owes's profile" })
      .filter({ visible: true })
      .click();
    const panel = page.getByRole("region", { name: "Nia Owes profile" });
    const outstanding = panel.locator(
      'xpath=.//dt[normalize-space()="Outstanding"]/following-sibling::dd[1]',
    );
    await expect(outstanding).toHaveText("Burner profile");
  });
});
