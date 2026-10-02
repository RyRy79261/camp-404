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

// Power on site and before it (#255, #256, #257; test-mode), in the owner's
// approved redesign (option B, the answer rail). A Power & Lighting lead keeps
// each section; a lead of another team (Kitchen) and a plain member read the
// same section as content, with no button to press.
//
//  - Refuelling: there is no signal at the burn, so the paper sheet is the
//    record and the lead types its lines in after. Five full 20 L cans
//    (100 L), three lines of 10 L: 70 L in stock. A correction is a new
//    line; the old one stays, marked Replaced.
//  - Grid: a 3000 W load plugged in at the kitchen, fed by a 10 A cable, is
//    13 A: over its rating, and the answer names the run. No cable counts as
//    the camp's until someone says so.
//  - Readiness: the plan's generator's checklist starts from the template
//    and ticks; the work plan lands on the task board once.
//  - Sharing, its own section: the agreement refuses a phone number for the
//    contact and saves a role; until a split is agreed it says so.
//  - The paper sheets print on their own, with no desktop around them.

const READ_ONLY = "Only captains and Power & Lighting leads change this.";

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
async function open(page: Page, path: string, title: string) {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: "Power" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: title }),
  ).toBeVisible();
}

const answer = (page: Page) => page.getByRole("region", { name: "The answer" });

/** The issue's generator, added on the fuel estimate. */
async function addGenerator(page: Page) {
  await open(page, "/power/fuel", "Fuel estimate");
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
  await dialog.getByRole("combobox", { name: "Whose it is" }).click();
  await page.getByRole("option", { name: "Camp", exact: true }).click();
  await dialog.getByRole("button", { name: "Add generator" }).click();
  await expect(page.getByText("Generator added")).toBeVisible();
}

/** Put the generator in the year's plan. */
async function planGenerator(page: Page) {
  await open(page, "/power/fuel", "Fuel estimate");
  await page.getByRole("button", { name: "Change the plan" }).click();
  const plan = page.getByRole("dialog", { name: "The plan" });
  await plan.getByRole("combobox", { name: "Generator" }).click();
  await page.getByRole("option", { name: "Test 5.5 (5.5 kVA)" }).click();
  await plan.getByRole("button", { name: "Save plan" }).click();
  await expect(page.getByText("Fuel plan saved")).toBeVisible();
}

async function pick(page: Page, combobox: string, option: string) {
  await page.getByRole("combobox", { name: combobox }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** Type in one line of the paper sheet. */
async function typeIn(page: Page, when: string, litres: string, can: string) {
  await page
    .getByRole("button", { name: "Type in from the sheet", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Type in a line from the sheet",
  });
  // Nothing is guessed: the time is the sheet's, typed in.
  await expect(dialog.getByLabel("When")).toHaveValue("");
  await dialog.getByLabel("When").fill(when);
  await dialog.getByRole("spinbutton", { name: "Litres put in" }).fill(litres);
  await pick(page, "From can", can);
  await dialog.getByRole("button", { name: "Log refuelling" }).click();
  await expect(dialog).toHaveCount(0);
}

const logRows = (page: Page) =>
  page.getByRole("list", { name: "Refuelling log" }).getByRole("listitem");

test.describe("power on site (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a P&L lead types in the paper sheet and the stock drops; a Kitchen lead only reads", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "site-lead", "Pat Lead");
    await seedTeam(request, "site-lead", "power_and_lighting", true);
    await addGenerator(page);

    await open(page, "/power/fuel-log", "Refuelling");
    await expect(page.getByText("No cans yet.")).toBeVisible();
    await expect(page.getByText("Nothing typed in yet.")).toBeVisible();

    await page.getByRole("button", { name: "Add cans", exact: true }).click();
    const cans = page.getByRole("dialog", { name: "Add cans" });
    await cans.getByRole("spinbutton", { name: "How many" }).fill("5");
    await cans.getByRole("button", { name: "Add cans" }).click();
    await expect(page.getByText("5 cans added")).toBeVisible();
    await expect(answer(page)).toContainText("100 L in stock");

    await typeIn(page, "2026-04-25T06:00", "10", "Can 1 (20 L)");
    await typeIn(page, "2026-04-25T12:00", "10", "Can 1 (10 L)");
    await typeIn(page, "2026-04-25T18:00", "10", "Can 2 (20 L)");
    await expect(answer(page)).toContainText("70 L in stock");
    await expect(logRows(page)).toHaveCount(3);

    // A correction is a new entry; the old one stays, marked Replaced.
    await page
      .getByRole("button", { name: /^Correct the entry of Sat 25 Apr, 18:00/ })
      .click();
    const fix = page.getByRole("dialog", {
      name: /^Correct the entry of Sat 25 Apr, 18:00/,
    });
    await fix.getByRole("spinbutton", { name: "Litres put in" }).fill("12");
    await fix.getByRole("button", { name: "Log correction" }).click();
    await expect(page.getByText("Correction logged")).toBeVisible();
    await expect(answer(page)).toContainText("68 L in stock");
    await expect(logRows(page)).toHaveCount(4);
    await expect(
      page.getByRole("list", { name: "Refuelling log" }).getByText("Replaced", {
        exact: true,
      }),
    ).toHaveCount(1);

    // A lead of Kitchen reads it all and has nothing to press but the sheet.
    await approvedMember(page, request, "site-kitchen", "Kit Chen");
    await seedTeam(request, "site-kitchen", "kitchen", true);
    await open(page, "/power/fuel-log", "Refuelling");
    await expect(answer(page)).toContainText("68 L in stock");
    await expect(logRows(page)).toHaveCount(4);
    await expect(page.getByText(READ_ONLY)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Print the log sheet" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Type in from the sheet" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add cans" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Correct / })).toHaveCount(
      0,
    );
  });

  test("the grid names the run over its cable's rating; a member only reads", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "grid-lead", "Pat Grid");
    await seedTeam(request, "grid-lead", "power_and_lighting", true);

    // One load of 3000 W, all day.
    await open(page, "/power/loads", "Load list");
    await page.getByRole("button", { name: "Add a load", exact: true }).click();
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

    await open(page, "/power/grid", "Grid");
    await expect(page.getByText("No grid yet.")).toBeVisible();

    const addPoint = async (
      name: string,
      kind: string | null,
      feed: string | null,
      amps: string | null,
    ) => {
      await page
        .getByRole("button", { name: "Add a point", exact: true })
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

    await pick(page, "Where Urn and fridges plugs in", "Kitchen");
    await expect(answer(page)).toContainText(
      "Kitchen is over its rating: 13.0 A on a 10 A run.",
    );
    const points = page.getByRole("list", { name: "Grid points" });
    const kitchen = points.getByRole("listitem", { name: "Kitchen" });
    await expect(kitchen).toContainText("13.0 of 10 A");
    await expect(kitchen).toContainText("Urn and fridges");
    await expect(
      points.getByRole("listitem", { name: "Main junction" }),
    ).toContainText("Near limit");

    // The cables: none is the camp's until someone says so.
    const cables = page.getByRole("region", { name: "Cables and adapters" });
    await expect(cables).toContainText("2 not checked yet.");
    await cables
      .getByRole("listitem", { name: "Cable" })
      .first()
      .getByRole("button", { name: "Have it" })
      .click();
    await expect(cables).toContainText("1 not checked yet.");

    // A plain member reads the grid and has nothing to press.
    await approvedMember(page, request, "grid-member", "Mem Ber");
    await open(page, "/power/grid", "Grid");
    await expect(answer(page)).toContainText("Kitchen is over its rating");
    await expect(page.getByText(READ_ONLY)).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Cables and adapters" }),
    ).toContainText("Not checked yet");
    await expect(page.getByRole("button", { name: "Add a point" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Edit Kitchen" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: "Where Urn and fridges plugs in" }),
    ).toHaveCount(0);
  });

  test("readiness ticks and puts the work plan on the board once; sharing names a role", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "ready-lead", "Pat Ready");
    await seedTeam(request, "ready-lead", "power_and_lighting", true);
    await addGenerator(page);
    await planGenerator(page);

    await open(page, "/power/readiness", "Readiness");
    await expect(
      page.getByText("The Test 5.5's checklist is not started."),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Start the checklist for Test 5.5" })
      .click();
    await expect(answer(page)).toContainText(
      "0 of 9 checks done on the Test 5.5.",
    );
    await page
      .getByRole("checkbox", { name: "Starts and runs under load: not done" })
      .click();
    await expect(answer(page)).toContainText(
      "1 of 9 checks done on the Test 5.5.",
    );
    await expect(
      page.getByRole("list", { name: "Done" }).getByRole("listitem"),
    ).toHaveCount(1);

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

    // Sharing, its own section.
    await open(page, "/power/sharing", "Sharing");
    await expect(page.getByText("No sharing this year.")).toBeVisible();
    await page.getByRole("button", { name: "Set up sharing" }).click();
    const sharing = page.getByRole("dialog", {
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
    // The plan's generator, and no 100% / 0% split that looks agreed.
    await expect(answer(page)).toContainText(
      "Camp Moonbeam shares our Test 5.5",
    );
    await expect(answer(page)).toContainText("The split isn't agreed yet.");
    await expect(
      page.getByRole("table", { name: "The agreement" }),
    ).toContainText("their power lead");
    await expect(
      page.getByRole("link", { name: "Print the summary" }),
    ).toHaveCount(0);

    // A lead of Kitchen reads both and has nothing to press.
    await approvedMember(page, request, "ready-kitchen", "Kit Ready");
    await seedTeam(request, "ready-kitchen", "kitchen", true);
    await open(page, "/power/readiness", "Readiness");
    await expect(answer(page)).toContainText("1 of 9 checks done");
    await expect(page.getByText(READ_ONLY)).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(0);
    await open(page, "/power/sharing", "Sharing");
    await expect(answer(page)).toContainText("Camp Moonbeam shares");
    await expect(
      page.getByRole("button", { name: "Change the agreement" }),
    ).toHaveCount(0);
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
