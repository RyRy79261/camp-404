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

// Power on site and before it (#255, #256, #257; test-mode). A Power &
// Lighting lead keeps each page; a lead of another team (Kitchen) and a plain
// member read it and find every control disabled with the reason beside it.
//
//  - Refuelling: five full 20 L cans (100 L). Two refuellings of 10 L, six
//    hours apart, from Can 1: 40 L a day, 80 L left, 2 days. A third at
//    18:00 from Can 2: 70 L left, 1.8 days, below the 2-day warning.
//  - Grid: a 3000 W load plugged in at the kitchen, fed by a 10 A cable, is
//    13 A: over its rating, and the page says so.
//  - Readiness: the checklist starts from the template and ticks; the work
//    plan lands on the task board once; the sharing agreement refuses a phone
//    number for the contact and saves a role.
//  - The paper sheets print on their own, with no desktop around them.

const REFUSAL =
  "Only captains and Power & Lighting leads can change the power plan.";

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

async function open(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: heading }),
  ).toBeVisible();
}

/** The issue's generator, added on the fuel estimate. */
async function addGenerator(page: Page) {
  await open(page, "/power/fuel", "Fuel estimate");
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
}

async function pick(page: Page, combobox: string, option: string) {
  await page.getByRole("combobox", { name: combobox }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function logRefuel(
  page: Page,
  when: string,
  litres: string,
  can: string,
) {
  await page
    .getByRole("button", { name: "Log refuelling", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Log a refuelling" });
  await dialog.getByLabel("When").fill(when);
  await dialog.getByRole("spinbutton", { name: "Litres put in" }).fill(litres);
  await pick(page, "From can", can);
  await dialog.getByRole("button", { name: "Log refuelling" }).click();
  await expect(dialog).toHaveCount(0);
}

function daysLeft(page: Page) {
  return page.getByRole("article", { name: "Days of fuel left" });
}

test.describe("power on site (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a P&L lead logs refuellings and the days of fuel left drop; a Kitchen lead only reads", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "site-lead", "Pat Lead");
    await seedTeam(request, "site-lead", "power_and_lighting", true);
    await addGenerator(page);

    await open(page, "/power/fuel-log", "Refuelling");
    await expect(page.getByText("No cans yet")).toBeVisible();

    await page.getByRole("button", { name: "Add cans", exact: true }).click();
    const cans = page.getByRole("dialog", { name: "Add cans" });
    await cans.getByRole("spinbutton", { name: "How many" }).fill("5");
    await cans.getByRole("button", { name: "Add cans" }).click();
    await expect(page.getByText("5 cans added")).toBeVisible();
    await expect(
      page.getByRole("article", { name: "Fuel on hand" }),
    ).toContainText("100.0 L");

    await logRefuel(page, "2026-04-25T06:00", "10", "Can 1 (20 L)");
    // One refuelling is no rate yet.
    await expect(page.getByRole("article", { name: "Using" })).toContainText(
      "Log two refuellings",
    );
    await logRefuel(page, "2026-04-25T12:00", "10", "Can 1 (10 L)");
    await expect(page.getByRole("article", { name: "Using" })).toContainText(
      "40 L",
    );
    await expect(daysLeft(page)).toContainText(/left\s*2\s*warns/);
    await expect(page.getByText(/^Fuel is running low/)).toHaveCount(0);

    await logRefuel(page, "2026-04-25T18:00", "10", "Can 2 (20 L)");
    await expect(daysLeft(page)).toContainText(/left\s*1\.8\s*warns/);
    await expect(page.getByText(/^Fuel is running low/)).toBeVisible();
    await expect(
      page.getByRole("article", { name: "Fuel on hand" }),
    ).toContainText("70.0 L");

    // A correction is a new entry; the old one stays, marked Replaced.
    await page
      .getByRole("button", { name: /^Correct the entry of Sat 25 Apr, 18:00/ })
      .filter({ visible: true })
      .click();
    const fix = page.getByRole("dialog", {
      name: /^Correct the entry of Sat 25 Apr, 18:00/,
    });
    await fix.getByRole("spinbutton", { name: "Litres put in" }).fill("12");
    await fix.getByRole("button", { name: "Log correction" }).click();
    await expect(page.getByText("Correction logged")).toBeVisible();
    await expect(
      page.getByRole("article", { name: "Fuel on hand" }),
    ).toContainText("68.0 L");
    await expect(
      page.getByText("Replaced", { exact: true }).filter({ visible: true }),
    ).toHaveCount(1);

    // A lead of Kitchen reads it all and changes nothing.
    await approvedMember(page, request, "site-kitchen", "Kit Chen");
    await seedTeam(request, "site-kitchen", "kitchen", true);
    await open(page, "/power/fuel-log", "Refuelling");
    await expect(
      page.getByRole("article", { name: "Fuel on hand" }),
    ).toContainText("68.0 L");
    await expect(page.getByText(REFUSAL)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Log refuelling/ }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: /^Add cans/ }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: /^Save warning/ }),
    ).toBeDisabled();
  });

  test("the grid shows a run over its cable's rating; a member only reads", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "grid-lead", "Pat Grid");
    await seedTeam(request, "grid-lead", "power_and_lighting", true);

    // One load of 3000 W, all day.
    await open(page, "/power/loads", "Load list");
    await page.getByRole("button", { name: "Add load", exact: true }).click();
    const load = page.getByRole("dialog", { name: "Add a load" });
    await load
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Urn and fridges");
    await load.getByLabel("Area").fill("kitchen");
    await load
      .getByRole("spinbutton", { name: "Watts each", exact: true })
      .fill("3000");
    await load.getByRole("button", { name: "Add load" }).click();
    await expect(page.getByText("Load added")).toBeVisible();

    await open(page, "/power/grid", "Grid plan");
    await expect(page.getByText("No grid yet")).toBeVisible();

    const addPoint = async (
      name: string,
      kind: string | null,
      feed: string | null,
      amps: string | null,
    ) => {
      await page
        .getByRole("button", { name: "Add point", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "Add a point" });
      await dialog.getByRole("textbox", { name: "Name" }).fill(name);
      if (kind) await pick(page, "Kind", kind);
      if (feed) await pick(page, "Fed from", feed);
      if (amps) {
        await dialog.getByRole("spinbutton", { name: "Rated amps" }).fill(amps);
      }
      await dialog.getByRole("button", { name: "Add point" }).click();
      await expect(dialog).toHaveCount(0);
    };
    // The first point is the generator.
    await addPoint("Genny", null, null, null);
    await addPoint("Main junction", "Junction", "Genny", "16");
    await addPoint("Kitchen", "End point", "Main junction", "10");

    await pick(page, "Where Urn and fridges plugs in", "Kitchen (End point)");
    const kitchen = page.getByRole("listitem", { name: "Kitchen" });
    await expect(kitchen).toContainText("Over its rating");
    await expect(kitchen).toContainText("Carries 13 A of 10 A (130%)");
    await expect(
      page.getByRole("listitem", { name: "Main junction" }),
    ).toContainText("Near its limit");
    await expect(page.getByText(/^One cable carries more/)).toBeVisible();

    // A plain member reads the grid and cannot change it.
    await approvedMember(page, request, "grid-member", "Mem Ber");
    await open(page, "/power/grid", "Grid plan");
    await expect(page.getByRole("listitem", { name: "Kitchen" })).toContainText(
      "Over its rating",
    );
    await expect(page.getByText(REFUSAL)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Add point/ }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: /^Edit Kitchen/ }),
    ).toBeDisabled();
    await expect(
      page.getByRole("combobox", { name: "Where Urn and fridges plugs in" }),
    ).toHaveCount(0);
  });

  test("readiness: the checklist ticks, the work plan goes on the board once, and sharing names a role", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "ready-lead", "Pat Ready");
    await seedTeam(request, "ready-lead", "power_and_lighting", true);
    await addGenerator(page);

    await open(page, "/power/readiness", "Generator readiness");
    const card = page.getByRole("article", { name: "Test 5.5" });
    await expect(card).toContainText("Not started this year.");
    await card.getByRole("button", { name: "Start the checklist" }).click();
    await expect(card).toContainText("0 of 9 done");
    await card
      .getByRole("checkbox", { name: "Starts and runs under load: not done" })
      .click();
    await expect(card).toContainText("1 of 9 done");

    await page
      .getByRole("button", { name: "Put the work plan on the task board" })
      .click();
    await expect(
      page.getByText("6 tasks added to the task board for Power & Lighting"),
    ).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Work plan tasks" }).getByRole("listitem"),
    ).toHaveCount(6);
    await expect(
      page.getByRole("button", { name: "Put the work plan on the task board" }),
    ).toHaveCount(0);

    const sharing = page.getByRole("article", {
      name: "Sharing with a neighbouring camp",
    });
    await sharing.getByLabel("Neighbouring camp").fill("Camp Moonbeam");
    await sharing.getByLabel("Who to speak to there").fill("082 555 1234");
    await sharing.getByRole("button", { name: "Save agreement" }).click();
    await expect(
      sharing.getByText("Give a role, not a phone number or an email address."),
    ).toBeVisible();
    await sharing.getByLabel("Who to speak to there").fill("their power lead");
    await sharing
      .getByLabel("Who covers which watches")
      .fill("They cover 00:00–08:00");
    await sharing.getByRole("button", { name: "Save agreement" }).click();
    await expect(page.getByText("Sharing agreement saved")).toBeVisible();
    await expect(
      sharing.getByRole("definition").filter({ hasText: "100%" }),
    ).toHaveCount(1);

    // A lead of Kitchen reads it and changes nothing.
    await approvedMember(page, request, "ready-kitchen", "Kit Ready");
    await seedTeam(request, "ready-kitchen", "kitchen", true);
    await open(page, "/power/readiness", "Generator readiness");
    await expect(page.getByRole("article", { name: "Test 5.5" })).toContainText(
      "1 of 9 done",
    );
    await expect(page.getByText(REFUSAL)).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: /^Starts and runs under load/ }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: /^Save agreement/ }),
    ).toBeDisabled();
  });

  test("the paper sheets print on their own, with no desktop", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "sheet-member", "Mem Sheet");
    for (const [path, heading] of [
      ["/print/power/refuel-sheet", "Refuelling log"],
      ["/print/power/grid", "Grid sheet"],
      ["/print/power/sharing", "Sharing a generator"],
    ] as const) {
      await page.goto(path);
      // Present first, then the absence.
      await expect(
        page.getByRole("heading", { level: 1, name: heading }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
      await expect(page.locator("[data-os-skin]")).toHaveCount(0);
    }
  });
});
