import { test, expect } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
} from "../e2e/_helpers";
import {
  answerGate,
  buildAndPublish,
  sendBlockingToEveryone,
  signInCaptain,
} from "./_flows";

// The questionnaire engine end to end, on a real database: a captain builds,
// publishes and sends a questionnaire; a member is gated by it and answers it;
// the captain reads the answers and exports them. The in-memory store cannot
// run any of this (owner's call E2E-DB).

const GEAR = {
  title: "Gear check",
  key: "gear-check",
  prompt: "What tent are you bringing?",
};

test("build, publish, send, answer, read the results", async ({
  browser,
  request,
}) => {
  await resetTestState(request);
  const captain = await signInCaptain(browser, request);

  await buildAndPublish(captain, GEAR);
  await sendBlockingToEveryone(captain, GEAR.title);

  // A blocking send to everyone gates the captain too.
  await answerGate(captain, { ...GEAR, text: "A dome tent" });

  // A member who joins after the send is still gated by it: late joiners get
  // the open gate on their first page.
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await login(member, {
    id: "db-member",
    email: "member@example.com",
    displayName: "Mem Ber",
  });
  await redeemInviteAtGate(member, "TEST-INVITE-E2E-ONLY-CODE");
  // The open send is blocking, so it comes before the profile on the ladder.
  await expect(member).toHaveURL(/\/(questionnaires\/|onboarding\/)/);
  await completeOnboarding(request, "db-member");
  await member.goto("/tools");
  await answerGate(member, { ...GEAR, text: "A bell tent" });
  // Answered, the member uses the app again.
  await member.goto("/tools");
  await expect(
    member.getByRole("heading", { level: 1, name: "Tools" }),
  ).toBeVisible();

  // Read the results: the counts, then each answer.
  await captain.goto(`/captains/questionnaires/${GEAR.key}/metrics`);
  // A compact StatTile: the number, then a row holding the label.
  const answered = captain
    .getByText("Answered", { exact: true })
    .locator("xpath=../..");
  await expect(answered).toContainText("2");
  await captain.goto(`/captains/questionnaires/${GEAR.key}/responses`);
  const answers = captain.getByRole("table", { name: "Answers" });
  await expect(answers.getByText("A dome tent")).toBeVisible();
  await expect(answers.getByText("A bell tent")).toBeVisible();
  await expect(captain.getByText("2 answers")).toBeVisible();

  const href = await captain
    .getByRole("link", { name: /Export/ })
    .getAttribute("href");
  const csv = await captain.request.get(href ?? "");
  expect(csv.ok()).toBe(true);
  const body = await csv.text();
  expect(body).toContain(GEAR.prompt);
  expect(body).toContain("A bell tent");
  expect(body).toContain("Mem Ber");

  await memberContext.close();
});
