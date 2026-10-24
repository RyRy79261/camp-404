import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
  seedTeam,
} from "./_helpers";
import { closeConsoleNav, navEntry, openConsoleNav } from "./lib/console-nav";

// The team-lead persona end to end. Clearance to author is global once a
// member leads any team this year (owner's call, 2026-09-16); a member on a
// team without leading it stays a plain member.

async function approvedMember(
  page: Page,
  request: APIRequestContext,
  id: string,
) {
  await login(page, { id, email: `${id}@example.com`, displayName: id });
  await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(request, id);
}

test.describe("team lead persona", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a lead gets the lead tools, and makes questionnaires from the Camp's list", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "kitchen-lead");
    await seedTeam(request, "kitchen-lead", "kitchen", true);

    // The Captains folder offers a lead announcements, and none of the
    // captain-only programs.
    await page.goto("/");
    const captains = await openConsoleNav(page, "Captains");
    await expect(navEntry(captains, "Announcements")).toBeVisible();
    await expect(navEntry(captains, "Payments")).toHaveCount(0);
    await expect(navEntry(captains, "Audit log")).toHaveCount(0);
    await closeConsoleNav(page);

    // Questionnaires is every member's program now (owner, 2026-10-23).
    const camp = await openConsoleNav(page, "Camp");
    await navEntry(camp, "Questionnaires").click();
    await expect(page).toHaveURL("/captains/questionnaires");
    await expect(
      page.getByRole("heading", { level: 1, name: "Questionnaires" }),
    ).toBeVisible();
    await expect(page.getByText("No questionnaires yet")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New questionnaire" }).first(),
    ).toBeVisible();
  });

  test("a member on a team who does not lead it sees the list, but cannot make one", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "kitchen-hand");
    await seedTeam(request, "kitchen-hand", "kitchen", false);

    await page.goto("/captains/questionnaires");
    await expect(
      page.getByRole("heading", { level: 1, name: "Questionnaires" }),
    ).toBeVisible();
    await expect(page.getByText("No questionnaires yet")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New questionnaire" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Build a questionnaire" }),
    ).toHaveCount(0);
  });
});
