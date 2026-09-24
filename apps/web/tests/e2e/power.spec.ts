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
