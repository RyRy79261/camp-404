import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { completeOnboarding, login, setRank } from "../_helpers";

// A recipe in the book, for the specs that read one (kitchen-plates,
// window-fit). Test-mode: E2E stands in for Anthropic.

export const DISH = "Camp dal";

/** How long a run may take under E2E: four stages, each held 800 ms. */
export const RUN_TIMEOUT = 15_000;

/**
 * A captain puts 45 at breakfast and 50 at dinner on the meal plan, imports
 * and approves the dish and presses "Send for proofreading" in its heading:
 * Claude writes it for the largest count, 50, and the run saves version 1
 * into the book after the response.
 */
export async function acceptedAt50(
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

  // No Logistics days: the plan's 11 undated days, all copied from Day 1.
  await page.goto("/kitchen/meal-plan");
  await page.getByLabel("Day 1 breakfast").fill("45");
  await page.getByLabel("Day 1 dinner").fill("50");
  await page
    .getByRole("button", { name: "Copy Day 1’s plates to every day" })
    .click();
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
