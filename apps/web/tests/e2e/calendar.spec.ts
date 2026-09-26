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
import {
  closeConsoleNav,
  goViaConsoleNav,
  navEntry,
  openConsoleNav,
  openToday,
} from "./lib/console-nav";

// The camp calendar, part 2 (test-mode, where the store stands in for a
// connected Google Calendar that starts empty). Captains and team leads add
// events from the New event program in their Captains folder, a lead only for
// a team they lead; the Today gadget's "Coming up" marks the viewer's own team's events as theirs, gives another
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

/** Today's "Coming up" row for an event, once the gadget is open. */
async function comingUp(page: Page, title: string) {
  await page.goto("/");
  const today = await openToday(page);
  const list = today.getByRole("list", { name: "Coming up" });
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
    await goViaConsoleNav(page, "New event", "Captains");
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
    // One of your teams' events: a border and a star, and the plain badge.
    await expect(mine.getByText("Kitchen", { exact: true })).toBeVisible();
    await expect(mine.locator("[data-mine]")).toHaveCount(1);
    await expect(mine.locator("svg.lucide-star")).toHaveCount(1);
    await expect(mine.getByText(/Yours/)).toHaveCount(0);
    await expect(mine.getByText("In 7 days")).toBeVisible();
    await expect(mine.getByText(/· 18:00$/)).toBeVisible();

    await login(page, { id: "cal-money", email: "cal-money@example.com" });
    const theirs = await comingUp(page, "Kitchen briefing");
    await expect(theirs.getByText("Kitchen", { exact: true })).toBeVisible();
    await expect(theirs.locator("[data-mine]")).toHaveCount(0);
    await expect(theirs.locator("svg.lucide-star")).toHaveCount(0);
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
    await expect(row.locator("[data-mine]")).toHaveCount(0);
    await expect(row.getByText("Kitchen", { exact: true })).toHaveCount(0);
  });

  test("a lead whose only led team is archived gets a sentence, not an empty picker", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "cal-water", "Water Lead");
    await seedTeam(request, "cal-water", "water", true);

    // While Water is active, the lead may add for it.
    await page.goto("/captains/calendar");
    await expect(
      page.getByRole("heading", { level: 1, name: "Add an event" }),
    ).toBeVisible();
    await expect(page.locator("#event-team")).toBeVisible();

    // A captain archives Water.
    await login(page, { id: "cal-archiver", email: "god@example.com" });
    await page.goto("/");
    await completeOnboarding(request, "cal-archiver");
    await setRank(request, "cal-archiver", "captain");
    await page.goto("/captains/camp-settings");
    const active = page.getByRole("switch", { name: "Water active" });
    await active.click();
    await expect(active).not.toBeChecked();

    await login(page, { id: "cal-water", email: "cal-water@example.com" });
    await page.goto("/captains/calendar");
    await expect(
      page.getByRole("heading", { level: 1, name: "Add an event" }),
    ).toBeVisible();
    await expect(
      page.getByText("The teams you lead are archived this year"),
    ).toBeVisible();
    await expect(page.locator("#event-team")).toHaveCount(0);
    await expect(page.getByText("Team leads and captains only")).toHaveCount(0);
  });

  test("a plain member sees the lock on the add-event page", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "cal-plain", "Plain Member");
    await seedTeam(request, "cal-plain", "kitchen");

    await page.goto("/");
    // Present first: the member's own programs. No New event among them, and
    // no Captains folder to hold one.
    const programs = await openConsoleNav(page);
    await expect(navEntry(programs, "My forms")).toBeVisible();
    await expect(navEntry(programs, "Captains")).toHaveCount(0);
    await expect(navEntry(programs, "New event")).toHaveCount(0);
    await closeConsoleNav(page);

    await page.goto("/captains/calendar");
    await expect(
      page.getByRole("heading", { level: 1, name: "Add an event" }),
    ).toBeVisible();
    await expect(page.getByText("Team leads and captains only")).toBeVisible();
    await expect(page.locator("#event-team")).toHaveCount(0);
  });

  test("the Calendar page lists events by day, filters by team, and opens a team's page", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "cal-money", "Finance Crew");
    await seedTeam(request, "cal-money", "finance");
    await approvedMember(page, request, "cal-lead", "Kitchen Lead");
    await seedTeam(request, "cal-lead", "kitchen", true);

    // The lead adds a Kitchen event: Google would hold it as "Kitchen Team -
    // Kitchen briefing" (the store keeps it the same way).
    await page.goto("/captains/calendar");
    await page.locator("#event-team").click();
    await page.getByRole("option", { name: "Kitchen" }).click();
    await expect(
      page.getByText("Google Calendar shows it as “Kitchen Team - …”."),
    ).toBeVisible();
    // The preview says whose view it is: the team's, with its border and star.
    await expect(
      page.getByText("Preview — how the Kitchen team sees it on Home"),
    ).toBeVisible();
    await fillEvent(page, {
      title: "Kitchen briefing",
      start: "18:00",
      end: "19:30",
    });

    await login(page, {
      id: "cal-cap",
      email: "god@example.com",
      displayName: "Cap Tain",
    });
    await page.goto("/");
    await completeOnboarding(request, "cal-cap");
    await setRank(request, "cal-cap", "captain");
    await page.goto("/captains/calendar");
    await fillEvent(page, { title: "Build day" });

    // Any member reaches the calendar from the nav.
    await login(page, { id: "cal-money", email: "cal-money@example.com" });
    await page.goto("/");
    await goViaConsoleNav(page, "Calendar");
    await expect(page).toHaveURL(/\/calendar$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Calendar" }),
    ).toBeVisible();
    // A plain member adds nothing here.
    await expect(page.getByRole("link", { name: "Add event" })).toHaveCount(0);

    // Both events sit under the same day, the team's with its badge, the
    // title without the team's prefix.
    const day = page.getByRole("list").filter({ hasText: "Kitchen briefing" });
    await expect(day.getByText("Build day")).toBeVisible();
    await expect(day.getByText("All day")).toBeVisible();
    await expect(day.getByText("18:00")).toBeVisible();
    await expect(day.getByText("Kitchen Team - Kitchen briefing")).toHaveCount(
      0,
    );

    // The filter keeps one team's events.
    await page.locator("#calendar-filter-team").click();
    await page.getByRole("option", { name: "Kitchen", exact: true }).click();
    await expect(page).toHaveURL(/\/calendar\?team=kitchen$/);
    await expect(page.getByText("Kitchen briefing")).toBeVisible();
    await expect(page.getByText("Build day")).toHaveCount(0);

    await page.locator("#calendar-filter-team").click();
    await page.getByRole("option", { name: "Whole camp" }).click();
    await expect(page).toHaveURL(/\/calendar\?team=camp$/);
    await expect(page.getByText("Build day")).toBeVisible();
    await expect(page.getByText("Kitchen briefing")).toHaveCount(0);

    await page.locator("#calendar-filter-team").click();
    await page.getByRole("option", { name: "Finance", exact: true }).click();
    await expect(page.getByText("No Finance events coming up.")).toBeVisible();

    // A team's badge opens that team's page.
    await page.goto("/calendar");
    await page.getByRole("link", { name: "Kitchen", exact: true }).click();
    await expect(page).toHaveURL(/\/teams\/kitchen$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Kitchen" }),
    ).toBeVisible();
  });

  test("a lead sees Add event on the Calendar page", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "cal-lead", "Kitchen Lead");
    await seedTeam(request, "cal-lead", "kitchen", true);

    await page.goto("/calendar");
    await expect(
      page.getByRole("heading", { level: 1, name: "Calendar" }),
    ).toBeVisible();
    await expect(
      page.getByText("Nothing on the calendar for the year ahead."),
    ).toBeVisible();
    await page.getByRole("link", { name: "Add event" }).click();
    await expect(page).toHaveURL(/\/captains\/calendar$/);
  });
});
