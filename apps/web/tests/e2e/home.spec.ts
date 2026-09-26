import { test, expect, type Page } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
  seedLift,
  setRank,
} from "./_helpers";
import {
  closeConsoleNav,
  expectDesktop,
  goViaConsoleNav,
  navEntry,
  openConsoleNav,
  openToday,
} from "./lib/console-nav";

/** The camp day (UTC+2, no daylight saving) `days` from now, as YYYY-MM-DD. */
function campDayFromNow(days: number): string {
  return new Date(Date.now() + 2 * 3_600_000 + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function pick(page: Page, trigger: string, option: string) {
  await page.locator(trigger).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test.describe("unauthenticated home page", () => {
  test("renders branding and the single auth CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Camp 404" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Are you lost?" }),
    ).toHaveAttribute("href", "/auth/sign-in");
  });

  test("the lost link lands on the sign-in screen", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Are you lost?" }).click();
    await expect(page).toHaveURL(/\/auth\/sign-in$/);
  });
});

// A signed-in member's own Home: to-dos, what's coming, their places — and
// nothing that is not theirs (owner, 2026-09-23). Home is the 404 OS desktop
// now (PR C): its programs are the icons, the Start menu and, on a phone, the
// home screen; the member's summary is the Today gadget, closed until opened.
test.describe("a member's own home", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("an approved member sees their page, not the camp's", async ({
    page,
    request,
  }) => {
    await login(page, {
      id: "home-member",
      email: "god@example.com",
      displayName: "Nova Reyes",
    });
    await page.goto("/");
    await completeOnboarding(request, "home-member");
    await setRank(request, "home-member", "member");

    await page.goto("/");
    await expectDesktop(page);
    // The member's programs: present first, then the captain's absent.
    const programs = await openConsoleNav(page);
    await expect(navEntry(programs, "Inbox")).toBeVisible();
    await expect(navEntry(programs, "My forms")).toBeVisible();
    // Camp overview lives only in the Captains folder, which the Start menu
    // lists as one entry: its absence is what differs by rank (a captain's
    // menu has it, below).
    await expect(navEntry(programs, "Captains")).toHaveCount(0);
    await closeConsoleNav(page);

    const today = await openToday(page);
    await expect(
      today.getByRole("heading", { level: 2, name: /^Today · / }),
    ).toBeVisible();
    await expect(today.getByText("Nothing waiting on you.")).toBeVisible();
    // The e2e store stands in for a connected calendar that starts empty.
    // The "not connected" wording is covered by unit tests.
    await expect(today.getByText("Nothing on the calendar yet.")).toBeVisible();
    // The whole-camp board is a captain's, and is not here.
    await expect(page.getByText("Is camp ready?")).toHaveCount(0);
  });

  test("a driver sees their car, and a rider their seat (getMyLift's twin)", async ({
    page,
    request,
  }) => {
    // The rider's row must exist before the driver's car can seat them.
    await login(page, {
      id: "home-rider",
      email: "god@example.com",
      displayName: "Ren Rider",
    });
    await page.goto("/");
    await completeOnboarding(request, "home-rider");
    await setRank(request, "home-rider", "member");
    await login(page, {
      id: "home-driver",
      email: "god@example.com",
      displayName: "Ada Driver",
    });
    await page.goto("/");
    await completeOnboarding(request, "home-driver");
    await setRank(request, "home-driver", "member");
    await seedLift(request, "home-driver", {
      role: "driver",
      vehicleMake: "Toyota",
      vehicleModel: "Hilux",
      seatsOffered: 3,
      departureCity: "Cape Town",
    });
    await seedLift(request, "home-rider", {
      role: "rider",
      driverAuthUserId: "home-driver",
    });

    await page.goto("/");
    const driverToday = await openToday(page);
    await expect(
      driverToday.getByRole("heading", { level: 2, name: /^Today · / }),
    ).toBeVisible();
    await expect(driverToday.getByText("You're driving")).toBeVisible();
    await expect(driverToday.getByText("Toyota Hilux")).toBeVisible();
    await expect(driverToday.getByText("With Ren Rider")).toBeVisible();

    // The My lift program's page shows the same card.
    await page.goto("/lift");
    await expect(
      page.getByRole("heading", { level: 1, name: "My lift" }),
    ).toBeVisible();
    // In the program's window: Today, left open, shows the same line.
    await expect(
      page.locator("#os-window-content").getByText("1 of 3 seats taken"),
    ).toBeVisible();

    await login(page, {
      id: "home-rider",
      email: "god@example.com",
      displayName: "Ren Rider",
    });
    await page.goto("/");
    const riderToday = await openToday(page);
    await expect(
      riderToday.getByRole("heading", { level: 2, name: /^Today · / }),
    ).toBeVisible();
    await expect(riderToday.getByText("Riding with Ada Driver")).toBeVisible();
  });

  test("a captain gets the camp overview in the Captains folder, and it opens", async ({
    page,
    request,
  }) => {
    await login(page, { id: "home-captain", email: "god@example.com" });
    await page.goto("/");
    await completeOnboarding(request, "home-captain");
    await setRank(request, "home-captain", "captain");

    await page.goto("/");
    await expectDesktop(page);
    await goViaConsoleNav(page, "Camp overview", "Captains");
    await expect(page).toHaveURL("/captains/overview");
    await expect(
      page.getByRole("heading", { level: 1, name: "Camp overview" }),
    ).toBeVisible();
  });

  test("a member cannot open the camp overview", async ({ page, request }) => {
    await login(page, { id: "home-peek", email: "god@example.com" });
    await page.goto("/");
    await completeOnboarding(request, "home-peek");
    await setRank(request, "home-peek", "member");

    await page.goto("/captains/overview");
    await expect(
      page.getByRole("heading", { level: 1, name: "Camp overview" }),
    ).toBeVisible();
    await expect(page.getByText(/captain-only/)).toBeVisible();
    await expect(page.getByText("Is camp ready?")).toHaveCount(0);
  });

  test("a member sees the task they are responsible for, and it opens the board", async ({
    page,
    request,
  }) => {
    await login(page, {
      id: "home-tasker",
      email: "home-tasker@example.com",
      displayName: "Tessa Tasker",
    });
    await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
    await completeOnboarding(request, "home-tasker");

    // A captain gives them a task due in ten camp days.
    await login(page, {
      id: "home-task-cap",
      email: "god@example.com",
      displayName: "Cap Tain",
    });
    await page.goto("/");
    await completeOnboarding(request, "home-task-cap");
    await setRank(request, "home-task-cap", "captain");
    await page.goto("/tasks");
    await page.getByRole("button", { name: "Add task" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill("Pack the shade cloth");
    await pick(page, "#task-team", "Structures");
    await pick(page, "#task-assignee", "Tessa Tasker");
    await dialog.getByLabel("Deadline").fill(campDayFromNow(10));
    await dialog.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText("Task added")).toBeVisible();

    await login(page, {
      id: "home-tasker",
      email: "home-tasker@example.com",
    });
    await page.goto("/");
    const today = await openToday(page);
    await expect(
      today.getByRole("heading", { level: 2, name: /^Today · / }),
    ).toBeVisible();
    const list = today.getByRole("list", { name: "My tasks" });
    const row = list.getByRole("link", { name: /Pack the shade cloth/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("Due in 10 days")).toBeVisible();
    await expect(today.getByRole("link", { name: "All tasks" })).toBeVisible();

    await row.click();
    await expect(page).toHaveURL("/tasks");
    await expect(
      page.getByRole("heading", { level: 1, name: "Tasks" }),
    ).toBeVisible();
  });

  test("a member with no tasks has no task list, and a plain Tasks program", async ({
    page,
    request,
  }) => {
    await login(page, {
      id: "home-idle",
      email: "god@example.com",
      displayName: "Idle Ida",
    });
    await page.goto("/");
    await completeOnboarding(request, "home-idle");
    await setRank(request, "home-idle", "member");

    await page.goto("/");
    const programs = await openConsoleNav(page, "Me");
    await expect(navEntry(programs, "Tasks")).toHaveAccessibleName("Tasks");
    await closeConsoleNav(page);
    const today = await openToday(page);
    await expect(
      today.getByRole("heading", { level: 2, name: /^Today · / }),
    ).toBeVisible();
    // The section is still drawn, as the prototype draws it, with its line.
    await expect(today.getByText("No open tasks. Nice.")).toBeVisible();
    await expect(today.getByRole("list", { name: "My tasks" })).toHaveCount(0);
  });
});
