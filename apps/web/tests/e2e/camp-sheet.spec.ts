import { test, expect } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
  seedParticipation,
  seedTeam,
  setRank,
} from "./_helpers";
import { goViaConsoleNav, navEntry, openConsoleNav } from "./lib/console-nav";

// The captains' Camp sheet: every member and everything the camp holds on
// them, on one screen. A captain opens it from the Captains folder and reads a
// member's emergency contact in the formula bar; a team lead is not offered
// it, and a member who opens the address gets the heading and a lock, with no
// member's data. Against the in-memory test store, whose twin holds the
// emergency contacts a test member gave.

test.describe("Camp sheet (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a captain opens it from the Captains folder and reads a member's line", async ({
    page,
    request,
  }) => {
    // A member who gave an emergency contact and is accepted this year.
    await login(page, {
      id: "sheet-jess",
      email: "jess@example.com",
      displayName: "Jess Naidoo",
    });
    await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
    await completeOnboarding(request, "sheet-jess", {
      country: "ZA",
      emergencyContacts: [
        { name: "Sam Naidoo", phone: "082 555 0101", relationship: "Brother" },
      ],
    });
    await seedParticipation(request, "sheet-jess", "accepted");

    await login(page, {
      id: "sheet-captain",
      email: "god@example.com",
      displayName: "Captain Jo",
    });
    await page.goto("/");
    await completeOnboarding(request, "sheet-captain");
    await setRank(request, "sheet-captain", "captain");

    await page.goto("/");
    await goViaConsoleNav(page, "Camp sheet", "Captains");
    await expect(page).toHaveURL("/captains/camp-sheet");
    await expect(
      page.getByRole("heading", { level: 1, name: "Camp sheet" }),
    ).toBeVisible();

    const grid = page.getByRole("grid", { name: "Camp sheet" });
    await expect(
      grid.getByRole("rowheader", { name: "Jess Naidoo" }),
    ).toBeVisible();
    await expect(page.getByText(/^\d+ of \d+ people$/)).toBeVisible();

    const contact = grid.getByRole("gridcell", {
      name: "Sam Naidoo (Brother), 082 555 0101",
    });
    await contact.click();
    const bar = page.getByRole("region", { name: "Selected cell" });
    await expect(bar).toContainText("Emergency contact 1");
    await expect(bar).toContainText("Jess Naidoo");
    await expect(bar).toContainText("Sam Naidoo (Brother), 082 555 0101");

    // The search narrows to whoever matches anywhere on their line.
    await page.getByLabel("Search the sheet").fill("082 555 0101");
    await expect(grid.getByRole("rowheader")).toHaveCount(1);
  });

  test("a team lead is not offered it, and a member gets a lock and no data", async ({
    page,
    request,
  }) => {
    await login(page, { id: "sheet-lead", email: "god@example.com" });
    await page.goto("/");
    await completeOnboarding(request, "sheet-lead");
    await setRank(request, "sheet-lead", "member");
    await seedTeam(request, "sheet-lead", "kitchen", true);

    await page.goto("/");
    const captains = await openConsoleNav(page, "Captains");
    // Something the lead does get, before the absence.
    await expect(navEntry(captains, "Questionnaires")).toBeVisible();
    await expect(navEntry(captains, "Camp sheet")).toHaveCount(0);

    await page.goto("/captains/camp-sheet");
    await expect(
      page.getByRole("heading", { level: 1, name: "Camp sheet" }),
    ).toBeVisible();
    await expect(page.getByText(/camp sheet is captain-only/)).toBeVisible();
    await expect(page.getByRole("grid", { name: "Camp sheet" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Export CSV/ })).toHaveCount(0);
  });
});
