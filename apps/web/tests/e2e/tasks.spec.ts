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

// The shared task board (test-mode). Every approved member sees every task;
// captains and team leads add them, a lead only for a team they lead; the
// person responsible moves their own card.

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

function column(page: Page, name: string) {
  return page.getByRole("region", { name });
}

test.describe("task board (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a captain adds a task, and the person responsible moves it to Done", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "task-crew", "Crew Member");

    await login(page, {
      id: "task-cap",
      email: "god@example.com",
      displayName: "Cap Tain",
    });
    await page.goto("/");
    await completeOnboarding(request, "task-cap");
    await setRank(request, "task-cap", "captain");

    await page.goto("/tasks");
    await expect(
      page.getByRole("heading", { level: 1, name: "Tasks" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add task" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill("Count the float");
    await dialog.getByLabel("Details").fill("Before the gate opens.");
    await pick(page, "#task-team", "Finance");
    await pick(page, "#task-assignee", "Crew Member");
    await dialog.getByLabel("Deadline").fill("2099-04-25");
    await dialog.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText("Task added")).toBeVisible();

    const card = column(page, "To do").getByRole("article", {
      name: "Count the float",
    });
    await expect(card).toBeVisible();
    await expect(card.getByText("Finance")).toBeVisible();
    await expect(card.getByText("Crew Member")).toBeVisible();
    await expect(card.getByText(/Due Sat 25 Apr/)).toBeVisible();

    await login(page, { id: "task-crew", email: "task-crew@example.com" });
    await page.goto("/tasks");
    await expect(page.getByRole("button", { name: "Add task" })).toHaveCount(0);
    const mine = column(page, "To do").getByRole("article", {
      name: "Count the float",
    });
    await expect(mine.getByText("(you)")).toBeVisible();
    await mine
      .getByRole("button", { name: "Move “Count the float” to Done" })
      .click();
    await expect(
      column(page, "Done").getByRole("article", { name: "Count the float" }),
    ).toBeVisible();

    // It stays there after a reload: the server moved it, not just the screen.
    await page.reload();
    await expect(
      column(page, "Done").getByRole("article", { name: "Count the float" }),
    ).toBeVisible();
    await expect(
      column(page, "To do").getByRole("article", { name: "Count the float" }),
    ).toHaveCount(0);
  });

  test("a lead adds only for the team they lead; a member can't move others' tasks", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "task-bystander", "Bystander");
    await approvedMember(page, request, "task-lead", "Kitchen Lead");
    await seedTeam(request, "task-lead", "kitchen", true);

    await page.goto("/tasks");
    await page.getByRole("button", { name: "Add task" }).click();
    await page.locator("#task-team").click();
    await expect(page.getByRole("option")).toHaveText(["Kitchen"]);
    await page.getByRole("option", { name: "Kitchen" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill("Buy gas bottles");
    await dialog.getByRole("button", { name: "Add task" }).click();
    await expect(
      column(page, "To do").getByRole("article", { name: "Buy gas bottles" }),
    ).toBeVisible();

    await login(page, {
      id: "task-bystander",
      email: "task-bystander@example.com",
    });
    await page.goto("/tasks");
    const card = column(page, "To do").getByRole("article", {
      name: "Buy gas bottles",
    });
    await expect(card.getByText("Nobody yet")).toBeVisible();
    await expect(card.getByRole("button")).toHaveCount(0);
  });
});
