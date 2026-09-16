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
  await expect(captain).toHaveURL(
    new RegExp(`/captains/questionnaires/${input.key}$`),
  );

  if (input.askAgainNextYear) {
    await captain
      .getByRole("switch", { name: "Ask everyone again next year" })
      .click();
  }
  await captain.getByRole("button", { name: "Add block" }).first().click();
  await captain.getByRole("button", { name: /^Short text/ }).click();
  const editor = captain.getByRole("dialog");
  await editor.getByLabel("Question", { exact: true }).fill(input.prompt);
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(captain.getByText("All changes saved")).toBeVisible();

  await captain.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(captain.getByText("Published", { exact: true })).toBeVisible();
}

/** Send a published questionnaire to everyone, blocking. */
export async function sendBlockingToEveryone(
  captain: Page,
  title: string,
): Promise<void> {
  await captain.goto("/captains/questionnaires");
  await captain.getByRole("link", { name: `Send ${title}` }).click();
  await captain.getByLabel("Blocking").click();
  await captain.getByRole("button", { name: "Send", exact: true }).click();
  await captain.getByRole("button", { name: "Send to everyone" }).click();
}

/** Answer the one-question gate this page is held at, and finish. */
export async function answerGate(
  page: Page,
  input: { title: string; prompt: string; text: string },
): Promise<void> {
  await expect(page).toHaveURL(/\/questionnaires\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: input.title }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: input.prompt }).fill(input.text);
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Questionnaire complete" }),
  ).toBeVisible();
}
