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
import { navEntry, openConsoleNav } from "./lib/console-nav";

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

  test("a lead gets the Questionnaires tool and the builder, and a lock on the rest", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "kitchen-lead");
    await seedTeam(request, "kitchen-lead", "kitchen", true);

    // The console nav offers a lead the builder and announcements, and none
    // of the captain-only destinations.
    await page.goto("/");
    const captains = await openConsoleNav(page, "Captains");
    await expect(navEntry(captains, "Questionnaires")).toHaveAttribute(
      "href",
      "/captains/questionnaires",
    );
    await expect(navEntry(captains, "Announcements")).toBeVisible();
    await expect(navEntry(captains, "Payments")).toHaveCount(0);
    await expect(navEntry(captains, "Audit")).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.goto("/captains/questionnaires");
    await expect(
      page.getByRole("heading", { level: 1, name: "Questionnaires" }),
    ).toBeVisible();
    await expect(page.getByText("No questionnaires yet")).toBeVisible();
    await expect(page.getByText(/is for team leads and captains/)).toHaveCount(
      0,
    );
  });

  test("a member on a team who does not lead it stays locked out of the builder", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "kitchen-hand");
    await seedTeam(request, "kitchen-hand", "kitchen", false);

    await page.goto("/captains/questionnaires");
    await expect(
      page.getByText(
        /The questionnaire builder is for team leads and captains/,
      ),
    ).toBeVisible();
    await expect(page.getByText("No questionnaires yet")).toHaveCount(0);
  });
});
