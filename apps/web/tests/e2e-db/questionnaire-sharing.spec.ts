import { test, expect, type Page } from "@playwright/test";
import { resetTestState } from "../e2e/_helpers";
import { buildQuestionnaire } from "./_flows";
import { signInAs } from "./personas";

// Questionnaires for the whole camp (owner, 2026-10-23): every member sees
// every questionnaire, drafts included; a team lead sends one to everyone in
// one step; whoever answers reads the results, with names unless the author
// made them anonymous. On a real database: the store models no questionnaire.

// Several first visits compile under next dev.
test.describe.configure({ timeout: 300_000 });

const POLL = {
  title: "Pizza night",
  key: "pizza-night",
  prompt: "Which topping?",
};

/** Send to everyone, not blocking, from the list. */
async function sendToEveryone(author: Page, title: string): Promise<void> {
  await author.goto("/captains/questionnaires");
  await author.getByRole("link", { name: `Send ${title}` }).click();
  await expect(
    author.getByRole("radio", { name: /^Everyone/, checked: true }),
  ).toBeVisible({ timeout: 60_000 });
  await author
    .getByRole("button", { name: "Send questionnaire", exact: true })
    .click();
  await expect(author).toHaveURL(
    new RegExp(`/captains/questionnaires/${POLL.key}$`),
    { timeout: 60_000 },
  );
}

/** Answer an open, non-blocking send from the list. */
async function answerFromList(page: Page, text: string): Promise<void> {
  await page.goto("/captains/questionnaires");
  await page.getByRole("link", { name: `Answer ${POLL.title}` }).click();
  await page
    .getByRole("textbox", { name: POLL.prompt })
    .fill(text, { timeout: 60_000 });
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Questionnaire complete" }),
  ).toBeVisible();
}

test("a plain member sees every questionnaire, and reads results only after answering", async ({
  browser,
  request,
}) => {
  await resetTestState(request);
  const lead = await signInAs(browser, request, "team_lead");
  await buildQuestionnaire(lead, POLL);

  const member = await signInAs(browser, request, "camp_member");
  // A draft is on the list for everyone, to look at, never to change.
  await member.goto("/captains/questionnaires");
  await expect(
    member.getByRole("heading", { level: 3, name: POLL.title }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(member.getByText("Draft", { exact: true })).toBeVisible();
  await expect(
    member.getByRole("button", { name: "New questionnaire" }),
  ).toHaveCount(0);
  await expect(
    member.getByRole("link", { name: `Edit ${POLL.title}` }),
  ).toHaveCount(0);
  await member.getByRole("link", { name: `Look at ${POLL.title}` }).click();
  await expect(member.getByText(POLL.prompt)).toBeVisible({ timeout: 60_000 });

  // The lead sends it to everyone: one press, no captain.
  await sendToEveryone(lead, POLL.title);

  // Before answering: no answers are read.
  await member.goto(`/questionnaires/results/${POLL.key}`);
  await expect(member.getByText("Answer it to see the results")).toBeVisible({
    timeout: 60_000,
  });

  await answerFromList(member, "Margherita");
  await member.getByRole("link", { name: "See the results" }).click();
  await expect(member.getByText(/1 person answered/)).toBeVisible({
    timeout: 60_000,
  });
  // Counts first; names only when asked for.
  await expect(member.getByText("Margherita")).toHaveCount(0);
  await member.getByRole("button", { name: "See who answered what" }).click();
  await expect(member.getByText("Margherita")).toBeVisible();
  await expect(member.getByText(/camp_member:/)).toBeVisible();
});

test("an anonymous questionnaire shows the written answers with no names", async ({
  browser,
  request,
}) => {
  await resetTestState(request);
  const lead = await signInAs(browser, request, "team_lead");
  await buildQuestionnaire(lead, POLL);
  const anonymous = lead.getByRole("switch", { name: "Anonymous results" });
  await anonymous.click();
  await expect(anonymous).toBeChecked();

  const member = await signInAs(browser, request, "camp_member");
  await sendToEveryone(lead, POLL.title);
  await answerFromList(member, "Margherita");

  await member.goto(`/questionnaires/results/${POLL.key}`);
  await expect(member.getByText("Margherita")).toBeVisible({ timeout: 60_000 });
  await expect(
    member.getByRole("button", { name: "See who answered what" }),
  ).toHaveCount(0);
  await expect(member.getByText(/camp_member:/)).toHaveCount(0);
});
