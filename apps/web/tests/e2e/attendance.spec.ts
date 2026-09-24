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
  seedTeam,
  setRank,
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

    // The form reads back the Maybe they gave, not the captain's Accept.
    await page.goto("/tools/forms/attendance");
    await expect(
      page.getByRole("heading", { level: 1, name: "Coming this year?" }),
    ).toBeVisible();
    await expect(page.getByRole("radio", { name: "Maybe" })).toBeChecked();
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

// The captain's side: the roster's "This year" column, filter and one-tap
// Accept / Waiting list, and the Overview's count. A team lead sees the column
// read-only; a plain member does not get it at all (the server leaves the
// status off their rows).

/**
 * A camp user through the god email (clears access and approval), onboarded
 * and at `rank`. The last one signed in is the one the page sees.
 */
async function person(
  page: Page,
  request: APIRequestContext,
  id: string,
  displayName: string,
  rank: "captain" | "member" = "member",
) {
  await login(page, { id, email: "god@example.com", displayName });
  await page.goto("/"); // lazily creates the camp user row
  await completeOnboarding(request, id);
  await setRank(request, id, rank);
}

/**
 * One member's row on the roster, in whichever copy this viewport shows: the
 * table (desktop) and the card list (phone) both render every row.
 */
function rosterRow(page: Page, name: string) {
  return page
    .locator("tr, li")
    .filter({
      has: page.getByRole("button", { name: `Open ${name}'s profile` }),
    })
    .filter({ visible: true });
}

async function openRoster(page: Page) {
  await page.goto("/captains/camp-management");
  await expect(
    page.getByRole("heading", { level: 1, name: "Camp management" }),
  ).toBeVisible();
}

test.describe("attendance: the captains' roster and overview", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetTestState(request);
    // A said Yes, B said Maybe; both are approved members.
    await person(page, request, "yes-member", "Ada Yes");
    await seedParticipation(request, "yes-member", "applied");
    await person(page, request, "maybe-member", "Ben Maybe");
    await seedParticipation(request, "maybe-member", "maybe");
  });

  test("a captain filters by this year, accepts in one tap, and the overview counts it", async ({
    page,
    request,
  }) => {
    await person(page, request, "year-captain", "Cy Captain", "captain");
    await openRoster(page);
    await expect(
      rosterRow(page, "Ada Yes").getByText("Coming", { exact: true }),
    ).toBeVisible();

    // Only the Maybes.
    const filter = page.getByRole("combobox", { name: "This year" });
    await filter.selectOption({ label: "Maybe" });
    await expect(rosterRow(page, "Ben Maybe")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open Ada Yes's profile" }),
    ).toHaveCount(0);

    // Everyone again, and Ada gets a place, from the keyboard.
    await filter.selectOption({ label: "Any" });
    const accept = page
      .getByRole("button", { name: "Accept Ada Yes for this year" })
      .filter({ visible: true });
    await accept.focus();
    await page.keyboard.press("Enter");
    await expect(
      rosterRow(page, "Ada Yes").getByText("Accepted", { exact: true }),
    ).toBeVisible();
    // The Accept button is gone; focus moved to the row's other button
    // instead of falling to <body>.
    await expect(
      page
        .getByRole("button", { name: "Put Ada Yes on the waiting list" })
        .filter({ visible: true }),
    ).toBeFocused();
    // Accepted is a place: no Accept left, the waiting list still offered.
    await expect(
      page
        .getByRole("button", { name: "Accept Ada Yes for this year" })
        .filter({ visible: true }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("button", { name: "Put Ada Yes on the waiting list" })
        .filter({ visible: true }),
    ).toBeVisible();

    await page.goto("/captains/overview");
    const card = page.getByRole("article", { name: "This year" });
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("listitem").filter({ hasText: "Accepted" }),
    ).toHaveText(/^Accepted\s*1$/);
    await expect(
      card.getByRole("listitem").filter({ hasText: "Maybe" }),
    ).toHaveText(/^Maybe\s*1$/);
  });

  test("a team lead sees who is coming, and cannot decide it", async ({
    page,
    request,
  }) => {
    await person(page, request, "year-lead", "Lu Lead");
    await seedTeam(request, "year-lead", "kitchen", true);
    await openRoster(page);

    await expect(
      rosterRow(page, "Ada Yes").getByText("Coming", { exact: true }),
    ).toBeVisible();
    await expect(
      rosterRow(page, "Ben Maybe").getByText("Maybe", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("This year", { exact: true }).filter({ visible: true }),
    ).not.toHaveCount(0);
    // Read-only: no decision, and no captain filter.
    await expect(
      page.getByRole("button", { name: /for this year$/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /on the waiting list$/ }),
    ).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "This year" })).toHaveCount(
      0,
    );
  });

  test("a plain member gets no This year column at all", async ({
    page,
    request,
  }) => {
    await person(page, request, "year-member", "Mo Member");
    await openRoster(page);

    // Present first, so the absences below are about a painted roster.
    await expect(rosterRow(page, "Ada Yes")).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "This year" }),
    ).toHaveCount(0);
    await expect(page.getByText("This year", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Coming", { exact: true })).toHaveCount(0);
  });
});
