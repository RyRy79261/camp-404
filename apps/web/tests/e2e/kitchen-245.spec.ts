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
  seedParticipation,
  seedTeam,
} from "./_helpers";

// Kitchen #245 (test-mode), as the owner approved it on 2026-10-02 (Option A
// of design/kitchen-prices.html, kitchen-costing.html, kitchen-dietary.html
// and kitchen-prep.html):
//  - a Kitchen lead gives a shopping line a shop and a price and sees the
//    food cost on top of the list; a member reads the same list with no price;
//  - a member coming this year picks peanuts as anaphylaxis on the dietary
//    pick-list; the recipe on the meal plan that holds peanuts is red until
//    the lead records a plan, then green;
//  - a prep step due before we leave lands on Tasks for the Kitchen.

/** A member through the invite gate, onboarded. */
async function member(page: Page, request: APIRequestContext, id: string) {
  await login(page, { id, email: `${id}@example.com`, displayName: id });
  await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(request, id);
}

/**
 * A Kitchen lead with a meal plan from Thu 22 Apr 2027 (Day 2 breakfast 60
 * plates) and Overnight oats in the book, proofread for 60 and holding
 * peanuts, on Day 2's breakfast.
 */
async function kitchenLeadWithOats(page: Page, request: APIRequestContext) {
  await member(page, request, "k5-lead");
  await seedTeam(request, "k5-lead", "kitchen", true);
  await page.goto("/kitchen/meal-plan");
  await page.getByLabel("Days on site").fill("2");
  await page.getByLabel("Day 1 date").fill("2027-04-22");
  await page.getByLabel("Day 2 breakfast").fill("60");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Meal plan saved")).toBeVisible();

  const seeded = await request.post("/api/test/seed-kitchen-book", {
    data: {
      authUserId: "k5-lead",
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
            {
              name: "Peanut butter",
              category: "other",
              quantity: 1,
              unit: "kg",
              allergens: ["peanuts"],
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
  const picker = page.getByRole("dialog", { name: "Add recipes to breakfast" });
  await picker
    .getByRole("button", { name: "Add Overnight oats to Day 2, breakfast" })
    .click();
  await picker.getByRole("button", { name: "Done" }).click();
  await expect(
    page
      .getByRole("list", { name: "Recipes for Day 2, breakfast" })
      .getByText("Overnight oats"),
  ).toBeVisible();
}

test.describe("kitchen #245 (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a Kitchen lead sets a price and sees the food cost; a member sees no price", async ({
    page,
    request,
  }) => {
    await kitchenLeadWithOats(page, request);
    await page.goto("/kitchen/shopping");
    await expect(
      page.getByRole("heading", { level: 1, name: "Shopping list" }),
    ).toBeVisible();
    const cost = page.getByRole("region", { name: "Food cost" });
    await expect(cost).toContainText("No price yet: Rolled oats, Peanut butter.");

    await page
      .getByRole("button", {
        name: "Shop, price and where it comes from: Peanut butter",
      })
      .click();
    await page.getByLabel("Shop: Peanut butter").fill("Vlei Farm Stall");
    await page.getByLabel("Price in rands: Peanut butter").fill("96,00");
    await page.getByLabel("Price in rands: Peanut butter").blur();
    await expect(page.getByText(/Vlei Farm Stall · R\s96,00 estimate/)).toBeVisible();
    // 96,00 over 60 person-days.
    await expect(cost).toContainText(/Food cost\s*R\s96,00/);
    await expect(cost).toContainText(/R\s1,60/);
    await expect(cost).toContainText("No price yet: Rolled oats.");

    // A plain member: the same list, with no price anywhere.
    await member(page, request, "k5-member");
    await page.goto("/kitchen/shopping");
    await expect(
      page.getByRole("checkbox", { name: /^Peanut butter/ }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Food cost" })).toHaveCount(0);
    await expect(page.getByText("Vlei Farm Stall")).toHaveCount(0);
    await expect(page.getByText(/R\s96,00/)).toHaveCount(0);
    await expect(page.getByText("No shop or price yet")).toHaveCount(0);
  });

  test("an anaphylaxis flag stays red until the lead records a plan, then turns green", async ({
    page,
    request,
  }) => {
    // A member coming this year picks peanuts as anaphylaxis.
    await member(page, request, "k5-thandi");
    await seedParticipation(request, "k5-thandi", "accepted");
    await page.goto("/tools/forms/dietary");
    await expect(
      page.getByRole("heading", { level: 1, name: "Dietary needs" }),
    ).toBeVisible();
    await page
      .getByRole("group", { name: "Peanuts" })
      .getByRole("button", { name: "Anaphylaxis" })
      .click();
    await page.getByRole("checkbox", { name: "Vegetarian" }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Dietary needs saved")).toBeVisible();

    await kitchenLeadWithOats(page, request);
    const box = page.getByRole("region", { name: "Dietary" });
    await expect(box).toContainText("1 anaphylactic");
    await expect(box).toContainText("Vegetarian");
    await expect(box).not.toContainText("k5-thandi");

    const oats = page.getByRole("list", { name: "Recipes for Day 2, breakfast" });
    await expect(oats.getByTestId("flag-red")).toContainText(
      "Peanuts (peanut butter): 1 allergic, 1 anaphylactic.",
    );
    await oats
      .getByRole("button", { name: "Record a plan: Overnight oats" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Plan for peanuts" });
    await dialog.getByRole("textbox").fill(
      "One bowl first, in a clean pot, with sunflower seed butter.",
    );
    await dialog.getByRole("button", { name: "Save plan" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(oats.getByTestId("flag-planned")).toContainText(
      "plan recorded. A separate portion: One bowl first",
    );
    await expect(oats.getByTestId("flag-red")).toHaveCount(0);
  });

  test("a prep step due before we leave shows on the task board for the Kitchen", async ({
    page,
    request,
  }) => {
    await kitchenLeadWithOats(page, request);
    await page
      .getByRole("button", {
        name: "Add a prep step: Overnight oats, Day 2, Fri 23 Apr, breakfast",
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Prep step for Overnight oats",
    });
    await expect(dialog).not.toContainText(/responsible/i);
    await dialog.getByRole("textbox").fill("Toast the oats");
    await dialog.getByRole("radio", { name: /Before we leave/ }).click();
    await dialog.getByLabel("Date").fill("2027-04-20");
    await dialog.getByRole("button", { name: "Add to Kitchen tasks" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page
        .getByRole("list", { name: "Recipes for Day 2, breakfast" })
        .getByText("Toast the oats"),
    ).toBeVisible();

    await page.goto("/tasks");
    await expect(
      page.getByRole("heading", { level: 1, name: "Tasks" }),
    ).toBeVisible();
    const card = page.getByRole("article", {
      name: "Overnight oats ×60: toast the oats",
    });
    await expect(card).toBeVisible();
    await expect(card).toContainText("For Day 2 breakfast, Fri 23 Apr");
  });
});
