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
import { setPhaseDays } from "./lib/logistics";

// The Kitchen's meal plan (the owner's sketch, 2026-09-24, test-mode): this
// year's days on site and the plates at breakfast and dinner (the camp does
// no lunch), reached from the recipe book. A captain or a Kitchen lead edits
// it (Save in the heading, "Copy Day 1's plates to every day"), and it
// persists; a member reads the menu as a card per day and changes nothing; a
// lead of another team the same. The dates are not the meal plan's (the
// owner, 2026-10-03): Day 1 and the days on site come from Logistics (the
// first Build day), said in a plain line with a link there, and every day
// then shows its date ("Day 1 · Sat 25 Apr"), for the editor and a member
// alike. The page fits a phone.

async function member(
  page: Page,
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await login(page, { id, email: `${id}@example.com`, displayName: id });
  await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(request, id);
}

test.describe("meal plan (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a captain fills the days from the recipe book, copies Day 1, and it persists; a member only reads it", async ({
    page,
    request,
  }) => {
    await login(page, {
      id: "mp-cap",
      email: "god@example.com",
      displayName: "Cap Tain",
    });
    await page.goto("/");
    await completeOnboarding(request, "mp-cap");
    await setRank(request, "mp-cap", "captain");

    await page.goto("/kitchen/recipes");
    await page.getByRole("link", { name: "Meal plan" }).click();
    await expect(page).toHaveURL("/kitchen/meal-plan");
    await expect(
      page.getByRole("heading", { level: 1, name: "Meal plan" }),
    ).toBeVisible();

    // No dates in Logistics yet: eleven empty days, by number.
    await expect(
      page.getByText("Set the camp’s dates in Logistics first"),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Change the dates in Logistics" }),
    ).toHaveAttribute("href", "/logistics");
    await expect(page.getByLabel("Days on site")).toHaveCount(0);
    await expect(page.getByLabel("Day 1 date")).toHaveCount(0);
    await expect(page.getByRole("rowheader", { name: "Day 11" })).toBeVisible();
    await expect(page.getByLabel("Day 1 breakfast")).toHaveValue("0");

    // A count out of range is refused beside it, and nothing saves.
    await expect(page.getByLabel(/lunch/i)).toHaveCount(0);
    await page.getByLabel("Day 1 dinner").fill("501");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Give at most 500 plates.")).toBeVisible();

    // Nothing left unsaved, so leaving the page asks nothing.
    await page.getByLabel("Day 1 dinner").fill("0");

    // Three days of Build in Logistics: Day 1 is Sat 25 Apr, three days on
    // site, and every row is dated at once.
    await setPhaseDays(page, "Build", "2026-04-25", "2026-04-27");
    await page.goto("/kitchen/meal-plan");
    await expect(
      page.getByText("Day 1: Sat 25 Apr · 3 days on site, from Logistics"),
    ).toBeVisible();
    await expect(
      page.getByRole("rowheader", { name: "Day 1 · Sat 25 Apr" }),
    ).toBeVisible();
    await expect(page.getByRole("rowheader", { name: /^Day 4/ })).toHaveCount(
      0,
    );
    await page.getByLabel("Day 1 breakfast").fill("20");
    await page.getByLabel("Day 1 dinner").fill("25");
    await page
      .getByRole("button", { name: "Copy Day 1’s plates to every day" })
      .click();
    await expect(page.getByLabel("Day 3 dinner")).toHaveValue("25");
    await page.getByLabel("Day 2 dinner").fill("50");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Meal plan saved")).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("rowheader", { name: "Day 3 · Mon 27 Apr" }),
    ).toBeVisible();
    await expect(page.getByLabel("Day 2 dinner")).toHaveValue("50");
    await expect(page.getByLabel("Day 3 breakfast")).toHaveValue("20");
    await expect(page.getByRole("rowheader", { name: /^Day 4/ })).toHaveCount(
      0,
    );

    // At phone width the page never scrolls sideways.
    await page.setViewportSize({ width: 390, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      )
      .toBe(true);

    // A member reads the menu, a card per day with its date, and changes
    // nothing.
    await member(page, request, "mp-member");
    await page.goto("/kitchen/meal-plan");
    const day2 = page.getByRole("region", { name: /Sun 26 Apr/ });
    await expect(day2).toContainText("Dinner50 plates");
    await expect(day2).toContainText("Dishes not chosen yet");
    await expect(page.getByText("Sat 25 – Mon 27 Apr")).toBeVisible();
    await expect(page.getByLabel("Day 1 date")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Copy Day 1/ })).toHaveCount(
      0,
    );
    await expect(page.getByRole("spinbutton")).toHaveCount(0);
  });

  test("a Kitchen lead edits it; a lead of another team does not", async ({
    page,
    request,
  }) => {
    await member(page, request, "mp-lead");
    await seedTeam(request, "mp-lead", "kitchen", true);
    await page.goto("/kitchen/meal-plan");
    await page.getByLabel("Day 1 dinner").fill("40");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Meal plan saved")).toBeVisible();

    await member(page, request, "mp-struct");
    await seedTeam(request, "mp-struct", "structures", true);
    await page.goto("/kitchen/meal-plan");
    await expect(
      page.getByRole("heading", { level: 1, name: "Meal plan" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Day 1", exact: true }),
    ).toContainText("Dinner40 plates");
  });
});
