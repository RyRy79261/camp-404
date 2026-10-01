import { test, expect, type Page } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
  seedTeam,
} from "../e2e/_helpers";
import { sendBlockingToEveryone, signInCaptain } from "./_flows";

// The post-burn survey (#251), end to end on a real database: a captain plans
// two meals, starts a draft from the survey template (its star ratings take
// one row per meal), publishes and sends it; a member rates the two meals and
// never sees the team leads' questions; a lead of another team does; the
// results page shows each meal's average. The in-memory store runs no builder
// questionnaires, so this lives in the real-database suite.

const SURVEY = { title: "Post-burn survey", key: "post-burn-survey" };

/** Answer the survey this page is held at: rate the two meals, then submit. */
async function answerSurvey(
  page: Page,
  ratings: { dinner: number; breakfast: number },
  seesLeads: boolean,
): Promise<void> {
  await expect(page).toHaveURL(/\/questionnaires\/[0-9a-f-]{36}$/, {
    timeout: 60_000,
  });
  await expect(
    page.getByRole("heading", { level: 1, name: SURVEY.title }),
  ).toBeVisible({ timeout: 30_000 });

  // Shifts: the statements for everyone; the leads' only for a lead.
  await expect(
    page.getByRole("group", { name: "The work was shared fairly" }),
  ).toBeVisible();
  await expect(page.getByText("For team leads")).toHaveCount(seesLeads ? 1 : 0);
  await expect(
    page.getByRole("group", { name: "My team had enough people" }),
  ).toHaveCount(seesLeads ? 1 : 0);
  await page.getByRole("button", { name: "Next" }).click();

  // Kitchen: one star row per meal the plan serves.
  const dinner = page.getByRole("group", { name: "Day 1 dinner" });
  const breakfast = page.getByRole("group", { name: "Day 2 breakfast" });
  await expect(dinner).toBeVisible();
  await expect(breakfast).toBeVisible();
  // A star is a native radio: pick it by keyboard, as a screen reader would.
  await dinner.getByRole("radio", { name: /, 1 of 5$/ }).focus();
  for (let i = 1; i < ratings.dinner; i += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(
    dinner.getByRole("radio", {
      name: new RegExp(`, ${ratings.dinner} of 5$`),
    }),
  ).toBeChecked();
  // And by pointer: a tap on the star (the radio's label).
  const breakfastStar = breakfast.getByRole("radio", {
    name: new RegExp(`, ${ratings.breakfast} of 5$`),
  });
  await breakfastStar.locator("xpath=..").click();
  await expect(breakfastStar).toBeChecked();

  // Water and waste, communication, general: nothing required.
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole("button", { name: "Next" }).click();
  }
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Questionnaire complete" }),
  ).toBeVisible();
}

test("a captain sends the post-burn survey, members rate two meals, results show both averages", async ({
  browser,
  request,
}) => {
  // Three people walk a five-page survey: past the suite's 2 minutes on CI.
  test.setTimeout(300_000);
  await resetTestState(request);
  const captain = await signInCaptain(browser, request);

  // This year's meal plan serves dinner on day 1 and breakfast on day 2.
  await captain.goto("/kitchen/meal-plan");
  await captain.getByLabel("Days on site").fill("2");
  await captain.getByLabel("Day 1 dinner").fill("30");
  await captain.getByLabel("Day 2 breakfast").fill("30");
  await captain.getByRole("button", { name: "Save" }).click();
  await expect(captain.getByText("Meal plan saved")).toBeVisible();

  // Start a draft from the template. Nothing is sent by that.
  await captain.goto("/captains/questionnaires");
  await captain.getByRole("button", { name: "New questionnaire" }).click();
  await captain.getByRole("button", { name: "Use this template" }).click();
  await expect(captain).toHaveURL(
    new RegExp(`/captains/questionnaires/${SURVEY.key}$`),
    { timeout: 60_000 },
  );
  const rail = captain.getByRole("complementary", { name: "Publish and send" });
  await rail.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(rail.getByText("Published", { exact: true })).toBeVisible();

  await sendBlockingToEveryone(captain, SURVEY.title);
  // A blocking send gates the captain too; a captain sees the leads' part.
  await answerSurvey(captain, { dinner: 4, breakfast: 2 }, true);

  // A plain member: never sees the team leads' questions.
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
  await answerSurvey(member, { dinner: 5, breakfast: 3 }, false);

  // A lead of any team (here Structures) sees them: clearance is global.
  const leadContext = await browser.newContext();
  const lead = await leadContext.newPage();
  await login(lead, {
    id: "db-lead",
    email: "lead@example.com",
    displayName: "Le Ad",
  });
  await redeemInviteAtGate(lead, "TEST-INVITE-E2E-ONLY-CODE");
  // The open send is blocking, so it comes before the profile on the ladder.
  await expect(lead).toHaveURL(/\/(questionnaires\/|onboarding\/)/);
  await completeOnboarding(request, "db-lead");
  await seedTeam(request, "db-lead", "structures", true);
  await lead.goto("/tools/forms");
  await answerSurvey(lead, { dinner: 4, breakfast: 1 }, true);

  // The results: each meal's average and how many rated it.
  await captain.goto(`/captains/questionnaires/${SURVEY.key}/metrics`);
  const averages = captain.getByRole("table", {
    name: /Average for each row/,
  });
  const meals = averages.filter({ hasText: "Day 1 dinner" });
  await expect(
    meals
      .getByRole("row", { name: /Day 1 dinner/ })
      .getByRole("cell")
      .first(),
  ).toHaveText(/^4\.33\s*of 5$/);
  await expect(
    meals
      .getByRole("row", { name: /Day 2 breakfast/ })
      .getByRole("cell")
      .first(),
  ).toHaveText(/^2\s*of 5$/);
  await expect(
    meals
      .getByRole("row", { name: /Day 1 dinner/ })
      .getByRole("cell")
      .nth(1),
  ).toHaveText("3");

  await memberContext.close();
  await leadContext.close();
});
