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

// The load list (#253, test-mode). A Power & Lighting lead adds a freezer
// (1 × 320 W, all day) and a LED strip through the quick-add helper (12 V,
// 4.8 W/m, 100 m = 480 W) on 6 h a day: 7.68 + 2.88 = 10.56 kWh a day. Editing
// the strip to 5 h makes it 10.08; removing it leaves the freezer's 7.68. A
// lead of Kitchen stands on the same team_lead rung, reads the list, and finds
// Add load disabled with the reason beside it.

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

async function openLoadList(page: Page) {
  await page.goto("/power/loads");
  await expect(
    page.getByRole("heading", { level: 1, name: "Load list" }),
  ).toBeVisible();
}

async function openFuel(page: Page) {
  await page.goto("/power/fuel");
  await expect(
    page.getByRole("heading", { level: 1, name: "Fuel estimate" }),
  ).toBeVisible();
}

/** The cans KPI, whole: its label, the count, then the can size. */
function cansKpi(page: Page) {
  return page.getByRole("article", { name: "Jerry cans needed" });
}

/** The Energy KPI's figure, asserted only once the page has painted. */
async function expectEnergy(page: Page, figure: string) {
  await expect(
    page.getByRole("heading", { level: 1, name: "Load list" }),
  ).toBeVisible();
  await expect(page.getByRole("article", { name: "Energy" })).toContainText(
    figure,
  );
}

test.describe("power load list (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a P&L lead keeps the list and sees the day's energy move; a Kitchen lead only reads", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "pwr-lead", "Pat Lead");
    await seedTeam(request, "pwr-lead", "power_and_lighting", true);
    await openLoadList(page);
    await expect(page.getByText("No loads yet")).toBeVisible();

    // The freezer, typed in watts.
    await page.getByRole("button", { name: "Add load", exact: true }).click();
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
    await dialog.getByRole("button", { name: "Add load" }).click();
    await expect(page.getByText("Load added")).toBeVisible();
    await expectEnergy(page, "7.68 kWh");

    // The strip, through the LED helper, on 6 h a day.
    await page.getByRole("button", { name: "Add load", exact: true }).click();
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
    await expect(
      dialog.getByText("This row: 480 W running · 2,880 Wh a day"),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Add load" }).click();
    await expect(page.getByText("Load added")).toBeVisible();
    await expectEnergy(page, "10.56 kWh");

    // Edit the strip to 5 h a day.
    await page
      .getByRole("button", { name: "Edit Fairy lights" })
      .filter({ visible: true })
      .click();
    dialog = page.getByRole("dialog", { name: "Edit load" });
    await dialog.getByLabel("Hours it runs each day").fill("5");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Load updated")).toBeVisible();
    await expectEnergy(page, "10.08 kWh");

    // Remove it.
    await page
      .getByRole("button", { name: "Remove Fairy lights" })
      .filter({ visible: true })
      .click();
    await page
      .getByRole("dialog", { name: "Remove Fairy lights?" })
      .getByRole("button", { name: "Remove load" })
      .click();
    await expect(page.getByText("Load removed")).toBeVisible();
    await expectEnergy(page, "7.68 kWh");
    await expect(
      page.getByRole("button", { name: "Edit Fairy lights" }),
    ).toHaveCount(0);

    // A lead of Kitchen reads the list but cannot change it.
    await approvedMember(page, request, "pwr-kitchen", "Kit Chen");
    await seedTeam(request, "pwr-kitchen", "kitchen", true);
    await openLoadList(page);
    await expect(
      page.getByText("Deep freeze").filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Only captains and Power & Lighting leads can change the power plan.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Add load/ }),
    ).toBeDisabled();
    await expect(
      page
        .getByRole("button", { name: /^Edit Deep freeze/ })
        .filter({ visible: true }),
    ).toBeDisabled();
    await expectEnergy(page, "7.68 kWh");
  });
});

// The fuel estimate (#254, test-mode). A Power & Lighting lead adds the
// issue's generator (5.5 kVA rated, 6 max, 13.5 L tank, 9.8 h at 50% and
// 5.5 h at 100%) and one 1065 W load all day, then plans 10 days at 24 h:
// 19.73 L a day, 197.3 L for the burn, 236.7 L with 20%, 12 cans of 20 L.
// The camp runs the generator 24/7, so there is no comparison schedule; a
// plan that sets 18:00–06:00 halves the litres (6 cans) and leaves 12.78 kWh
// a day in the hours the generator is off, which the page warns of.
// A lead of Kitchen reads the page and finds Save disabled.
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
    await openFuel(page);
    await expect(page.getByText("No generators yet")).toBeVisible();

    // The generator, from its datasheet.
    await page
      .getByRole("button", { name: "Add generator", exact: true })
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
    await dialog.getByRole("button", { name: "Add generator" }).click();
    await expect(page.getByText("Generator added")).toBeVisible();
    await expect(
      page.getByText("Test 5.5", { exact: true }).filter({ visible: true }),
    ).toBeVisible();

    // One load, all day.
    await openLoadList(page);
    await page.getByRole("button", { name: "Add load", exact: true }).click();
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
    await expectEnergy(page, "25.56 kWh");

    // The plan: that generator, 10 days, 24 h.
    await openFuel(page);
    await expect(page.getByText("No generator chosen")).toBeVisible();
    await page.getByRole("combobox", { name: "Generator" }).click();
    await page.getByRole("option", { name: "Test 5.5 (5.5 kVA)" }).click();
    // A new year's plan starts at the camp's usual 11 days on site.
    const daysOnSite = page.getByRole("spinbutton", { name: /^Days on site/ });
    await expect(daysOnSite).toHaveValue("11");
    await daysOnSite.fill("10");
    const running = page.getByRole("radiogroup", { name: "Hours running" });
    await running.getByRole("radio", { name: "24 h" }).click();
    await page.getByRole("button", { name: "Save plan" }).click();
    await expect(page.getByText("Fuel plan saved")).toBeVisible();

    await expect(
      page.getByRole("article", { name: "Litres a day" }),
    ).toContainText("19.73 L");
    await expect(
      page.getByRole("article", { name: "Litres for the burn" }),
    ).toContainText("197.3 L");
    await expect(
      page.getByRole("article", { name: "With margin" }),
    ).toContainText("236.7 L");
    await expect(cansKpi(page)).toHaveText(/needed\s*12\s*20 L cans/);
    await expect(
      page.getByText(/falls in hours the generator is off/),
    ).toHaveCount(0);

    // One schedule only: the cans above are present, and no comparison is.
    await expect(
      page.getByRole("table", { name: "Scenario compare" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("radiogroup", { name: "Comparison schedule" }),
    ).toHaveCount(0);

    // Now run it 18:00–06:00 only: half the litres, and the night's freezer
    // energy is unserved.
    await running.getByRole("radio", { name: "Set hours" }).click();
    await expect(
      page.getByRole("combobox", { name: "Hours running: from" }),
    ).toHaveText("18:00");
    await expect(
      page.getByRole("combobox", { name: "Hours running: to" }),
    ).toHaveText("06:00");
    await page.getByRole("button", { name: "Save plan" }).click();
    await expect(cansKpi(page)).toHaveText(/needed\s*6\s*20 L cans/);
    await expect(
      page.getByText(/^12\.78 kWh a day falls in hours the generator is off/),
    ).toBeVisible();
    await expect(
      page.getByRole("article", { name: "Litres a day" }),
    ).toContainText("running 18:00–06:00");

    // A lead of Kitchen reads the estimate but cannot change it.
    await approvedMember(page, request, "fuel-kitchen", "Kit Fuel");
    await seedTeam(request, "fuel-kitchen", "kitchen", true);
    await openFuel(page);
    await expect(cansKpi(page)).toHaveText(/needed\s*6\s*20 L cans/);
    await expect(
      page.getByText(
        "Only captains and Power & Lighting leads can change the power plan.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Save plan/ }),
    ).toBeDisabled();
    await expect(
      page.getByRole("combobox", { name: "Generator" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: /^Add generator/ }),
    ).toBeDisabled();
  });
});
