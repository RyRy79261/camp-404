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
import { acceptedAt50, DISH } from "./lib/kitchen";

// The Kitchen's menu (#244) and shopping list (#245), the layouts the owner
// approved on 2026-09-30 (test-mode). Recipes sit inside the meal plan table:
// a Kitchen lead puts the book's recipes on meals with "+ Add a recipe", each
// on its own line with where its plate count stands; the shopping list adds
// up the verified counts by shop area, lists a recipe not verified for its
// meal's plates at the top ("Not counted yet: proofread first"), and puts the
// snacks last. Any member ticks, for the whole camp; a lead of another team
// reads the menu and changes nothing.
//
// acceptedAt50 leaves a meal plan of 2 days, 45 at breakfast and 50 at
// dinner, and Camp dal in the book written for 50 plates: 4 onions, 2.5 kg
// red lentils, 2 l coconut milk and 2 tbsp ground cumin.

async function member(
  page: Page,
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await login(page, { id, email: `${id}@example.com`, displayName: id });
  await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(request, id);
}

const recipesOn = (page: Page, meal: string) =>
  page.getByRole("list", { name: `Recipes for ${meal}` });

async function addRecipe(page: Page, meal: string) {
  await page.getByRole("button", { name: `Add a recipe to ${meal}` }).click();
  const picker = page.getByRole("dialog", { name: `Add a recipe to ${meal}` });
  await picker.getByLabel("Search the recipe book").fill("dal");
  await picker.getByRole("button", { name: DISH }).click();
  await expect(page.getByText(`${DISH} is on ${meal}`)).toBeVisible();
  await expect(picker).toHaveCount(0);
  await expect(recipesOn(page, meal).getByText(DISH)).toBeVisible();
}

test.describe("kitchen menu and shopping list (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a Kitchen lead puts recipes on the menu; a member reads it and ticks the list for the camp; a lead of another team changes nothing", async ({
    page,
    request,
  }) => {
    await acceptedAt50(page, request);

    // 1. A Kitchen lead puts Camp dal on both dinners (50 plates, verified)
    //    and on day 1 breakfast (45 plates, not proofread for 45).
    await member(page, request, "km-lead");
    await seedTeam(request, "km-lead", "kitchen", true);
    await page.goto("/kitchen/meal-plan");
    await expect(
      page.getByRole("heading", { level: 1, name: "Meal plan" }),
    ).toBeVisible();
    await addRecipe(page, "Day 1, dinner");
    await expect(
      recipesOn(page, "Day 1, dinner").getByText("Verified"),
    ).toBeVisible();
    await addRecipe(page, "Day 2, dinner");
    await addRecipe(page, "Day 1, breakfast");
    await expect(
      recipesOn(page, "Day 1, breakfast").getByRole("button", {
        name: "Proofread for 45",
      }),
    ).toBeVisible();
    // A recipe sits on a meal once: the picker no longer offers it there.
    await page
      .getByRole("button", { name: "Add a recipe to Day 1, dinner" })
      .click();
    await expect(
      page
        .getByRole("dialog", { name: "Add a recipe to Day 1, dinner" })
        .getByText("No recipe in the book matches."),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // A snack, under the table.
    await page.getByLabel("Snack", { exact: true }).fill("Rusks");
    await page.getByLabel("Amount").fill("4 boxes");
    await page.getByRole("button", { name: "Add snack" }).click();
    await expect(
      page.getByRole("list", { name: "Snacks" }).getByText("Rusks"),
    ).toBeVisible();

    // 2. The shopping list adds up the two verified dinners and names the
    //    breakfast that is not counted yet.
    await page.goto("/kitchen/shopping");
    await expect(
      page.getByRole("heading", { level: 1, name: "Shopping list" }),
    ).toBeVisible();
    const notCounted = page.getByRole("region", {
      name: "Not counted yet: proofread first",
    });
    await expect(notCounted).toContainText(DISH);
    await expect(notCounted).toContainText("45 plates");
    const legumes = page.getByRole("region", { name: "Legumes" });
    await expect(legumes).toContainText("Red lentils");
    await expect(legumes).toContainText("5 kg");
    await expect(legumes).toContainText("Day 1 dinner, Day 2 dinner");
    await expect(page.getByRole("region", { name: "Snacks" })).toContainText(
      "4 boxes",
    );

    // 3. A plain member reads the menu, with nothing to change, and ticks.
    await member(page, request, "km-member");
    await page.goto("/kitchen/meal-plan");
    await expect(
      recipesOn(page, "Day 1, dinner").getByText(DISH),
    ).toBeVisible();
    await expect(
      recipesOn(page, "Day 1, breakfast").getByText("Not proofread yet"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Add a recipe/ }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Take / })).toHaveCount(0);

    await page.goto("/kitchen/shopping");
    const lentils = page.getByRole("checkbox", { name: "Red lentils" });
    await expect(lentils).not.toBeChecked();
    await lentils.click();
    await expect(lentils).toBeChecked();

    // 4. A lead of another team sees the member's tick (shared by the camp),
    //    and reads the menu without a control to change it.
    await member(page, request, "km-struct");
    await seedTeam(request, "km-struct", "structures", true);
    await page.goto("/kitchen/shopping");
    await expect(
      page.getByRole("checkbox", { name: "Red lentils" }),
    ).toBeChecked();
    await page.goto("/kitchen/meal-plan");
    await expect(
      recipesOn(page, "Day 2, dinner").getByText(DISH),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Add a recipe/ }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add snack" })).toHaveCount(
      0,
    );

    // 5. Back as the Kitchen lead: taking the breakfast off clears the
    //    "not counted" note from the list.
    await login(page, {
      id: "km-lead",
      email: "km-lead@example.com",
      displayName: "km-lead",
    });
    await page.goto("/kitchen/meal-plan");
    await page
      .getByRole("button", { name: `Take ${DISH} off Day 1, breakfast` })
      .click();
    await expect(recipesOn(page, "Day 1, breakfast")).toHaveCount(0);
    await page.goto("/kitchen/shopping");
    await expect(
      page.getByRole("heading", { level: 1, name: "Shopping list" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Not counted yet: proofread first" }),
    ).toHaveCount(0);
  });
});
