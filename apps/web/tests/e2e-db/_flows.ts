import {
  expect,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";
import { completeOnboarding, login, setRank } from "../e2e/_helpers";

// The steps the real-database specs share, each driven through the app's own
// pages the way a captain or member would.

/** A signed-in, onboarded captain in their own browser context. */
export async function signInCaptain(
  browser: Browser,
  request: APIRequestContext,
  id = "db-captain",
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, { id, email: "god@example.com", displayName: "Cap Tain" });
  await page.goto("/");
  await completeOnboarding(request, id);
  await setRank(request, id, "captain");
  return page;
}

/** Build a one-question questionnaire in the builder and publish it. */
export async function buildAndPublish(
  captain: Page,
  input: {
    title: string;
    key: string;
    prompt: string;
    askAgainNextYear?: boolean;
  },
): Promise<void> {
  await captain.goto("/captains/questionnaires");
  await captain.getByRole("button", { name: "New questionnaire" }).click();
  await captain.getByLabel("Questionnaire name").fill(input.title);
  await captain.getByRole("button", { name: "Create" }).click();
  // Create navigates to the builder once its page has rendered. Under next
  // dev the builder (the largest client bundle in the app) compiles on its
  // first visit, which can outlast the 15 s default on a busy machine.
  await expect(captain).toHaveURL(
    new RegExp(`/captains/questionnaires/${input.key}$`),
    { timeout: 60_000 },
  );

  const rail = captain.getByRole("complementary", { name: "Publish and send" });
  if (input.askAgainNextYear) {
    // The switch loads its current setting first; a click before that is lost.
    const askAgain = rail.getByRole("switch", {
      name: "Ask everyone again next year",
    });
    await expect(askAgain).toBeEnabled();
    await askAgain.click();
    await expect(askAgain).toBeChecked();
  }
  // The palette adds to the section being worked on, and focuses the new
  // question's prompt.
  await captain
    .getByRole("complementary", { name: "Add a block" })
    .getByRole("button", { name: "Short answer", exact: true })
    .click();
  await captain.getByLabel("Question prompt").fill(input.prompt);
  await captain.getByRole("button", { name: "Save draft" }).click();
  await expect(captain.getByText("All changes saved")).toBeVisible();

  await rail.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(rail.getByText("Published", { exact: true })).toBeVisible();
}

/** Send a published questionnaire to everyone, blocking. */
export async function sendBlockingToEveryone(
  captain: Page,
  title: string,
): Promise<void> {
  await captain.goto("/captains/questionnaires");
  await captain.getByRole("link", { name: `Send ${title}` }).click();
  // Everyone is the first audience card, and chosen when the form opens.
  await expect(
    captain.getByRole("radio", { name: /^Everyone/, checked: true }),
  ).toBeVisible();
  await captain.getByRole("switch", { name: "Blocking" }).click();
  await captain.getByRole("button", { name: "Send questionnaire" }).click();
  await captain.getByRole("button", { name: "Send to everyone" }).click();
}

/** Answer the one-question gate this page is held at, and finish. */
export async function answerGate(
  page: Page,
  input: { title: string; prompt: string; text: string },
): Promise<void> {
  // The gate redirect lands on the runner, whose client bundle next dev
  // compiles on its first visit — slower than the 15 s default on CI.
  await expect(page).toHaveURL(/\/questionnaires\/[0-9a-f-]{36}$/, {
    timeout: 60_000,
  });
  await expect(
    page.getByRole("heading", { level: 1, name: input.title }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("textbox", { name: input.prompt }).fill(input.text);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Questionnaire complete" }),
  ).toBeVisible();
}
