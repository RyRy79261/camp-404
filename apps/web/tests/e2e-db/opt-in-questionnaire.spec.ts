import { test, expect } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
} from "../e2e/_helpers";
import { buildAndPublish, signInCaptain } from "./_flows";
import { signInAs } from "./personas";

// Optional questionnaires (#313, owner approved 2026-10-03: "Build the opt in
// questionnaire and label it optional"), on a real database: the builder's
// questionnaires are not modelled by the in-memory store (owner's call E2E-DB).
// A captain puts a questionnaire in My forms that nobody has to answer; a
// member answers it from Optional and it moves to Submitted questionnaires;
// the captain sees how many chose to answer and closes it, which takes it out
// of everyone's Optional section. A team lead is never asked "Who answers?".

const ART = {
  title: "Help build the art piece",
  key: "help-build-the-art-piece",
  prompt: "What can you do?",
};

test("a captain puts a questionnaire in My forms and a member answers it from Optional", async ({
  browser,
  request,
}) => {
  await resetTestState(request);
  const captain = await signInCaptain(browser, request);
  await buildAndPublish(captain, ART);

  // Send: "Who answers?" → Anyone may answer (optional).
  await captain.goto(`/captains/questionnaires/${ART.key}/send`);
  const who = captain.getByRole("radiogroup", { name: "Who answers?" });
  await expect(who).toBeVisible({ timeout: 60_000 });
  await who.getByRole("radio", { name: /^Anyone may answer/ }).click();
  await expect(captain.getByText("What happens when you send")).toBeVisible();
  await expect(
    captain.getByRole("switch", { name: "Tell everyone it's there" }),
  ).not.toBeChecked();
  // No audience, Blocking or due date for an optional questionnaire.
  await expect(captain.getByRole("switch", { name: "Blocking" })).toHaveCount(
    0,
  );
  await captain
    .getByRole("button", { name: "Put it in My forms", exact: true })
    .click();
  await expect(captain).toHaveURL(
    new RegExp(`/captains/questionnaires/${ART.key}$`),
    { timeout: 60_000 },
  );

  // A member who joins afterwards finds it under Optional, not held by it.
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await login(member, {
    id: "db-member",
    email: "member@example.com",
    displayName: "Mem Ber",
  });
  await redeemInviteAtGate(member, "TEST-INVITE-E2E-ONLY-CODE");
  // Nothing optional blocks: the next rung is the burner profile, as always.
  await expect(member).toHaveURL(/\/onboarding\//);
  await completeOnboarding(request, "db-member");
  await member.goto("/tools/forms");
  await expect(
    member.getByRole("heading", { level: 1, name: "My forms" }),
  ).toBeVisible({ timeout: 60_000 });
  const optional = member.getByRole("region", { name: "Optional" });
  await expect(
    optional.getByText("Nobody has to fill these in. Answer if you want to."),
  ).toBeVisible();
  const card = optional.getByRole("link", { name: new RegExp(ART.title) });
  await expect(card.getByText("Optional", { exact: true })).toBeVisible();
  await card.click();

  await expect(
    member.getByRole("heading", { level: 1, name: ART.title }),
  ).toBeVisible({ timeout: 60_000 });
  await member.getByRole("textbox", { name: ART.prompt }).fill("Welding");
  await member.getByRole("button", { name: "Submit" }).click();

  // Back on My forms: thanked, and the card has moved to Submitted.
  await expect(member).toHaveURL(/\/tools\/forms\?answered=[0-9a-f-]{36}$/, {
    timeout: 60_000,
  });
  await expect(
    member.getByText(`Thanks. Your answers to ${ART.title} are saved.`),
  ).toBeVisible();
  const submitted = member.getByRole("region", {
    name: "Submitted questionnaires",
  });
  await expect(
    submitted.getByRole("link", { name: new RegExp(ART.title) }),
  ).toBeVisible();
  await expect(member.getByRole("region", { name: "Optional" })).toHaveCount(0);
  await member.getByRole("link", { name: "View my answers" }).click();
  await expect(member.getByText("Welding")).toBeVisible({ timeout: 60_000 });

  // Results: how many chose to answer, no percentage and no Remind.
  await captain.goto(`/captains/questionnaires/${ART.key}/metrics`);
  await expect(captain.getByText("chose to answer")).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    captain.getByText(
      /^0 started and haven't finished · \d+ camp members? can see it$/,
    ),
  ).toBeVisible();
  await expect(captain.getByText("Anyone may answer")).toBeVisible();
  await expect(captain.getByRole("button", { name: /Remind/ })).toHaveCount(0);
  await expect(captain.getByText(/still to answer/)).toHaveCount(0);
  await expect(
    captain.getByRole("link", { name: "See each answer" }),
  ).toBeVisible();

  // Close send takes it out of everyone's Optional section.
  await captain.getByRole("button", { name: "Close send" }).click();
  await captain
    .getByRole("dialog")
    .getByRole("button", { name: "Close send" })
    .click();
  await expect(
    captain.getByText("Closed: it is no longer in My forms"),
  ).toBeVisible();

  // A member who never answered no longer sees it.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await login(other, {
    id: "db-other",
    email: "other@example.com",
    displayName: "Oth Er",
  });
  await redeemInviteAtGate(other, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(other).toHaveURL(/\/onboarding\//);
  await completeOnboarding(request, "db-other");
  await other.goto("/tools/forms");
  await expect(
    other.getByRole("heading", { level: 1, name: "My forms" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(other.getByRole("region", { name: "Optional" })).toHaveCount(0);

  await memberContext.close();
  await otherContext.close();
});

test("a team lead is never asked who answers", async ({ browser, request }) => {
  await resetTestState(request);
  const captain = await signInCaptain(browser, request);
  await buildAndPublish(captain, ART);

  const lead = await signInAs(browser, request, "team_lead");
  await lead.goto(`/captains/questionnaires/${ART.key}/send`);
  // Present first (the lead's own team), then the absence.
  await expect(
    lead.getByRole("radiogroup", { name: "Which team?" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    lead.getByRole("radiogroup", { name: "Who answers?" }),
  ).toHaveCount(0);
  await expect(lead.getByText(/Anyone may answer/)).toHaveCount(0);
  await expect(
    lead.getByRole("button", { name: "Put it in My forms" }),
  ).toHaveCount(0);
});
