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
import { openPhase, setPhaseDays } from "./lib/logistics";

// One set of dates (the owner, 2026-10-03, test-mode): the meal plan takes
// Day 1 and its days on site from Logistics (the first Build day), and when
// the Build days move, the meal plan, its prep steps and their Kitchen tasks
// move together. Clearing the Build days while prep steps need them is
// refused on the Logistics page, in a sentence.
//
// A Kitchen lead who also leads Transport and Logistics sets two days of
// Build from Thu 22 Apr 2027, puts Overnight oats on Day 2's breakfast and a
// prep step before we leave (Tue 20 Apr), which lands on Tasks. Build moves
// two days later: the meal plan says Day 1 is Sat 24 Apr, and the task is
// due Thu 22 Apr, "For Day 2 breakfast, Sun 25 Apr".

async function kitchenAndLogisticsLead(
  page: Page,
  request: APIRequestContext,
  id: string,
) {
  await login(page, { id, email: `${id}@example.com`, displayName: id });
  await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(request, id);
  await seedTeam(request, id, "kitchen", true);
  await seedTeam(request, id, "transport_and_logistics", true);
}

async function openMealPlan(page: Page) {
  await page.goto("/kitchen/meal-plan");
  await expect(
    page.getByRole("heading", { level: 1, name: "Meal plan" }),
  ).toBeVisible();
}

async function prepTask(page: Page) {
  await page.goto("/tasks");
  await expect(
    page.getByRole("heading", { level: 1, name: "Tasks" }),
  ).toBeVisible();
  return page.getByRole("article", {
    name: "Overnight oats ×60: toast the oats",
  });
}

test.describe("meal plan dates from Logistics (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("moving the Build days moves the meal plan's Day 1 and a prep task's date; clearing them is refused", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    await kitchenAndLogisticsLead(page, request, "md-lead");
    await setPhaseDays(page, "Build", "2027-04-22", "2027-04-23");

    await openMealPlan(page);
    await expect(
      page.getByText("Day 1: Thu 22 Apr · 2 days on site, from Logistics"),
    ).toBeVisible();
    await page.getByLabel("Day 2 breakfast").fill("60");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Meal plan saved")).toBeVisible();

    const seeded = await request.post("/api/test/seed-kitchen-book", {
      data: {
        authUserId: "md-lead",
        recipes: [
          {
            title: "Overnight oats",
            plates: [60],
            ingredients: [
              {
                name: "Rolled oats",
                category: "grain",
                quantity: 3,
                unit: "kg",
                allergens: ["gluten"],
              },
            ],
          },
        ],
      },
    });
    expect(seeded.ok()).toBe(true);
    await page.reload();
    await page
      .getByRole("button", { name: "Add a recipe to Day 2, breakfast" })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Add recipes to breakfast",
    });
    await picker
      .getByRole("button", { name: "Add Overnight oats to Day 2, breakfast" })
      .click();
    await picker.getByRole("button", { name: "Done" }).click();

    await page
      .getByRole("button", {
        name: "Add a prep step: Overnight oats, Day 2, Fri 23 Apr, breakfast",
      })
      .click();
    const prep = page.getByRole("dialog", {
      name: "Prep step for Overnight oats",
    });
    await prep.getByRole("textbox").fill("Toast the oats");
    await prep.getByRole("radio", { name: /Before we leave/ }).click();
    await prep.getByLabel("Date").fill("2027-04-20");
    await prep.getByRole("button", { name: "Add to Kitchen tasks" }).click();
    await expect(prep).toHaveCount(0);

    let card = await prepTask(page);
    await expect(card).toContainText("For Day 2 breakfast, Fri 23 Apr");
    await expect(card).toContainText("Tue 20 Apr");

    // Build starts two days later in Logistics.
    await setPhaseDays(page, "Build", "2027-04-24", "2027-04-25");
    await openMealPlan(page);
    await expect(
      page.getByText("Day 1: Sat 24 Apr · 2 days on site, from Logistics"),
    ).toBeVisible();
    await expect(
      page.getByRole("rowheader", { name: "Day 2 · Sun 25 Apr" }),
    ).toBeVisible();

    card = await prepTask(page);
    await expect(card).toContainText("For Day 2 breakfast, Sun 25 Apr");
    await expect(card).toContainText("Thu 22 Apr");
    await expect(card).not.toContainText("Tue 20 Apr");

    // The Build days give Day 1 and a prep step needs it: clearing them is
    // refused, in the dialog, and the days stay.
    const dialog = await openPhase(page, "Build");
    await dialog.getByRole("button", { name: "Clear days" }).click();
    await dialog.getByRole("button", { name: "Yes, clear the days" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "The meal plan's prep steps are dated from the first day on site: keep a Build or Burn date, or remove the prep steps first.",
    );
    await openMealPlan(page);
    await expect(
      page.getByText("Day 1: Sat 24 Apr · 2 days on site, from Logistics"),
    ).toBeVisible();
  });
});
