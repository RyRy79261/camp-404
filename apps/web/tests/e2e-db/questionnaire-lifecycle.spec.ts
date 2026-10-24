import { test, expect } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
} from "../e2e/_helpers";
import {
  answerGate,
  buildQuestionnaire,
  sendBlockingToEveryone,
  signInCaptain,
} from "./_flows";
import { signInAs } from "./personas";

// The questionnaire engine end to end, on a real database: a captain builds
// and sends a questionnaire (sending puts it online); a member is gated by it,
// answers it and reads the results back; the captain reads the answers and
// exports them. The in-memory store cannot
// run any of this (owner's call E2E-DB).

const GEAR = {
  title: "Gear check",
  key: "gear-check",
  prompt: "What tent are you bringing?",
};

test("build, send, answer, read the results", async ({ browser, request }) => {
  await resetTestState(request);
  const captain = await signInCaptain(browser, request);

  await buildQuestionnaire(captain, GEAR);
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
  await member.goto("/tools/forms");
  await answerGate(member, { ...GEAR, text: "A bell tent" });
  // Answered, the member uses the app again.
  await member.goto("/tools/forms");
  await expect(
    member.getByRole("heading", { level: 1, name: "My forms" }),
  ).toBeVisible();

  // Having answered, the member reads the results: counts first, then names.
  await member.goto(`/questionnaires/results/${GEAR.key}`);
  await expect(
    member.getByText("2 people answered.", { exact: false }),
  ).toBeVisible({
    timeout: 60_000,
  });
  await expect(member.getByText("2 answered · 0 skipped")).toBeVisible();
  await expect(member.getByText("A dome tent")).toHaveCount(0);
  await member.getByRole("button", { name: "See who answered what" }).click();
  await expect(member.getByText("A dome tent")).toBeVisible();
  await expect(member.getByText("A bell tent")).toBeVisible();

  // Read the results: the counts, then each answer.
  await captain.goto(`/captains/questionnaires/${GEAR.key}/metrics`);
  // The completion card counts both finished answers, and the Summary tab
  // charts the one question: a count, since the answers are free text.
  await expect(captain.getByText(/^2 answers summarised/)).toBeVisible();
  await expect(captain.getByText("2 answered · 0 skipped")).toBeVisible();
  await expect(captain.getByText("A dome tent")).toHaveCount(0);
  // The Individual tab lists each answer under its question…
  await captain
    .getByRole("radiogroup", { name: "Results view" })
    .getByRole("radio", { name: "Individual" })
    .click();
  await expect(captain).toHaveURL(
    new RegExp(`/captains/questionnaires/${GEAR.key}/responses\\?cycle=`),
  );
  const answers = captain.getByRole("table", { name: "Answers" });
  await expect(answers.getByText("A dome tent")).toBeVisible();
  await expect(answers.getByText("A bell tent")).toBeVisible();
  // …and opens one member's answers in the viewer.
  await answers
    .getByRole("button", { name: "View Mem Ber\u2019s response" })
    .click();
  const viewer = captain.getByRole("dialog", {
    name: "Mem Ber\u2019s response",
  });
  await expect(viewer.getByText(GEAR.prompt)).toBeVisible();
  await expect(viewer.getByText("A bell tent")).toBeVisible();
  await captain.keyboard.press("Escape");
  // /responses still opens straight on the table.
  await captain.goto(`/captains/questionnaires/${GEAR.key}/responses`);
  await expect(
    captain.getByRole("table", { name: "Answers" }).getByText("A bell tent"),
  ).toBeVisible();

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

test("a team lead builds a questionnaire and sends it to the whole camp in one step", async ({
  browser,
  request,
}) => {
  await resetTestState(request);
  const lead = await signInAs(browser, request, "team_lead");
  await buildQuestionnaire(lead, GEAR);
  // No captain needed: the lead's Send puts it online and asks everyone.
  await sendBlockingToEveryone(lead, GEAR.title);
  await answerGate(lead, { ...GEAR, text: "A dome tent" });

  await lead.goto("/captains/questionnaires");
  await expect(
    lead.getByRole("link", { name: `See results for ${GEAR.title}` }),
  ).toBeVisible({
    timeout: 60_000,
  });
});
