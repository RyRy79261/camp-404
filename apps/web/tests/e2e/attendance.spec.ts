import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import type { ParticipationStatus } from "@camp404/types";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
  seedParticipation,
} from "./_helpers";

// The member's side of "Coming this year?" (test-mode, on the store's
// participations twin). Their profile says where they stand in their own
// words, and My forms lets them change their Yes / Maybe / No. A Yes or a
// Maybe never costs an accepted member their place.
//
// The captains' questionnaire that first asks has no cover here: the test
// store models no questionnaire builder, so its send and submit are covered by
// the unit and PGlite tests. A spec seeds the answer instead.

async function approvedMember(
  page: Page,
  request: APIRequestContext,
  id: string,
) {
  await login(page, { id, email: `${id}@example.com`, displayName: "Nova" });
  await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(request, id);
  const approved = await request.post("/api/test/set-approval", {
    data: { authUserId: id, status: "approved" },
  });
  expect(approved.ok()).toBeTruthy();
}

/** The profile's "This year" card, once the page has painted. */
async function thisYear(page: Page) {
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { level: 1, name: "Your profile" }),
  ).toBeVisible();
  const heading = page.getByRole("heading", { name: "This year" });
  await expect(heading).toBeVisible();
  return heading;
}

/** Open the "Coming this year?" form from My forms and save an answer. */
async function answer(page: Page, choice: string) {
  await page.goto("/tools/forms");
  await expect(
    page.getByRole("heading", { level: 1, name: "My forms" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Coming this year\?/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Coming this year?" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: choice }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved." }),
  ).toBeVisible();
}

async function seeded(
  page: Page,
  request: APIRequestContext,
  id: string,
  status: ParticipationStatus,
) {
  await approvedMember(page, request, id);
  await seedParticipation(request, id, status);
}

test.describe("attendance: the member's own answer", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a Maybe changes to Yes from My forms, and the profile says so", async ({
    page,
    request,
  }) => {
    await seeded(page, request, "maybe-member", "maybe");

    await thisYear(page);
    await expect(
      page.getByText("You said maybe.", { exact: true }),
    ).toBeVisible();

    await answer(page, "Yes, I'm coming");

    await thisYear(page);
    await expect(
      page.getByText(
        "You said you're coming. The captains haven't confirmed places yet.",
        { exact: true },
      ),
    ).toBeVisible();
  });

  test("an accepted member who answers Maybe keeps their place", async ({
    page,
    request,
  }) => {
    await seeded(page, request, "accepted-member", "accepted");

    await page.goto("/tools/forms/attendance");
    // A member who holds a place is told what a change would cost.
    await expect(
      page.getByText(
        "You have a place this year. Choosing No gives it up; Maybe keeps it.",
      ),
    ).toBeVisible();

    await answer(page, "Maybe");

    await thisYear(page);
    await expect(
      page.getByText("You have a place at camp this year.", { exact: true }),
    ).toBeVisible();
  });

  test("a member who hasn't answered is told so, with nothing to change", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "quiet-member");

    await thisYear(page);
    await expect(
      page.getByText("You haven't told us yet.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Change your answer" }),
    ).toHaveCount(0);
  });
});
