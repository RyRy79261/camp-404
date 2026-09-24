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

// A team's own page (test-mode): any approved member opens any team's page
// and reads its leads and members this year, its upcoming events and its open
// tasks. Read-only: nothing on it adds or changes anything.

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

async function pick(page: Page, trigger: string, option: string) {
  await page.locator(trigger).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test.describe("team page (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("any member reads a team's people, events and open tasks; its members arrive from Home", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "team-cook", "Kitchen Crew");
    await seedTeam(request, "team-cook", "kitchen");
    await approvedMember(page, request, "team-money", "Finance Crew");
    await seedTeam(request, "team-money", "finance");
    await approvedMember(page, request, "team-lead", "Kitchen Lead");
    await seedTeam(request, "team-lead", "kitchen", true);

    // The lead puts a task and an event on the Kitchen's name.
    await page.goto("/tasks");
    await page.getByRole("button", { name: "Add task" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill("Buy the gas");
    await pick(page, "#task-team", "Kitchen");
    await pick(page, "#task-assignee", "Kitchen Crew");
    await dialog.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText("Task added")).toBeVisible();

    await page.goto("/captains/calendar");
    await pick(page, "#event-team", "Kitchen");
    await page.getByLabel("Title").fill("Kitchen briefing");
    await page.getByLabel("Date").fill(NEXT_WEEK);
    await page.getByLabel("Starts").fill("18:00");
    await page.getByLabel("Ends").fill("19:30");
    await page.getByRole("button", { name: "Add event" }).click();
    await expect(page.getByText("Event added")).toBeVisible();

    // Someone from another team opens the Kitchen's page.
    await login(page, { id: "team-money", email: "team-money@example.com" });
    await page.goto("/teams/kitchen");
    await expect(
      page.getByRole("heading", { level: 1, name: "Kitchen" }),
    ).toBeVisible();
    const leads = page.getByRole("list", { name: "Lead" });
    await expect(leads.getByText("Kitchen Lead")).toBeVisible();
    const members = page.getByRole("list", { name: "Members" });
    await expect(members.getByText("Kitchen Crew")).toBeVisible();
    await expect(members.getByText("Finance Crew")).toHaveCount(0);
    await expect(page.getByText("2 people")).toBeVisible();

    const events = page.getByRole("list", { name: "Team events" });
    await expect(events.getByText("Kitchen briefing")).toBeVisible();
    await expect(events.getByText(/^18:00/)).toBeVisible();

    const tasks = page.getByRole("list", { name: "Open tasks" });
    await expect(tasks.getByText("Buy the gas")).toBeVisible();
    await expect(tasks.getByText("Kitchen Crew")).toBeVisible();

    // Not their team, and a read-only page: no controls to add or change.
    await expect(page.getByText(/on this team|lead this team/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Add/ })).toHaveCount(0);

    // A member of the team arrives from Home's team icon.
    await login(page, { id: "team-cook", email: "team-cook@example.com" });
    await page.goto("/");
    await page.getByRole("link", { name: "Kitchen", exact: true }).click();
    await expect(page).toHaveURL(/\/teams\/kitchen$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Kitchen" }),
    ).toBeVisible();
    await expect(page.getByText("You’re on this team")).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Open tasks" }).getByText("(you)"),
    ).toBeVisible();

    // Its events are a link from the full calendar, filtered to the team.
    await page
      .getByRole("link", { name: "See this team on the calendar" })
      .click();
    await expect(page).toHaveURL(/\/calendar\?team=kitchen$/);
    await expect(page.getByText("Kitchen briefing")).toBeVisible();
  });

  test("a team nobody is on says so, and a team that does not exist is not a page", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "team-solo", "Solo");

    await page.goto("/teams/structures");
    await expect(
      page.getByRole("heading", { level: 1, name: "Structures" }),
    ).toBeVisible();
    await expect(page.getByText("Nobody leads this team yet.")).toBeVisible();
    await expect(
      page.getByText("Nobody is on this team yet this year."),
    ).toBeVisible();
    await expect(page.getByText("No open tasks for this team.")).toBeVisible();

    const res = await page.goto("/teams/moon");
    expect(res?.status()).toBe(404);
  });
});
