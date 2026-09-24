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

// The recipe's source editor (#243, test-mode). A Kitchen lead imports a
// recipe, approves it and opens its editor from "Edit source" in the recipe's
// heading: the Markdown shortcuts make a list and bold as they type; "Send for
// proofreading" shows the stages the worker writes (E2E holds each 800 ms) and
// ends on the recipe page, in the book, where "How this was scaled" lists
// Claude's notes and "Edit source" opens the editor again. A source that says
// "some" of something gets Claude's two questions in a dialog; closing it
// keeps them above the editor, and "Claude needs more details — answer here"
// stands where Send was, on the editor and on the recipe page, after leaving
// and coming back (2026-09-24). The answer sent from the dialog ends in the
// book. A lead of another team reads the refusal. The page never scrolls
// sideways and names no run counter.

/** How long a run may take under E2E: four stages, each held 800 ms. */
const RUN_TIMEOUT = 15_000;

const QUESTIONS_TITLE = "Claude needs more before it can write this recipe";
const ANSWER_HERE = "Claude needs more details — answer here";
const QUESTIONS = [
  'How much coconut milk? The source says "some".',
  "Is the cumin ground or whole?",
];

async function signInLead(
  page: Page,
  request: APIRequestContext,
  id: string,
  team: string,
) {
  await login(page, { id, email: `${id}@example.com`, displayName: id });
  await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(request, id);
  await seedTeam(request, id, team, true);
}

/**
 * The signed-in Kitchen lead imports `text` (agreeing to Claude) and approves
 * it; returns the recipe page's path.
 */
async function approvedRecipe(page: Page, text: string): Promise<string> {
  await page.goto("/kitchen/recipes/new");
  await page.getByLabel("Recipe text").fill(text);
  await page
    .getByRole("checkbox", {
      name: /A captain or a Kitchen lead may send this recipe/,
    })
    .click();
  await page.getByRole("button", { name: "Import recipe" }).click();
  await expect(page).toHaveURL(/\/kitchen\/recipes\/[0-9a-f-]{36}$/);
  const recipeUrl = new URL(page.url()).pathname;
  await page
    .getByRole("article", { name: "Decision" })
    .getByRole("button", { name: "Approve" })
    .click();
  await expect(page.getByText("Recipe approved")).toBeVisible();
  return recipeUrl;
}

async function openEditor(page: Page, recipeUrl: string, title: string) {
  await page.goto(`${recipeUrl}/edit`);
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
}

test.describe("recipe source editor (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a Kitchen lead types with Markdown shortcuts, sends, and lands on the recipe in the book", async ({
    page,
    request,
  }) => {
    await signInLead(page, request, "se-lead", "kitchen");
    const recipeUrl = await approvedRecipe(
      page,
      "Camp dal\n500 g red lentils, 1 tin coconut milk, 1 tsp cumin. Simmer 20 min.",
    );
    // Before the book, "Edit source" in the heading opens the editor.
    await page.getByRole("link", { name: "Edit source" }).click();
    await expect(page).toHaveURL(`${recipeUrl}/edit`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Camp dal" }),
    ).toBeVisible();

    // The four sections, in order, each an editor named for it.
    const ingredients = page.getByRole("textbox", { name: "Ingredients" });
    for (const name of ["Ingredients", "Equipment", "Steps", "Notes"]) {
      await expect(page.getByRole("textbox", { name })).toBeVisible();
    }

    // "- " starts a list, and "**bold** " makes strong text.
    await ingredients.click();
    await page.keyboard.type("- 500 g red lentils");
    await expect(ingredients.getByRole("listitem")).toHaveText(
      "500 g red lentils",
    );
    await page.keyboard.press("Enter");
    await page.keyboard.type("**bold** ");
    await expect(ingredients.locator("strong")).toHaveText("bold");
    // "1. " starts a numbered list and "# " a heading; both carry attributes
    // that must reach the server as plain data (they once arrived as a
    // function, and the send was refused).
    const steps = page.getByRole("textbox", { name: "Steps" });
    await steps.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Delete");
    await page.keyboard.type("1. Serve hot");
    await expect(steps.locator("ol > li")).toHaveText("Serve hot");
    const notes = page.getByRole("textbox", { name: "Notes" });
    await notes.click();
    await page.keyboard.type("# Serving");
    await expect(notes.getByRole("heading", { name: "Serving" })).toBeVisible();
    await page.getByLabel("Serves").fill("6");

    await page.getByRole("button", { name: "Send for proofreading" }).click();
    const panel = page.getByRole("status", { name: "Proofreading" });
    await expect(panel).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send for proofreading" }),
    ).toHaveCount(0);
    await expect(panel.getByText("Claude is reading it")).toBeVisible();

    await expect(page).toHaveURL(recipeUrl, { timeout: RUN_TIMEOUT });
    await expect(
      page.getByRole("heading", { level: 1, name: "Camp dal" }),
    ).toBeVisible();
    await expect(page.getByText(/Version 1/).first()).toBeVisible();

    // At the bottom, how Claude scaled it, for everyone who reads the book.
    const scaling = page.getByRole("region", { name: "How this was scaled" });
    await expect(
      scaling.getByText(
        "Salt and cumin were scaled more slowly than the lentils.",
      ),
    ).toBeVisible();
    // The stand-in for Claude reads like a real answer: nothing on the page
    // says it came from test mode.
    await expect(page.getByText(/test mode|not called/i)).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    // In the book, "Edit source" opens the source editor again.
    await page.getByRole("link", { name: "Edit source" }).click();
    await expect(page).toHaveURL(`${recipeUrl}/edit`);
    await expect(
      page.getByRole("button", { name: "Send for proofreading" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Ingredients" }),
    ).toBeVisible();
  });

  test("Claude's questions open in a dialog, stay on the page after Close, are asked for on the recipe page too, and the answer ends in the book", async ({
    page,
    request,
  }) => {
    await signInLead(page, request, "se-asker", "kitchen");
    const recipeUrl = await approvedRecipe(
      page,
      "Coconut dal\n500 g red lentils, some coconut milk, cumin. Simmer 20 min.",
    );
    await openEditor(page, recipeUrl, "Coconut dal");

    await page.getByRole("button", { name: "Send for proofreading" }).click();
    await expect(
      page
        .getByRole("status", { name: "Proofreading" })
        .getByText("Claude is reading it"),
    ).toBeVisible();

    const dialog = page.getByRole("dialog", { name: QUESTIONS_TITLE });
    await expect(dialog).toBeVisible({ timeout: RUN_TIMEOUT });
    for (const question of QUESTIONS) {
      await expect(dialog.getByText(question)).toBeVisible();
    }
    // The title's words leave the close button its room: they once ran
    // under the X.
    const close = await dialog
      .getByRole("button", { name: "Close", exact: true })
      .boundingBox();
    const words = await dialog
      .getByRole("heading", { name: QUESTIONS_TITLE })
      .evaluate((h) => {
        const range = document.createRange();
        range.selectNodeContents(h);
        return [...range.getClientRects()].map((r) => ({
          right: r.right,
          bottom: r.bottom,
        }));
      });
    for (const line of words) {
      expect(
        line.right <= close!.x || line.bottom <= close!.y,
        JSON.stringify({ line, close }),
      ).toBe(true);
    }

    // An empty answer is refused inline.
    await dialog.getByRole("button", { name: "Send answer" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Write your answer.");

    // Close: the questions stay, above the editor, and the heading asks for
    // the answer instead of sending again.
    await dialog
      .getByRole("button", { name: "Close and edit the source" })
      .click();
    await expect(dialog).toHaveCount(0);
    const block = page.getByRole("heading", {
      level: 2,
      name: QUESTIONS_TITLE,
    });
    await expect(block).toBeVisible();
    for (const question of QUESTIONS) {
      await expect(page.getByText(question)).toBeVisible();
    }
    const blockBox = await page.getByText(QUESTIONS[1]!).boundingBox();
    const servesBox = await page.getByLabel("Serves").boundingBox();
    expect(blockBox!.y).toBeLessThan(servesBox!.y);
    await expect(
      page.getByRole("button", { name: "Send for proofreading" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: ANSWER_HERE }).click();
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: "Close and edit the source" })
      .click();

    // Leave, and come back on the recipe page: the same button, read from
    // the server, and it opens the same questions.
    await page.goto(recipeUrl);
    await expect(
      page.getByRole("heading", { level: 1, name: "Coconut dal" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send for proofreading" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: ANSWER_HERE }).click();
    await expect(dialog).toBeVisible();
    for (const question of QUESTIONS) {
      await expect(dialog.getByText(question)).toBeVisible();
    }
    await dialog.getByRole("button", { name: "Answer later" }).click();
    await expect(dialog).toHaveCount(0);

    // Back in the editor the dialog opens again; the answer queues the next
    // round, which writes the recipe into the book.
    await openEditor(page, recipeUrl, "Coconut dal");
    await expect(dialog).toBeVisible();
    await dialog
      .getByLabel("Your answer")
      .fill("Two 400 ml tins, and the cumin is ground.");
    await dialog.getByRole("button", { name: "Send answer" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("status", { name: "Proofreading" }),
    ).toBeVisible();
    await expect(page).toHaveURL(recipeUrl, { timeout: RUN_TIMEOUT });
    await expect(page.getByText(/Version 1/).first()).toBeVisible();
  });

  test("a Structures lead reads the refusal and nothing of the recipe", async ({
    page,
    request,
  }) => {
    await signInLead(page, request, "se-kitchen", "kitchen");
    const recipeUrl = await approvedRecipe(
      page,
      "Secret stew\nSECRET-BEANS. Stew.",
    );

    await signInLead(page, request, "se-struct", "structures");
    await page.goto(`${recipeUrl}/edit`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Edit recipe" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Only a Kitchen lead or a captain can edit a recipe's source.",
      ),
    ).toBeVisible();
    await expect(page.getByText(/SECRET-BEANS/)).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Send for proofreading" }),
    ).toHaveCount(0);
  });

  test("fits a phone and a desktop, and names no run counter", async ({
    page,
    request,
  }) => {
    await signInLead(page, request, "se-width", "kitchen");
    const recipeUrl = await approvedRecipe(
      page,
      "Camp dal\nIngredients\n- 500 g red lentils\n- 1 tin coconut milk\nMethod\nSimmer 20 min until the lentils are completely soft and falling apart.",
    );
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await openEditor(page, recipeUrl, "Camp dal");
      await expect(
        page
          .getByRole("textbox", { name: "Ingredients" })
          .getByRole("listitem"),
      ).toHaveCount(2);
      // A heading is present first (openEditor), then the absences.
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await expect(page.getByText(/runs? left|per day/i)).toHaveCount(0);
    }
  });
});
