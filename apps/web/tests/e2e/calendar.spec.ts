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
  setRank,
} from "./_helpers";

// The camp calendar, part 2 (test-mode, where the store stands in for a
// connected Google Calendar that starts empty). Captains and team leads add
// events from Home's "Add event" tile, a lead only for a team they lead; Home's
// "Coming up" marks the viewer's own team's events as theirs, gives another
// team's event a plain team badge, and leaves a whole-camp event unmarked.

/** A week from now, as the camp's day (YYYY-MM-DD). */
const NEXT_WEEK = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Johannesburg",
}).format(new Date(Date.now() + 7 * 86_400_000));

async function approvedMember(
  page: Page,
  request: APIRequestContext,
  id: string,
  displayName: string,
) {
  await login(page, { id, email: `${id}@example.com`, displayName });
  await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(request, id);
}

/** Home's "Coming up" row for an event, once Home has painted. */
async function comingUp(page: Page, title: string) {
  await page.goto("/");
  const list = page.getByRole("list", { name: "Coming up" });
  const row = list.getByRole("listitem").filter({ hasText: title });
  await expect(row).toBeVisible();
  return row;
}

async function fillEvent(
  page: Page,
  input: { title: string; start?: string; end?: string },
) {
  await expect(
    page.getByRole("heading", { level: 1, name: "Add an event" }),
  ).toBeVisible();
  await page.getByLabel("Title").fill(input.title);
  await page.getByLabel("Date").fill(NEXT_WEEK);
  if (input.start && input.end) {
    await page.getByLabel("Starts").fill(input.start);
    await page.getByLabel("Ends").fill(input.end);
  } else {
    await page.getByRole("switch", { name: "All day" }).click();
    await expect(page.getByLabel("Starts")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Add event" }).click();
  await expect(page.getByText("Event added")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
}

test.describe("camp calendar (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a lead adds a Kitchen event: Kitchen sees it as theirs, Finance as Kitchen's", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "cal-cook", "Kitchen Crew");
    await seedTeam(request, "cal-cook", "kitchen");
    await approvedMember(page, request, "cal-money", "Finance Crew");
    await seedTeam(request, "cal-money", "finance");
    await approvedMember(page, request, "cal-lead", "Kitchen Lead");
    await seedTeam(request, "cal-lead", "kitchen", true);

    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Your modules" })
      .getByRole("link", { name: /Add event/ })
      .click();
    await expect(page).toHaveURL(/\/captains\/calendar$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Add an event" }),
    ).toBeVisible();

    // A lead may pick only the team they lead: no whole camp, no other team.
    await page.locator("#event-team").click();
    await expect(page.getByRole("option")).toHaveText(["Kitchen"]);
    await page.getByRole("option", { name: "Kitchen" }).click();
    await fillEvent(page, {
      title: "Kitchen briefing",
      start: "18:00",
      end: "19:30",
    });

    await login(page, { id: "cal-cook", email: "cal-cook@example.com" });
    const mine = await comingUp(page, "Kitchen briefing");
    await expect(mine.getByText("Yours · Kitchen")).toBeVisible();
    await expect(mine.getByText("In 7 days")).toBeVisible();
    await expect(mine.getByText(/· 18:00$/)).toBeVisible();

    await login(page, { id: "cal-money", email: "cal-money@example.com" });
    const theirs = await comingUp(page, "Kitchen briefing");
    await expect(theirs.getByText("Kitchen", { exact: true })).toBeVisible();
    await expect(theirs.getByText(/Yours/)).toHaveCount(0);
  });

  test("a captain adds an all-day event for the whole camp, which wears no badge", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "cal-crew", "Kitchen Crew");
    await seedTeam(request, "cal-crew", "kitchen");

    await login(page, {
      id: "cal-cap",
      email: "god@example.com",
      displayName: "Cap Tain",
    });
    await page.goto("/");
    await completeOnboarding(request, "cal-cap");
    await setRank(request, "cal-cap", "captain");

    await page.goto("/captains/calendar");
    await expect(page.locator("#event-team")).toHaveText("Whole camp");
    await fillEvent(page, { title: "Build day" });

    await login(page, { id: "cal-crew", email: "cal-crew@example.com" });
    const row = await comingUp(page, "Build day");
    await expect(row.getByText("In 7 days")).toBeVisible();
    await expect(row.getByText(/Yours/)).toHaveCount(0);
    await expect(row.getByText("Kitchen", { exact: true })).toHaveCount(0);
  });

  test("a plain member sees the lock on the add-event page", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "cal-plain", "Plain Member");
    await seedTeam(request, "cal-plain", "kitchen");

    await page.goto("/");
    await expect(
      page
        .getByRole("navigation", { name: "Your modules" })
        .getByRole("link", { name: /My forms/ }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Your modules" })
        .getByRole("link", { name: /Add event/ }),
    ).toHaveCount(0);

    await page.goto("/captains/calendar");
    await expect(
      page.getByRole("heading", { level: 1, name: "Add an event" }),
    ).toBeVisible();
    await expect(page.getByText("Team leads and captains only")).toBeVisible();
    await expect(page.locator("#event-team")).toHaveCount(0);
  });
});
