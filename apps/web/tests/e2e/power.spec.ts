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
} from "./_helpers";
import { expectRailLine } from "./lib/power";

// The Power program in the owner's approved redesign (option B, the answer
// rail, 2026-10-01): a rail with every section's answer, the open section
// beside it, each section opening on its answer. Test-mode.
//
//  - The load list (#253). A Power & Lighting lead adds a freezer (1 × 320 W,
//    all day: 7.68 kWh) and a LED strip through the quick-add helper (12 V,
//    4.8 W/m, 100 m = 480 W) on 6 h a day (2.88 kWh). Editing the strip to
//    5 h makes it 2.40; removing it, from the foot of its edit dialog, leaves
//    the freezer. A lead of Kitchen stands on the same team_lead rung and
//    reads the list as content: no Add, no Edit, greyed or not.
//  - The fuel estimate (#254). The issue's generator (5.5 kVA rated, 6 max,
//    13.5 L tank, 9.8 h at 50% and 5.5 h at 100%) and one 1065 W load all
//    day, planned 10 days at 24 h: 236.7 L with a 20% margin, 12 cans of
//    20 L. Run 18:00–06:00 only, it is 6 cans, and the page warns of the
//    12.78 kWh a day that falls in the hours the generator is off.
//  - On a phone the rail is the home list; a tap opens a section, with a
//    way back.

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

/** Open a Power section and wait for its own heading. */
async function openSection(page: Page, path: string, title: string) {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: "Power" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: title }),
  ).toBeVisible();
}

const loadRow = (page: Page, name: string) =>
  page.getByRole("list", { name: "Loads" }).getByRole("listitem", { name });

const answer = (page: Page) => page.getByRole("region", { name: "The answer" });

/** The figure beside a line of the fuel estimate's working. */
function ledger(page: Page, label: string) {
  return page
    .getByRole("region", { name: "How we get there" })
    .locator("div", { has: page.getByText(label, { exact: true }) })
    .last()
    .locator("dd");
}

test.describe("power load list (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a P&L lead keeps the list and sees each load's energy; a Kitchen lead only reads", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "pwr-lead", "Pat Lead");
    await seedTeam(request, "pwr-lead", "power_and_lighting", true);
    await openSection(page, "/power/loads", "Load list");
    await expect(page.getByText("No loads yet.")).toBeVisible();

    // The freezer, typed in watts.
    await page.getByRole("button", { name: "Add a load", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Add a load" });
    await dialog
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Deep freeze");
    await dialog.getByLabel("Area").fill("kitchen");
    await dialog.getByRole("combobox", { name: "Category" }).click();
    await page.getByRole("option", { name: "Refrigeration" }).click();
    await dialog
      .getByRole("spinbutton", { name: "Watts each", exact: true })
      .fill("320");
    await expect(dialog.getByText("This row: 320 W running")).toBeVisible();
    // The rare fields wait under "More detail" until someone opens it.
    await expect(dialog.getByLabel("Duty cycle (%)")).toBeHidden();
    await dialog.locator("summary", { hasText: "More detail" }).click();
    await expect(dialog.getByLabel("Duty cycle (%)")).toHaveValue("100");
    await dialog.getByRole("button", { name: "Add load" }).click();
    await expect(page.getByText("Load added")).toBeVisible();
    await expect(loadRow(page, "Deep freeze")).toContainText("7.68");
    // No generator yet: the answer says so, and the rail too.
    await expect(answer(page)).toContainText("No generator chosen yet.");
    await expectRailLine(
      page,
      /Load list/,
      "No generator chosen yet",
      "Load list",
    );

    // The strip, through the LED helper, on 6 h a day.
    await page.getByRole("button", { name: "Add a load", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Add a load" });
    await dialog.getByRole("radio", { name: "LED strip" }).click();
    await dialog.getByLabel("Strip volts").fill("12");
    await dialog.getByLabel("Watts per metre").fill("4.8");
    await dialog.getByLabel("Metres", { exact: true }).fill("100");
    await expect(dialog.getByText("480 W · 40 A at 12 V")).toBeVisible();
    await dialog.getByRole("button", { name: "Use these figures" }).click();
    await expect(
      dialog.getByRole("spinbutton", { name: "Watts each", exact: true }),
    ).toHaveValue("480");
    await dialog
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Fairy lights");
    await dialog.getByLabel("Area").fill("lounge");
    await dialog.getByRole("radio", { name: "Hours a day" }).click();
    await dialog.getByLabel("Hours it runs each day").fill("6");
    // The helper's 12 V strip is not mains, so "More detail" opens to show it.
    await expect(dialog.getByLabel("Volts", { exact: true })).toHaveValue("12");
    await expect(
      dialog.getByText("This row: 480 W running · 2,880 Wh a day"),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Add load" }).click();
    await expect(page.getByText("Load added")).toBeVisible();
    await expect(loadRow(page, "Fairy lights")).toContainText("2.88");

    // Edit the strip to 5 h a day: one Edit, in the row's fixed column.
    await loadRow(page, "Fairy lights")
      .getByRole("button", { name: "Edit Fairy lights" })
      .click();
    dialog = page.getByRole("dialog", { name: "Edit load" });
    await dialog.getByLabel("Hours it runs each day").fill("5");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Load updated")).toBeVisible();
    await expect(loadRow(page, "Fairy lights")).toContainText("2.40");

    // Remove it, from the foot of its edit dialog.
    await loadRow(page, "Fairy lights")
      .getByRole("button", { name: "Edit Fairy lights" })
      .click();
    await page
      .getByRole("dialog", { name: "Edit load" })
      .getByRole("button", { name: "Remove load" })
      .click();
    await page
      .getByRole("dialog", { name: "Remove Fairy lights?" })
      .getByRole("button", { name: "Remove load" })
      .click();
    await expect(page.getByText("Load removed")).toBeVisible();
    await expect(loadRow(page, "Deep freeze")).toBeVisible();
    await expect(loadRow(page, "Fairy lights")).toHaveCount(0);

    // A lead of Kitchen reads the list but has nothing to press.
    await approvedMember(page, request, "pwr-kitchen", "Kit Chen");
    await seedTeam(request, "pwr-kitchen", "kitchen", true);
    await openSection(page, "/power/loads", "Load list");
    await expect(loadRow(page, "Deep freeze")).toContainText("7.68");
    await expect(
      page.getByText("Only captains and Power & Lighting leads change this."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add a load", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Edit Deep freeze" }),
    ).toHaveCount(0);
  });
});

test.describe("power fuel estimate (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a P&L lead picks a generator and plans 24 h, then set hours; a Kitchen lead only reads", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "fuel-lead", "Pat Fuel");
    await seedTeam(request, "fuel-lead", "power_and_lighting", true);
    await openSection(page, "/power/fuel", "Fuel estimate");
    await expect(page.getByText("No generators yet.")).toBeVisible();

    // The generator, from its datasheet.
    await page
      .getByRole("button", { name: "Add a generator", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Add a generator" });
    await dialog.getByRole("textbox", { name: "Model" }).fill("Test 5.5");
    await dialog.getByRole("spinbutton", { name: "Rated kVA" }).fill("5.5");
    await dialog.getByRole("spinbutton", { name: "Max kVA" }).fill("6");
    await dialog.getByRole("spinbutton", { name: "Tank (L)" }).fill("13.5");
    await dialog
      .getByRole("spinbutton", { name: "Runtime at 50% load (h)" })
      .fill("9.8");
    await dialog
      .getByRole("spinbutton", { name: "Runtime at 100% load (h)" })
      .fill("5.5");
    // Nobody has said whose it is yet: a hired one is not the camp's.
    await dialog.getByRole("button", { name: "Add generator" }).click();
    await expect(
      dialog.getByText(
        "Say whose it is: the camp's, lent by a member, or hired.",
      ),
    ).toBeVisible();
    await dialog.getByRole("combobox", { name: "Whose it is" }).click();
    await page.getByRole("option", { name: "Camp", exact: true }).click();
    await dialog.getByRole("button", { name: "Add generator" }).click();
    await expect(page.getByText("Generator added")).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Generators" })
        .getByRole("listitem", { name: "Test 5.5" }),
    ).toBeVisible();

    // One load, all day.
    await openSection(page, "/power/loads", "Load list");
    await page.getByRole("button", { name: "Add a load", exact: true }).click();
    const loadDialog = page.getByRole("dialog", { name: "Add a load" });
    await loadDialog
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Camp all day");
    await loadDialog.getByLabel("Area").fill("campsite");
    await loadDialog
      .getByRole("spinbutton", { name: "Watts each", exact: true })
      .fill("1065");
    await loadDialog.getByRole("button", { name: "Add load" }).click();
    await expect(page.getByText("Load added")).toBeVisible();
    await expect(loadRow(page, "Camp all day")).toContainText("25.56");

    // The plan, behind "Change the plan": that generator, 10 days, 24 h.
    await openSection(page, "/power/fuel", "Fuel estimate");
    await expect(answer(page)).toContainText("No estimate yet.");
    await page.getByRole("button", { name: "Change the plan" }).click();
    let plan = page.getByRole("dialog", { name: "The plan" });
    await plan.getByRole("combobox", { name: "Generator" }).click();
    await page.getByRole("option", { name: "Test 5.5 (5.5 kVA)" }).click();
    // A new year's plan starts at the camp's usual 11 days on site.
    const daysOnSite = plan.getByRole("spinbutton", { name: "Days on site" });
    await expect(daysOnSite).toHaveValue("11");
    await daysOnSite.fill("10");
    await plan
      .getByRole("radiogroup", { name: "Hours running" })
      .getByRole("radio", { name: "24 h" })
      .click();
    await plan.getByRole("button", { name: "Save plan" }).click();
    await expect(page.getByText("Fuel plan saved")).toBeVisible();

    // The answer first, then the working.
    await expect(answer(page)).toContainText(
      "Fill 12 jerry cans: 237 L of petrol for 10 days.",
    );
    await expect(ledger(page, "Litres for the burn")).toHaveText("236.7 L");
    await expect(
      page.getByText(/falls in hours the generator is off/),
    ).toHaveCount(0);
    await expectRailLine(
      page,
      /Fuel estimate/,
      "12 jerry cans",
      "Fuel estimate",
    );

    // Now run it 18:00–06:00 only: half the litres, and the night's energy
    // is unserved.
    await page.getByRole("button", { name: "Change the plan" }).click();
    plan = page.getByRole("dialog", { name: "The plan" });
    await plan
      .getByRole("radiogroup", { name: "Hours running" })
      .getByRole("radio", { name: "Set hours" })
      .click();
    await expect(
      plan.getByRole("combobox", { name: "Hours running: from" }),
    ).toHaveText("18:00");
    await expect(
      plan.getByRole("combobox", { name: "Hours running: to" }),
    ).toHaveText("06:00");
    await plan.getByRole("button", { name: "Save plan" }).click();
    await expect(answer(page)).toContainText("Fill 6 jerry cans");
    await expect(
      page.getByText(/^12\.78 kWh a day falls in hours the generator is off/),
    ).toBeVisible();

    // A lead of Kitchen reads the estimate but has nothing to press.
    await approvedMember(page, request, "fuel-kitchen", "Kit Fuel");
    await seedTeam(request, "fuel-kitchen", "kitchen", true);
    await openSection(page, "/power/fuel", "Fuel estimate");
    await expect(answer(page)).toContainText("Fill 6 jerry cans");
    await expect(page.getByRole("region", { name: "The plan" })).toContainText(
      "Test 5.5 · 5.5 kVA",
    );
    await expect(
      page.getByRole("button", { name: "Change the plan" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Add a generator" }),
    ).toHaveCount(0);
  });
});

test.describe("power on a phone (test-mode)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("the rail is the home list; a tap opens a section, with a way back", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "pwr-phone", "Pho Ne");
    await page.goto("/power");
    const rail = page.getByRole("navigation", { name: "Power" });
    await expect(
      rail.getByRole("link", { name: /Fuel estimate/ }),
    ).toBeVisible();
    // The load list waits behind its own line on a phone.
    await expect(
      page.getByRole("heading", { level: 2, name: "Load list" }),
    ).toBeHidden();
    await rail.getByRole("link", { name: /Fuel estimate/ }).click();
    await expect(
      page.getByRole("heading", { level: 2, name: "Fuel estimate" }),
    ).toBeVisible();
    await expect(rail).toBeHidden();
    await page.getByRole("link", { name: "‹ All of Power" }).click();
    await expect(page).toHaveURL(/\/power$/);
    await expect(rail.getByRole("link", { name: /Load list/ })).toBeVisible();
  });
});
