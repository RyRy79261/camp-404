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

// Plate counts on a recipe in the book (#243, the owner's sketch 2026-09-24,
// test-mode). The chips are the distinct counts in this year's meal plan.
// Food does not scale by multiplying, so a count is proofread by Claude once
// and kept: a captain or a Kitchen lead (2A) presses "N · Proofread for N",
// and afterwards the count is a link with a tick that runs nothing. The page
// has two tabs, Recipe and History, kept in the address. No run counter
// shows. E2E mode stands in for Anthropic: a plate count's amounts are
// base × (to/from)^0.9, so 2.5 kg for 50 plates reads 2.3 kg for 45.

const DISH = "Camp dal";

/** How long a run may take under E2E: four stages, each held 800 ms. */
const RUN_TIMEOUT = 15_000;

/**
 * A captain puts 45 at breakfast and 50 at dinner on the meal plan, imports
 * and approves the dish and presses "Send for proofreading" in its heading:
 * Claude writes it for the largest count, 50, and the run saves version 1
 * into the book after the response.
 */
async function acceptedAt50(
  page: Page,
  request: APIRequestContext,
): Promise<string> {
  await login(page, {
    id: "kp-cap",
    email: "god@example.com",
    displayName: "Cap Tain",
  });
  await page.goto("/");
  await completeOnboarding(request, "kp-cap");
  await setRank(request, "kp-cap", "captain");

  await page.goto("/kitchen/meal-plan");
  await page.getByLabel("Days on site").fill("2");
  await page.getByLabel("Day 1 breakfast").fill("45");
  await page.getByLabel("Day 1 dinner").fill("50");
  await page.getByRole("button", { name: "Copy Day 1 to every day" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Meal plan saved")).toBeVisible();

  await page.goto("/kitchen/recipes/new");
  await page
    .getByLabel("Recipe text")
    .fill(`${DISH}\n500 g red lentils, 1 tin coconut milk. Simmer 20 min.`);
  await page
    .getByRole("checkbox", {
      name: /A captain or a Kitchen lead may send this recipe/,
    })
    .click();
  await page.getByRole("button", { name: "Import recipe" }).click();
  await expect(page).toHaveURL(/\/kitchen\/recipes\/[0-9a-f-]{36}$/);
  const recipeUrl = new URL(page.url()).pathname;

  const decision = page.getByRole("article", { name: "Decision" });
  await decision.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Recipe approved")).toBeVisible();

  // The old card with its plates box is gone: the heading's button sends it.
  await expect(
    page.getByRole("article", { name: "Turn into a recipe" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Send for proofreading" }).click();
  await expect(
    page.getByRole("button", { name: /Claude is proofreading/ }),
  ).toBeVisible();
  // The page follows the run and reloads once Claude has written it.
  await expect(
    page.getByText("Written for 50 plates · Version 1 · Total 45 min"),
  ).toBeVisible({ timeout: RUN_TIMEOUT });
  return recipeUrl;
}

const chip = (page: Page, step: number) =>
  page.getByRole("list", { name: `Step ${step} uses` });
const counts = (page: Page) =>
  page.getByRole("navigation", { name: "Plate count" });

test.describe("recipe plate counts (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("the meal plan's counts: a captain proofreads 45 once; 50 and 45 are then read, never run again", async ({
    page,
    request,
  }) => {
    const recipeUrl = await acceptedAt50(page, request);

    // 1. The Recipe tab, written for 50, with each step's amounts, and a chip
    //    for each count in the meal plan.
    await expect(
      page.getByRole("heading", { level: 1, name: DISH }),
    ).toBeVisible();
    await expect(chip(page, 3)).toContainText("2.5 kg");
    await expect(chip(page, 3)).toContainText("Red lentils");
    await expect(
      counts(page).getByRole("link", { name: "50 plates, proofread" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(/runs? left|per day/i)).toHaveCount(0);

    // 2. A captain has Claude proofread 45 plates from its chip.
    await counts(page)
      .getByRole("button", { name: "45 · Proofread for 45" })
      .click();
    await expect(page).toHaveURL(`${recipeUrl}?plates=45`);
    await expect(
      counts(page).getByRole("link", { name: "45 plates, proofread" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(chip(page, 3)).toContainText("2.3 kg");
    await expect(
      page
        .getByRole("region", { name: "Cook notes" })
        .getByText("For 45 plates"),
    ).toBeVisible();
    // Both counts are ready: nothing left to proofread.
    await expect(counts(page).getByRole("button")).toHaveCount(0);

    // 3. At phone width the page never scrolls sideways.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      )
      .toBe(true);

    // 4. Back to 50: the recipe's own amounts, and no run.
    await counts(page)
      .getByRole("link", { name: "50 plates, proofread" })
      .click();
    await expect(page).toHaveURL(`${recipeUrl}?plates=50`);
    await expect(chip(page, 3)).toContainText("2.5 kg");

    // 5. The History tab, kept in the address through a reload with the
    //    plate count: every version opens in place, with the activity log.
    await page
      .getByRole("navigation", { name: "Recipe tabs" })
      .getByRole("link", { name: "History" })
      .click();
    await expect(page).toHaveURL(`${recipeUrl}?tab=history&plates=50`);
    await page.reload();
    const versions = page.getByRole("article", { name: "Recipe versions" });
    await expect(versions).toBeVisible();
    await versions.getByText("Version 1").click();
    await expect(versions.getByText("Red lentils").first()).toBeVisible();
    await expect(
      page.getByRole("article", { name: "Source versions" }),
    ).toBeVisible();
    await expect(page.getByRole("article", { name: "Activity" })).toBeVisible();
    await expect(counts(page)).toHaveCount(0);

    // 6. A Kitchen lead adds a count to the meal plan and may proofread it
    //    (2A).
    await login(page, {
      id: "kp-lead",
      email: "kp-lead@example.com",
      displayName: "Kit Lead",
    });
    await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
    await completeOnboarding(request, "kp-lead");
    await seedTeam(request, "kp-lead", "kitchen", true);
    await page.goto("/kitchen/meal-plan");
    await page.getByLabel("Day 2 dinner").fill("60");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Meal plan saved")).toBeVisible();
    await page.goto(`${recipeUrl}?plates=45`);
    await expect(chip(page, 3)).toContainText("2.3 kg");
    await expect(
      counts(page).getByRole("button", { name: "60 · Proofread for 60" }),
    ).toBeVisible();
    await expect(page.getByText(/runs? left|per day/i)).toHaveCount(0);
  });
});
