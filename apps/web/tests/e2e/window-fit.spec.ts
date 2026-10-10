import {
  test,
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
  seedParticipation,
  seedTeam,
  setRank,
} from "./_helpers";
import { desktopOnly } from "./lib/dom";
import { acceptedAt50, DISH } from "./lib/kitchen";
import {
  borderTop,
  expectBeside,
  expectFits,
  expectStacked,
  expectSticksInWindow,
  expectTablesFit,
  NARROW,
  openWindow,
  resizeWindowTo,
  tableFrameTop,
  WIDE,
  WIDEST,
} from "./lib/window-fit";

// Windows fit their own width (PR E of the 404 OS console plan). Every
// window on a 1440px screen, so a page laid out by the SCREEN's width would
// put its columns side by side even in a 470px window; laid out by the
// window's, it stacks them there and spreads them out again when the window
// is wide. Each page is checked in a narrow window (470px) and a wide one.
// The questionnaire builder and its results need the questionnaire engine,
// which the in-memory store cannot run: tests/e2e-db/window-fit.spec.ts.

test.use({ viewport: { width: 1440, height: 900 } });

async function captain(page: Page, request: APIRequestContext, id: string) {
  await login(page, { id, email: "god@example.com", displayName: "Cap Tain" });
  await page.goto("/");
  await completeOnboarding(request, id);
  await setRank(request, id, "captain");
}

async function approvedMember(
  page: Page,
  request: APIRequestContext,
  id: string,
  displayName: string,
) {
  await login(page, { id, email: `${id}@example.com`, displayName });
  await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(request, id);
}

/**
 * The Kitchen's review queue still draws its own frame around the shared
 * table (a card from page-md), so its frame is the table's parent.
 */
function kitchenFrame(win: Locator, label: string): Locator {
  return dataTable(win, label).locator("..");
}

/** A ResponsiveDataTable by its label, whichever of its two forms shows. */
function dataTable(win: Locator, label: string | RegExp): Locator {
  return win.locator('[data-slot="responsive-data-table"]').filter({
    has: win.page().getByRole("table", { name: label, includeHidden: true }),
  });
}

test.describe("windows fit their own width (test-mode)", () => {
  test.beforeEach(async ({ request }, testInfo) => {
    desktopOnly(testInfo, "windows are resized on the desktop only");
    await resetTestState(request);
  });

  test("Kitchen: a recipe, the review queue and the meal plan", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "fit-cook", "Rita Member");
    await page.goto("/kitchen/recipes/new");
    await page
      .getByLabel("Recipe text")
      .fill(
        [
          "Camp dal",
          ...Array.from(
            { length: 40 },
            (_, i) => `Step ${i + 1}: stir the pot.`,
          ),
        ].join("\n"),
      );
    await page.getByRole("button", { name: "Import recipe" }).click();
    await expect(page).toHaveURL(/\/kitchen\/recipes\/[0-9a-f-]{36}$/);
    const recipeUrl = new URL(page.url()).pathname;
    await captain(page, request, "fit-kitchen-cap");

    // The recipe: its rail (the decision) under the recipe in a narrow
    // window, beside it from page-md, so at the size the window opens at
    // (880) it sits beside the recipe as it did before windows fit.
    let win = await openWindow(page, recipeUrl, "Camp dal");
    const original = win.getByRole("article", { name: "Original" });
    const decision = win.getByRole("article", { name: "Decision" });
    await resizeWindowTo(page, win, NARROW);
    await expectFits(win);
    await expectStacked(original, decision);
    await resizeWindowTo(page, win, WIDE);
    await expectFits(win);
    await expectBeside(original, decision);

    // The rail sticks to the top of the WINDOW's scroll box while the long
    // recipe scrolls on beside it.
    await expectSticksInWindow(decision);

    // The review queue: cards in a narrow window, a framed table in a wide.
    win = await openWindow(page, "/kitchen/recipes/review", "Review recipes");
    await resizeWindowTo(page, win, NARROW);
    await expectFits(win);
    await expect(win.getByRole("table", { name: "Suggestions" })).toBeHidden();
    await expect(win.getByRole("list", { name: "Suggestions" })).toBeVisible();
    await expect
      .poll(() => borderTop(kitchenFrame(win, "Suggestions")))
      .toBe(0);
    await resizeWindowTo(page, win, WIDE);
    await expectFits(win);
    await expect(win.getByRole("list", { name: "Suggestions" })).toBeHidden();
    await expect
      .poll(() => borderTop(kitchenFrame(win, "Suggestions")))
      .toBe(1);

    // The meal plan: one card per day and no frame in a narrow window (the
    // owner's approved mock-up, design/approved-kmp.html A, 2026-10-01), the
    // framed week table with its meal columns in a wide one.
    win = await openWindow(page, "/kitchen/meal-plan", "Meal plan");
    const breakfastColumn = win.getByRole("columnheader", {
      name: "Breakfast",
    });
    // The week is its own frame.
    const frame = win.getByRole("table", { name: "Plates per day" });
    await resizeWindowTo(page, win, NARROW);
    await expectFits(win);
    await expect(breakfastColumn).toBeHidden();
    await expect(
      win.getByRole("spinbutton", { name: "Day 1 breakfast" }),
    ).toBeVisible();
    await expect.poll(() => borderTop(frame)).toBe(0);
    await resizeWindowTo(page, win, WIDE);
    await expectFits(win);
    await expect(breakfastColumn).toBeVisible();
    await expect.poll(() => borderTop(frame)).toBe(1);
  });

  test("Kitchen: a recipe in the book, its ingredients and method", async ({
    page,
    request,
  }) => {
    const recipeUrl = await acceptedAt50(page, request);
    const win = await openWindow(page, recipeUrl, DISH);
    const ingredients = win.getByRole("region", { name: "Ingredients" });
    const method = win.getByRole("region", { name: "Method" });
    await expect(method).toBeVisible();

    await resizeWindowTo(page, win, NARROW);
    await expectFits(win);
    await expectStacked(ingredients, method);
    // The opening size (880) keeps the ingredients beside the method, as
    // before windows fit (the Kitchen's layout does not change there).
    await resizeWindowTo(page, win, WIDE);
    await expectFits(win);
    await expectBeside(ingredients, method);
  });

  test("Roster: a member's profile, its fields and its rail", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "fit-ana", "Ana Member");
    await captain(page, request, "fit-roster-cap");

    const win = await openWindow(
      page,
      "/captains/camp-management",
      "Camp management",
    );
    await win
      .getByRole("button", { name: "Open Ana Member's profile" })
      .filter({ visible: true })
      .click();
    const profile = win.getByRole("region", { name: "Ana Member profile" });
    const firstField = profile.getByText("Emergency contact", { exact: true });
    const secondField = profile.getByText("Joined", { exact: true });
    // The record (overview, answers, notes) and the rail of decisions.
    const rail = profile.locator("aside");
    const record = rail.locator("xpath=preceding-sibling::div[1]");
    await expect(firstField).toBeVisible();

    await resizeWindowTo(page, win, NARROW);
    await expectFits(win);
    await expectStacked(firstField, secondField);
    await expectStacked(record, rail);

    await resizeWindowTo(page, win, WIDEST);
    await expectFits(win);
    await expectBeside(firstField, secondField);
    await expectBeside(record, rail);
  });

  test("Applications: the board where it opens, narrow, and the profile on a phone", async ({
    page,
    request,
  }) => {
    await approvedMember(
      page,
      request,
      "fit-app-a",
      "Pieter van der Merwe-Smit",
    );
    await seedParticipation(request, "fit-app-a", "accepted", "maybe");
    await approvedMember(page, request, "fit-app-b", "Kai Brennan");
    await captain(page, request, "fit-app-cap");
    await seedParticipation(request, "fit-app-cap", "applied");

    // At the size the window opens at on this screen, the six columns are a
    // table, inside the window, with the decision in sight (the audit found
    // WAP cut at the window's edge).
    const win = await openWindow(
      page,
      "/captains/applications",
      "Applications",
    );
    await expectFits(win);
    await expectTablesFit(win);
    await expect(
      win.getByRole("table", { name: "Applications" }),
    ).toBeVisible();
    const accept = win
      .getByRole("button", { name: "Accept Cap Tain for this year" })
      .filter({ visible: true });
    await expect(accept).toBeVisible();
    const edge = (await win.boundingBox())!;
    const box = (await accept.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(edge.x + edge.width);
    // Narrow, the rows are cards.
    await resizeWindowTo(page, win, NARROW);
    await expectFits(win);
    await expect(win.getByRole("list", { name: "Applications" })).toBeVisible();
    await expect(accept).toBeVisible();

    // The member's own profile on a phone: nothing runs past the screen (a
    // long name in the pixel face set the column's width).
    await login(page, {
      id: "fit-app-a",
      email: "fit-app-a@example.com",
      displayName: "Pieter van der Merwe-Smit",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await openWindow(page, "/profile", "Your profile");
    const ddt = page.getByRole("radio", { name: /^I want a DDT/ });
    await ddt.scrollIntoViewIfNeeded();
    const right = await ddt.evaluate((el) => el.getBoundingClientRect().right);
    expect(right).toBeLessThanOrEqual(390);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
      )
      .toBeLessThanOrEqual(0);
  });

  test("Power: the answer rail beside the open section, and the rail alone when narrow", async ({
    page,
    request,
  }) => {
    await captain(page, request, "fit-power-cap");
    await seedTeam(request, "fit-power-cap", "power_and_lighting", true);
    const seeded = await page.request.post("/api/test/seed-power", {
      data: { authUserId: "fit-power-cap" },
    });
    expect(seeded.ok(), await seeded.text()).toBe(true);

    const win = await openWindow(page, "/power/loads", "Power");
    const rail = win.getByRole("navigation", { name: "Power" });
    const section = win.getByRole("heading", { level: 2, name: "Load list" });
    const edit = win.getByRole("button", { name: "Edit Coffee urn" });
    // At the size a window opens at, the rail sits beside the section and
    // every row's Edit is in sight: the list's columns fit the window.
    await resizeWindowTo(page, win, WIDE);
    await expectFits(win);
    await expectBeside(rail, section);
    await expect(edit).toBeVisible();
    // Narrow, the section stands alone, with a way back to the rail.
    await resizeWindowTo(page, win, NARROW);
    await expectFits(win);
    await expect(rail).toBeHidden();
    await expect(
      win.getByRole("link", { name: "‹ All of Power" }),
    ).toBeVisible();
    await expect(edit).toBeVisible();
    // The rail stays in reach while a long section scrolls beside it.
    await resizeWindowTo(page, win, WIDE);
    await expectSticksInWindow(rail.getByRole("link", { name: /Grid/ }));
  });

  test("Payments: the ledger's frame and the year's figures above it", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "fit-payer", "Pat Payer");
    await captain(page, request, "fit-pay-cap");

    const win = await openWindow(page, "/captains/payments", /^Payments$/);
    await win.getByRole("button", { name: "Record a payment" }).click();
    const dialog = page.getByRole("dialog", { name: "Record a payment" });
    const member = dialog.locator("#payment-member");
    const value = await member
      .locator("option", { hasText: "Pat Payer" })
      .getAttribute("value");
    await member.selectOption(value!);
    await dialog.getByLabel("Amount (R)").fill("1500");
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(dialog).toBeHidden();

    // The year's figures sit above the ledger at every width: two by two in
    // a narrow window, four in a row in a wide one.
    const ledger = win.getByRole("region", { name: /^Payments for / });
    const paidUp = win.getByRole("group", { name: "Paid up" });
    const toCome = win.getByRole("group", { name: "Still to come in" });
    const inBank = win.getByRole("group", { name: "In the bank" });
    await expect(ledger).toBeVisible();
    await resizeWindowTo(page, win, NARROW);
    await expectFits(win);
    await expectStacked(paidUp, ledger);
    await expectBeside(paidUp, toCome);
    await expectStacked(paidUp, inBank);
    await expect(
      win.getByRole("table", { name: /^Payments for / }),
    ).toBeHidden();
    // The ledger is a card list here, not a framed table.
    const ledgerTable = dataTable(win, /^Payments for /);
    await expect.poll(() => tableFrameTop(ledgerTable)).toBe(0);
    await resizeWindowTo(page, win, WIDE);
    await expectFits(win);
    await expect.poll(() => tableFrameTop(ledgerTable)).toBe(1);
    await resizeWindowTo(page, win, WIDEST);
    await expectStacked(paidUp, ledger);
    await expectBeside(toCome, inBank);
  });

  test("Tasks: the board's columns", async ({ page, request }) => {
    await captain(page, request, "fit-tasks-cap");
    const win = await openWindow(page, "/tasks", "Tasks");
    const todo = win.getByRole("region", { name: "To do" });
    const doing = win.getByRole("region", { name: "Doing" });
    // Narrow: one column at a time, picked from the Column switch with its
    // count, so the board is not one long list.
    await resizeWindowTo(page, win, NARROW);
    await expectFits(win);
    const pickColumn = win.getByRole("radiogroup", { name: "Column" });
    await expect(pickColumn).toBeVisible();
    await expect(todo).toBeVisible();
    await expect(doing).toBeHidden();
    await pickColumn.getByRole("radio", { name: /^Doing \d+$/ }).click();
    await expect(doing).toBeVisible();
    await expect(todo).toBeHidden();
    await resizeWindowTo(page, win, WIDEST);
    await expectFits(win);
    await expect(pickColumn).toBeHidden();
    await expectBeside(todo, doing);
  });

  test("the Calendar's New event form and System", async ({ page, request }) => {
    await captain(page, request, "fit-misc-cap");

    // The Calendar: the form above the month in a narrow window, beside it
    // in a wide one.
    let win = await openWindow(
      page,
      "/calendar?view=month&month=2026-10&new=2026-10-15",
      "Calendar",
    );
    const form = win.getByRole("form", { name: "New event" });
    await resizeWindowTo(page, win, NARROW);
    await expectFits(win);
    await expectStacked(form, win.locator("[data-phone-month]"));
    await resizeWindowTo(page, win, WIDEST);
    await expectFits(win);
    await expectBeside(win.locator("[data-month-grid]"), form);

    // System: each check's name above its detail, then beside it.
    win = await openWindow(page, "/captains/system", "System status");
    const name = win.locator("dt").first();
    const detail = win.locator("dd").first();
    await resizeWindowTo(page, win, NARROW);
    await expectFits(win);
    await expectStacked(name, detail);
    await resizeWindowTo(page, win, WIDE);
    await expectFits(win);
    await expectBeside(name, detail);
  });

  test("Inventory: Needs filters sit in a row wide, behind Filters narrow", async ({
    page,
    request,
  }) => {
    await captain(page, request, "fit-needs-cap");
    let win = await openWindow(page, "/inventory/needs", "Inventory");
    await win.getByRole("button", { name: "Add need" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a need" });
    await dialog.getByLabel("What").fill("Camping chairs");
    await dialog.getByLabel("How many needed").fill("4");
    await dialog.getByRole("button", { name: "Add need" }).click();
    await expect(page.getByText("Need added")).toBeVisible();

    win = await openWindow(page, "/inventory/needs", "Inventory");
    const team = win.getByLabel("Team", { exact: true });
    const filtersButton = win.getByRole("button", { name: /^Filters/ });
    await resizeWindowTo(page, win, NARROW);
    await expectFits(win);
    await expect(filtersButton).toBeVisible();
    await expect(team).toBeHidden();
    await filtersButton.click();
    await expect(team).toBeVisible();

    await resizeWindowTo(page, win, WIDE);
    await expectFits(win);
    await expect(filtersButton).toBeHidden();
    await expect(team).toBeVisible();
  });
});
