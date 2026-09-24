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
// person responsible moves their own card. Whoever added a task, its team's
// lead or a captain may edit it; the person responsible may not.

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

async function captain(page: Page, request: APIRequestContext, id: string) {
  await login(page, { id, email: "god@example.com", displayName: "Cap Tain" });
  await page.goto("/");
  await completeOnboarding(request, id);
  await setRank(request, id, "captain");
}

/** Add a task through the dialog, as whoever is signed in. */
async function addTask(
  page: Page,
  input: { title: string; team: string; assignee?: string; due?: string },
) {
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Add task" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(input.title);
  await pick(page, "#task-team", input.team);
  if (input.assignee) await pick(page, "#task-assignee", input.assignee);
  if (input.due) await dialog.getByLabel("Deadline").fill(input.due);
  await dialog.getByRole("button", { name: "Add task" }).click();
  await expect(
    column(page, "To do").getByRole("article", { name: input.title }),
  ).toBeVisible();
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

  test("a captain edits a task, and the change is still there after a reload", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "edit-crew", "Crew Member");
    await approvedMember(page, request, "edit-other", "Other Member");
    await captain(page, request, "edit-cap");
    await addTask(page, {
      title: "Count the float",
      team: "Finance",
      assignee: "Crew Member",
      due: "2099-04-25",
    });

    await column(page, "To do")
      .getByRole("button", { name: "Edit “Count the float”" })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Edit task" }),
    ).toBeVisible();
    await expect(dialog.getByLabel("Title")).toHaveValue("Count the float");
    await expect(dialog.getByLabel("Deadline")).toHaveValue("2099-04-25");
    await expect(dialog.locator("#task-assignee")).toHaveText("Crew Member");

    await dialog.getByLabel("Title").fill("Count the float twice");
    await pick(page, "#task-assignee", "Other Member");
    await dialog.getByLabel("Deadline").fill("2099-05-02");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Task updated")).toBeVisible();

    await page.reload();
    const card = column(page, "To do").getByRole("article", {
      name: "Count the float twice",
    });
    await expect(card).toBeVisible();
    await expect(card.getByText("Other Member")).toBeVisible();
    await expect(card.getByText(/Due Sat 2 May/)).toBeVisible();
    await expect(card.getByText("Finance")).toBeVisible();
    await expect(
      page.getByRole("article", { name: "Count the float", exact: true }),
    ).toHaveCount(0);
  });

  test("a lead may edit their team's tasks, not another team's; the person responsible may not edit", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "edit-assignee", "Assignee Member");
    await approvedMember(page, request, "edit-lead", "Kitchen Lead");
    await seedTeam(request, "edit-lead", "kitchen", true);
    await captain(page, request, "edit-cap2");
    await addTask(page, {
      title: "Buy gas bottles",
      team: "Kitchen",
      assignee: "Assignee Member",
    });
    await addTask(page, {
      title: "Count the float",
      team: "Finance",
      assignee: "Assignee Member",
    });

    await login(page, { id: "edit-lead", email: "edit-lead@example.com" });
    await page.goto("/tasks");
    const kitchen = column(page, "To do").getByRole("article", {
      name: "Buy gas bottles",
    });
    const finance = column(page, "To do").getByRole("article", {
      name: "Count the float",
    });
    await expect(kitchen).toBeVisible();
    await expect(finance).toBeVisible();
    await expect(
      kitchen.getByRole("button", { name: "Edit “Buy gas bottles”" }),
    ).toBeVisible();
    await expect(finance.getByRole("button")).toHaveCount(0);

    // The person responsible moves their card but cannot edit it.
    await login(page, {
      id: "edit-assignee",
      email: "edit-assignee@example.com",
    });
    await page.goto("/tasks");
    const mine = column(page, "To do").getByRole("article", {
      name: "Buy gas bottles",
    });
    await expect(mine.getByText("(you)")).toBeVisible();
    await expect(
      mine.getByRole("button", { name: "Move “Buy gas bottles” to Done" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Edit “/ })).toHaveCount(0);
  });
});
