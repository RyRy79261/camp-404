import { test, expect, type Page } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
  setRank,
} from "./_helpers";

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
// nothing that is not theirs (owner, 2026-09-23).
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
    await expect(
      page.getByRole("heading", { level: 1, name: "Hi Nova" }),
    ).toBeVisible();
    await expect(page.getByText("You’re all caught up.")).toBeVisible();
    // The e2e store stands in for a connected calendar that starts empty.
    // The "not connected" wording is covered by unit tests.
    await expect(page.getByText("Nothing on the calendar yet.")).toBeVisible();
    const shortcuts = page.getByRole("navigation", { name: "Your modules" });
    await expect(
      shortcuts.getByRole("link", { name: /^Notifications/ }),
    ).toHaveAttribute("href", "/notifications");
    await expect(
      shortcuts.getByRole("link", { name: /My forms/ }),
    ).toBeVisible();
    // The whole-camp board is a captain's, and is not here.
    await expect(page.getByText("Is camp ready?")).toHaveCount(0);
    await expect(
      shortcuts.getByRole("link", { name: /Camp overview/ }),
    ).toHaveCount(0);
  });

  test("a captain gets the camp overview as one link, and it opens", async ({
    page,
    request,
  }) => {
    await login(page, { id: "home-captain", email: "god@example.com" });
    await page.goto("/");
    await completeOnboarding(request, "home-captain");
    await setRank(request, "home-captain", "captain");

    await page.goto("/");
    const shortcuts = page.getByRole("navigation", { name: "Your modules" });
    await shortcuts.getByRole("link", { name: /Camp overview/ }).click();
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
    await expect(
      page.getByRole("heading", { level: 1, name: "Hi Tessa" }),
    ).toBeVisible();
    const list = page.getByRole("list", { name: "Your tasks" });
    const row = list.getByRole("link", { name: /Pack the shade cloth/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("Due in 10 days")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "See all tasks" }),
    ).toBeVisible();
    const shortcuts = page.getByRole("navigation", { name: "Your modules" });
    await expect(
      shortcuts.getByRole("link", { name: "Tasks, 1 yours" }),
    ).toHaveAttribute("href", "/tasks");

    await row.click();
    await expect(page).toHaveURL("/tasks");
    await expect(
      page.getByRole("heading", { level: 1, name: "Tasks" }),
    ).toBeVisible();
  });

  test("a member with no tasks has no task list, and a plain Tasks tile", async ({
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
    await expect(
      page.getByRole("heading", { level: 1, name: "Hi Idle" }),
    ).toBeVisible();
    await expect(page.getByRole("list", { name: "Your tasks" })).toHaveCount(0);
    await expect(
      page
        .getByRole("navigation", { name: "Your modules" })
        .getByRole("link", { name: "Tasks", exact: true }),
    ).toHaveAttribute("href", "/tasks");
  });
});
