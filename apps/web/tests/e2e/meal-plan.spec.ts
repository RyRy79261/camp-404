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

// The Kitchen's meal plan (the owner's sketch, 2026-09-24, test-mode): this
// year's days on site and the plates at breakfast, lunch and dinner, reached
// from the recipe book. A captain or a Kitchen lead edits it (Save in the
// heading, "Copy Day 1 to every day"), and it persists; a member reads it and
// changes nothing; a lead of another team the same. The editor sets the date
// of day 1 beside the days on site, and every day row then shows its date
// ("Day 1 · Sat 25 Apr"), for the editor and a member alike. The page fits a
// phone.

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

    // Eleven empty days to start with.
    await expect(page.getByLabel("Days on site")).toHaveValue("11");
    await expect(page.getByRole("rowheader", { name: "Day 11" })).toBeVisible();
    await expect(page.getByLabel("Day 1 breakfast")).toHaveValue("0");

    // A count out of range is refused beside it, and nothing saves.
    await page.getByLabel("Day 1 lunch").fill("501");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Give at most 500 plates.")).toBeVisible();

    await page.getByLabel("Days on site").fill("3");
    await expect(page.getByRole("rowheader", { name: "Day 4" })).toHaveCount(0);
    await page.getByLabel("Day 1 breakfast").fill("20");
    await page.getByLabel("Day 1 lunch").fill("0");
    await page.getByLabel("Day 1 dinner").fill("25");
    await page.getByRole("button", { name: "Copy Day 1 to every day" }).click();
    await expect(page.getByLabel("Day 3 dinner")).toHaveValue("25");
    await page.getByLabel("Day 2 dinner").fill("50");
    // The date of day 1, beside the days on site, dates every row at once.
    await expect(page.getByLabel("Day 1 date")).toHaveValue("");
    await page.getByLabel("Day 1 date").fill("2026-04-25");
    await expect(
      page.getByRole("rowheader", { name: "Day 1 · Sat 25 Apr" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Meal plan saved")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Day 1 date")).toHaveValue("2026-04-25");
    await expect(
      page.getByRole("rowheader", { name: "Day 3 · Mon 27 Apr" }),
    ).toBeVisible();
    await expect(page.getByLabel("Days on site")).toHaveValue("3");
    await expect(page.getByLabel("Day 2 dinner")).toHaveValue("50");
    await expect(page.getByLabel("Day 3 breakfast")).toHaveValue("20");
    await expect(page.getByRole("rowheader", { name: "Day 4" })).toHaveCount(0);

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

    // A member reads the same plan, and changes nothing.
    await member(page, request, "mp-member");
    await page.goto("/kitchen/meal-plan");
    const table = page.getByRole("table", { name: "Plates per day" });
    await expect(
      table.getByRole("row", { name: /Day 2/ }).getByText("50"),
    ).toBeVisible();
    // A member reads each day's date too, and has no date to change.
    await expect(
      table.getByRole("rowheader", { name: "Day 2 · Sun 26 Apr" }),
    ).toBeVisible();
    await expect(page.getByLabel("Day 1 date")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Copy Day 1 to every day" }),
    ).toHaveCount(0);
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
      page
        .getByRole("table", { name: "Plates per day" })
        .getByRole("row", { name: /Day 1/ })
        .getByText("40"),
    ).toBeVisible();
  });
});
