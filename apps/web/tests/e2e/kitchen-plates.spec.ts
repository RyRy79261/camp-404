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

// Plate counts on a recipe in the book (#243, test-mode). Food does not scale
// by multiplying, so a captain or a Kitchen lead (2A) has Claude proofread the
// recipe for another count, and the answer is kept: switching back to the
// recipe's own count, or asking for a count that is already ready, runs
// nothing, and no run counter shows. E2E mode stands in for Anthropic: a plate
// count's amounts are base × (to/from)^0.9, so 2.5 kg for 50 plates reads
// 2.3 kg for 45.

const DISH = "Camp dal";

/** How long a run may take under E2E: four stages, each held 800 ms. */
const RUN_TIMEOUT = 15_000;

/**
 * A captain imports and approves the dish and has Claude write it for 50
 * plates; the run saves version 1 into the book after the response.
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

  const proofreading = page.getByRole("article", {
    name: "Turn into a recipe",
  });
  await proofreading.getByLabel("Plates").fill("50");
  await proofreading
    .getByRole("button", { name: "Turn into a recipe with Claude" })
    .click();
  await expect(page.getByText("Sent to Claude")).toBeVisible();
  await expect(async () => {
    await page.goto(recipeUrl);
    await expect(
      page.getByRole("heading", { level: 1, name: DISH }),
    ).toBeVisible({ timeout: 1_000 });
    await expect(
      page.getByText("Written for 50 plates · Version 1 · Total 45 min"),
    ).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: RUN_TIMEOUT });
  return recipeUrl;
}

const chip = (page: Page, step: number) =>
  page.getByRole("list", { name: `Step ${step} uses` });
const plateBar = (page: Page) => page.locator("[data-plate-bar]");

test.describe("recipe plate counts (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a captain proofreads 45 plates once; 50 and 45 are then read, never run again", async ({
    page,
    request,
  }) => {
    const recipeUrl = await acceptedAt50(page, request);

    // 1. The book's page, written for 50, with each step's amounts.
    await expect(
      page.getByRole("heading", { level: 1, name: DISH }),
    ).toBeVisible();
    await expect(
      page.getByText("Written for 50 plates · Version 1 · Total 45 min"),
    ).toBeVisible();
    await expect(chip(page, 3)).toContainText("2.5 kg");
    await expect(chip(page, 3)).toContainText("Red lentils");
    await expect(page.getByText(/runs? left|per day/i)).toHaveCount(0);

    // 2. A captain has Claude proofread 45 plates.
    await plateBar(page).getByLabel("Another count").fill("45");
    await plateBar(page)
      .getByRole("button", { name: "Proofread for 45 plates" })
      .click();
    await expect(page).toHaveURL(`${recipeUrl}?plates=45`);
    const counts = page.getByRole("navigation", { name: "Plate count" });
    await expect(counts.getByRole("link", { name: "45" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(chip(page, 3)).toContainText("2.3 kg");
    await expect(
      page
        .getByRole("region", { name: "Cook notes" })
        .getByText("For 45 plates"),
    ).toBeVisible();

    // 6. At phone width the page never scrolls sideways.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      )
      .toBe(true);

    // 3. Back to 50: the recipe's own amounts, and no run.
    await counts.getByRole("link", { name: "50" }).click();
    await expect(page).toHaveURL(`${recipeUrl}?plates=50`);
    await expect(counts.getByRole("link", { name: "50" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(chip(page, 3)).toContainText("2.5 kg");

    // 4. Asking for 45 again reads the stored count: nothing runs.
    await plateBar(page).getByLabel("Another count").fill("45");
    await plateBar(page)
      .getByRole("button", { name: "Proofread for 45 plates" })
      .click();
    await expect(page).toHaveURL(`${recipeUrl}?plates=45`);
    await expect(chip(page, 3)).toContainText("2.3 kg");

    // 5. A Kitchen lead reads the counts, and may ask for another (2A).
    await login(page, {
      id: "kp-lead",
      email: "kp-lead@example.com",
      displayName: "Kit Lead",
    });
    await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
    await completeOnboarding(request, "kp-lead");
    await seedTeam(request, "kp-lead", "kitchen", true);
    await page.goto(`${recipeUrl}?plates=45`);
    await expect(chip(page, 3)).toContainText("2.3 kg");
    await expect(plateBar(page).getByLabel("Another count")).toBeVisible();
    await expect(
      plateBar(page).getByRole("button", { name: "Proofread 45 plates again" }),
    ).toBeVisible();
    await expect(page.getByText(/runs? left|per day/i)).toHaveCount(0);
  });
});
