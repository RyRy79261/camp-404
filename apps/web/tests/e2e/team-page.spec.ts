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
import { goViaConsoleNav } from "./lib/console-nav";

// A team's own page (test-mode): any approved member opens any team's page
// and reads its leads and members this year, its upcoming events and its open
// tasks. Read-only for them; the team's lead starts a task and an
// announcement from it, each already on the team.

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

    // The lead puts a task on the Kitchen's name from its page: the board
    // opens on the Kitchen with the form already on the team.
    await page.goto("/teams/kitchen");
    await expect(
      page.getByRole("heading", { level: 1, name: "Kitchen" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Add task" }).click();
    await expect(page).toHaveURL(/\/tasks\?team=kitchen&add=1$/);
    const dialog = page.getByRole("dialog", { name: "Add a task" });
    await expect(dialog.getByRole("combobox", { name: "Team" })).toHaveText(
      "Kitchen",
    );
    await dialog.getByLabel("Title").fill("Buy the gas");
    await pick(page, "#task-assignee", "Kitchen Crew");
    await dialog.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText("Task added")).toBeVisible();

    // Write announcement opens the composer on the Kitchen.
    await page.goto("/teams/kitchen");
    await page.getByRole("link", { name: "Write announcement" }).click();
    await expect(page).toHaveURL(
      /\/captains\/announcements\?audience=team%3Akitchen$/,
    );
    await expect(page.locator("#announcement-audience")).toHaveText("Kitchen");

    // The lead adds a Kitchen event in the Calendar.
    await page.goto(`/calendar?new=${NEXT_WEEK}`);
    const form = page.getByRole("form", { name: "New event" });
    await pick(page, "#event-team", "Kitchen");
    await form.getByLabel("Title").fill("Kitchen briefing");
    await form.getByLabel("Starts").fill("18:00");
    await form.getByLabel("Ends").fill("19:30");
    await form.getByRole("button", { name: "Add to the calendar" }).click();
    await expect(page.getByText("Added to the calendar")).toBeVisible();

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
    await expect(tasks.getByText("To do · Kitchen Crew")).toBeVisible();
    await expect(tasks.getByText("No deadline")).toBeVisible();

    // Not their team, and a read-only page: no controls to add or change,
    // and no claim (a claim is for money spent for the team).
    await expect(page.getByText(/on this team|lead this team/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Add/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Add task" })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Write announcement" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Claim money back" }),
    ).toHaveCount(0);

    // A member of the team arrives from their team's folder on the desktop.
    await login(page, { id: "team-cook", email: "team-cook@example.com" });
    await page.goto("/");
    await goViaConsoleNav(page, "Kitchen page", "Kitchen team");
    await expect(page).toHaveURL(/\/teams\/kitchen$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Kitchen" }),
    ).toBeVisible();
    await expect(page.getByText("You’re on this team")).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Open tasks" }).getByText("(you)"),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Claim money back" }),
    ).toHaveAttribute("href", "/claims?team=kitchen");

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
