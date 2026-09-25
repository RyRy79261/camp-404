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

// Meeting notes (#268, test-mode). A team's lead writes up a meeting from the
// team's page with one action item and puts it on the task board; someone on
// another team reads the note but gets no edit controls; a plain member of the
// team may edit it.

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

test.describe("meeting notes (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a lead writes up a meeting and puts its action item on the board; another team reads it only", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "meet-crew", "Kitchen Crew");
    await seedTeam(request, "meet-crew", "kitchen");
    await approvedMember(page, request, "meet-money", "Finance Crew");
    await seedTeam(request, "meet-money", "finance");
    await approvedMember(page, request, "meet-lead", "Kitchen Lead");
    await seedTeam(request, "meet-lead", "kitchen", true);

    // The lead starts from the team's page.
    await page.goto("/teams/kitchen");
    await expect(
      page.getByRole("heading", { level: 1, name: "Kitchen" }),
    ).toBeVisible();
    await expect(
      page.getByText("No meetings written up for this team yet."),
    ).toBeVisible();
    await page.getByRole("link", { name: "New meeting" }).click();
    await expect(page).toHaveURL(/\/meetings\/new\?team=kitchen$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "New meeting" }),
    ).toBeVisible();
    await expect(
      page.getByText("Don't write bank details, ID numbers", { exact: false }),
    ).toBeVisible();

    await page.getByLabel("Title").fill("Kitchen kickoff");
    await page.getByLabel("Time").fill("18:30");
    await page.getByLabel("Agenda").fill("- The menu\n- The gas");
    await page.getByText("Kitchen Crew", { exact: true }).click();
    await page.getByRole("button", { name: "Add decision" }).click();
    await page
      .getByLabel("Decision 1", { exact: true })
      .fill("Dinner is at 19:00");
    await page.getByRole("button", { name: "Add action item" }).click();
    await page.getByLabel("Action item 1", { exact: true }).fill("Buy the gas");
    await page.getByLabel("Who").click();
    await page
      .getByRole("option", { name: "Kitchen Crew", exact: true })
      .click();
    await page.getByRole("button", { name: "Save meeting" }).click();

    await expect(page).toHaveURL(/\/meetings\/[0-9a-f-]{36}$/);
    const noteUrl = page.url();
    await expect(
      page.getByRole("heading", { level: 1, name: "Kitchen kickoff" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Decisions" })
        .getByText("Dinner is at 19:00"),
    ).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Attendees" }).getByText("Kitchen Crew"),
    ).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Attendees" }).getByText("Kitchen Lead"),
    ).toBeVisible();

    // One click puts the action item on the board.
    const items = page.getByRole("list", { name: "Action items" });
    await expect(items.getByText("Buy the gas")).toBeVisible();
    await items
      .getByRole("button", { name: "Add “Buy the gas” to the task board" })
      .click();
    await expect(page.getByText("Added to the task board")).toBeVisible();
    await expect(items.getByText("Task · To do")).toBeVisible();

    await page.goto("/tasks");
    const todo = page.getByRole("region", { name: "To do" });
    await expect(
      todo.getByRole("article", { name: "Buy the gas" }),
    ).toBeVisible();

    // Someone on another team reads it, from the team's page, and can change
    // nothing.
    await login(page, { id: "meet-money", email: "meet-money@example.com" });
    await page.goto("/teams/kitchen");
    await expect(
      page.getByRole("heading", { level: 1, name: "Kitchen" }),
    ).toBeVisible();
    const meetings = page.getByRole("list", { name: "Team meetings" });
    await expect(meetings.getByText("Kitchen kickoff")).toBeVisible();
    await expect(page.getByRole("link", { name: "New meeting" })).toHaveCount(
      0,
    );
    await meetings.getByText("Kitchen kickoff").click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Kitchen kickoff" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Action items" })
        .getByText("Task · To do"),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /task board/ })).toHaveCount(
      0,
    );

    // The edit page refuses them too.
    await page.goto(`${noteUrl}/edit`);
    await expect(page.getByText("The team's members only")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save meeting" }),
    ).toHaveCount(0);

    // A plain member of the team may edit it.
    await login(page, { id: "meet-crew", email: "meet-crew@example.com" });
    await page.goto(noteUrl);
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/edit$/);
    await expect(
      page.getByText("On the task board", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Notes").fill("We met in the kitchen.");
    await page.getByRole("button", { name: "Save meeting" }).click();
    await expect(page).toHaveURL(noteUrl);
    await expect(page.getByText("We met in the kitchen.")).toBeVisible();
  });
});
