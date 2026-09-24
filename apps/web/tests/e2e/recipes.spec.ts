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

// Recipes (#243, test-mode). A member imports a recipe by pasting its text,
// with no name, and agrees that a captain or a Kitchen lead may send it to
// Claude; a Kitchen lead approves it, and is offered the picker too (the owner's decision 2A);
// a captain sets the plates at breakfast in Camp settings, and on the review
// page that count is offered for the run (E2E mode stands in for Anthropic).
// The run writes version 1 straight into the book after the response, with no
// accept step, and the member finds it there, written for those plates. No
// screen counts runs down or names a daily limit. A lead of another team
// reaches the review page's rung but not its rows.

/** How long a run may take under E2E: four stages, each held 800 ms. */
const RUN_TIMEOUT = 15_000;

/** A run counter or a per-day limit, which no screen shows any more. */
const RUN_COUNT = /runs? left|per day/i;

const DISH = "Camp dal";

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

/**
 * A member imports the dish by pasting its text, with no name (the text's
 * first line names it); returns its page's path.
 */
async function importRecipe(page: Page, consent: boolean): Promise<string> {
  await page.goto("/kitchen/recipes/new");
  await expect(
    page.getByRole("heading", { level: 1, name: "Import a recipe" }),
  ).toBeVisible();
  await page
    .getByLabel("Recipe text")
    .fill(
      `${DISH}\n500 g red lentils, 1 tin coconut milk, 1 tsp cumin. Simmer 20 min.`,
    );
  await page
    .getByLabel("Why it suits the camp (optional)")
    .fill("One pot, and it keeps in the heat.");
  if (consent) {
    await page
      .getByRole("checkbox", {
        name: /A captain or a Kitchen lead may send this recipe/,
      })
      .click();
  }
  await page.getByRole("button", { name: "Import recipe" }).click();
  await expect(
    page.getByText(
      "Recipe imported. A Kitchen lead or a captain checks it next.",
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/kitchen\/recipes\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: DISH }),
  ).toBeVisible();
  return new URL(page.url()).pathname;
}

test.describe("recipes (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a member imports, a Kitchen lead approves, a captain has Claude write it for breakfast, straight into the book", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "rcp-member", "Rita Member");
    const recipeUrl = await importRecipe(page, true);
    await expect(
      page
        .getByRole("article", { name: "Decision" })
        .getByText("Waiting for a Kitchen lead or a captain to decide."),
    ).toBeVisible();

    // The Kitchen lead approves it from the review queue.
    await approvedMember(page, request, "rcp-lead", "Kit Lead");
    await seedTeam(request, "rcp-lead", "kitchen", true);
    await page.goto("/kitchen/recipes/review");
    await expect(
      page.getByRole("heading", { level: 2, name: "Suggestions" }),
    ).toBeVisible();
    await page
      .getByRole("table", { name: "Suggestions" })
      .or(page.getByRole("list", { name: "Suggestions" }))
      .filter({ visible: true })
      .getByRole("link", { name: DISH })
      .click();
    await expect(page).toHaveURL(recipeUrl);
    const decision = page.getByRole("article", { name: "Decision" });
    await decision.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Recipe approved")).toBeVisible();
    await expect(decision.getByRole("button", { name: "Approve" })).toHaveCount(
      0,
    );

    // The review page offers the lead the recipe, and the picker and the
    // Claude button with it (2A), with no run counter.
    await page.goto("/kitchen/recipes/review");
    await expect(
      page.getByRole("heading", { level: 1, name: "Review recipes" }),
    ).toBeVisible();
    const leadReady = page.getByRole("article", { name: "Ready for Claude" });
    await expect(
      leadReady.getByRole("link", { name: DISH }).filter({ visible: true }),
    ).toBeVisible();
    await expect(
      leadReady
        .getByRole("checkbox", { name: `Pick ${DISH}` })
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(
      leadReady.getByRole("button", { name: "Turn into recipes with Claude" }),
    ).toBeVisible();
    await expect(page.getByText(RUN_COUNT)).toHaveCount(0);

    // A captain sets the plates at breakfast.
    await login(page, {
      id: "rcp-cap",
      email: "god@example.com",
      displayName: "Cap Tain",
    });
    await page.goto("/");
    await completeOnboarding(request, "rcp-cap");
    await setRank(request, "rcp-cap", "captain");
    await page.goto("/captains/camp-settings");
    await expect(
      page.getByRole("heading", { name: "Camp settings" }),
    ).toBeVisible();
    // The daily cap is a silent guard: the card neither shows nor sets it.
    await expect(
      page.getByRole("button", { name: "Save kitchen settings" }),
    ).toBeVisible();
    await expect(page.getByText(RUN_COUNT)).toHaveCount(0);
    await page
      .getByRole("group", { name: "Plates per meal" })
      .getByLabel("Breakfast")
      .fill("50");
    await page.getByRole("button", { name: "Save kitchen settings" }).click();
    await expect(page.getByText("Kitchen settings saved")).toBeVisible();

    // On the review page, breakfast's 50 plates are chosen for the run.
    await page.goto("/kitchen/recipes/review");
    const ready = page.getByRole("article", { name: "Ready for Claude" });
    await expect(ready.getByLabel("Plates")).toHaveValue("breakfast");
    await expect(
      ready.getByLabel("Plates").locator("option:checked"),
    ).toHaveText("Breakfast · 50 plates");
    await expect(
      ready.getByText("Claude writes every amount for 50 plates."),
    ).toBeVisible();
    await expect(page.getByText(RUN_COUNT)).toHaveCount(0);
    await ready
      .getByRole("checkbox", { name: `Pick ${DISH}` })
      .filter({ visible: true })
      .click();
    await ready
      .getByRole("button", { name: "Turn into recipes with Claude" })
      .click();
    await expect(page.getByText("Sent 1 recipe to Claude")).toBeVisible();

    // The run finishes after the response and saves version 1 into the book,
    // with no accept step.
    await expect(async () => {
      await page.goto(recipeUrl);
      await expect(
        page.getByRole("heading", { level: 1, name: DISH }),
      ).toBeVisible({ timeout: 1_000 });
      await expect(
        page.getByText("Written for 50 plates · Version 1 · Total 45 min"),
      ).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: RUN_TIMEOUT });
    await expect(page.getByText(RUN_COUNT)).toHaveCount(0);

    await page.goto("/kitchen/recipes/review");
    const usage = page.getByRole("article", { name: "Proofreading usage" });
    await expect(
      usage.getByText(/This month:\s*1\s200 input tokens, 900 output tokens/),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Drafts to check" })
        .getByRole("link", { name: DISH }),
    ).toHaveCount(0);

    // The member finds it in the book, written for 50 plates.
    await login(page, { id: "rcp-member", email: "rcp-member@example.com" });
    await page.goto("/kitchen/recipes");
    await expect(
      page.getByRole("heading", { level: 1, name: "Recipe book" }),
    ).toBeVisible();
    await expect(page.getByText("1 recipe in the book")).toBeVisible();
    const book = page
      .getByRole("list", { name: "Recipe book" })
      .or(page.getByRole("table", { name: "Recipe book" }))
      .filter({ visible: true });
    await expect(book.getByRole("link", { name: DISH })).toBeVisible();
    await expect(book.getByText("50 plates")).toBeVisible();
    await expect(
      page
        .getByRole("article", { name: "Your suggestions" })
        .getByText("In the book"),
    ).toBeVisible();
  });

  test("a lead of another team sees the refusal and no suggestions", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "rcp-suggester", "Sam Suggester");
    await importRecipe(page, false);

    // A Kitchen lead sees the row, so the refusal below is not an empty queue.
    await approvedMember(page, request, "rcp-kitchen", "Kit Lead");
    await seedTeam(request, "rcp-kitchen", "kitchen", true);
    await page.goto("/kitchen/recipes/review");
    await expect(
      page.getByRole("link", { name: DISH }).filter({ visible: true }),
    ).toHaveCount(1);

    await approvedMember(page, request, "rcp-struct", "Stu Structures");
    await seedTeam(request, "rcp-struct", "structures", true);
    await page.goto("/kitchen/recipes/review");
    await expect(
      page.getByRole("heading", { level: 1, name: "Review recipes" }),
    ).toBeVisible();
    await expect(
      page.getByText("Only a Kitchen lead or a captain reviews recipes."),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Suggestions" }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: DISH })).toHaveCount(0);

    // Nor does the book offer them the review link.
    await page.goto("/kitchen/recipes");
    await expect(
      page.getByRole("heading", { level: 1, name: "Recipe book" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /^Review/ })).toHaveCount(0);
  });
});
