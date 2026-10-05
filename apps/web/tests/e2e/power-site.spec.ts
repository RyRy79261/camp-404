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
  seedLift,
  seedTeam,
} from "./_helpers";
import { expectRailLine } from "./lib/power";

// Power on site and before it (#255, #256, #257; test-mode), in the owner's
// approved redesign (option B, the answer rail). A Power & Lighting lead keeps
// each section; a lead of another team (Kitchen) and a plain member read the
// same section as content, with no button to press.
//
//  - Refuelling: the fuel can register (owner, 2026-10-02). A Power lead
//    adds a can on a driver's car; "Filled by" is that driver, never picked,
//    and the driver finds the can on their own card in Transport. The ticks
//    are made on the printed sheet on site, never in the app.
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

async function signInAs(page: Page, id: string, displayName: string) {
  await login(page, { id, email: `${id}@example.com`, displayName });
}

test.describe("power on site (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a P&L lead adds a can on a car, the driver sees it in Transport, and others only read", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "fuel-driver", "Dana Driver");
    await seedLift(request, "fuel-driver", {
      role: "driver",
      vehicleMake: "Toyota",
      vehicleModel: "Hilux",
      seatsOffered: 3,
      departureCity: "Cape Town",
    });
    await approvedMember(page, request, "fuel-lead", "Pat Lead");
    await seedTeam(request, "fuel-lead", "power_and_lighting", true);

    await open(page, "/power/refuelling", "Refuelling");
    await expect(page.getByText("No cans yet.").first()).toBeVisible();

    await page.getByRole("button", { name: "Add a can", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add a can" });
    await expect(dialog.getByText(/as can 1\./)).toBeVisible();
    await dialog.getByRole("spinbutton", { name: "Size" }).fill("25");
    await dialog.getByRole("combobox", { name: "Made of" }).click();
    await page.getByRole("option", { name: "Metal", exact: true }).click();
    // Nobody fills it until it is on a car; then the car's driver does.
    const filler = dialog.getByRole("definition");
    await expect(filler).toHaveText("Nobody yet: choose a car above.");
    await dialog.getByRole("combobox", { name: "Travels with" }).click();
    await page
      .getByRole("option", { name: "Dana's Toyota · Dana Driver" })
      .click();
    await expect(filler).toContainText("Dana Driver, the driver");
    await dialog.getByLabel("Note (optional)").fill("Red, camp stencil");
    await dialog.getByRole("button", { name: "Add the can" }).click();
    await expect(page.getByText("Can 1 added")).toBeVisible();

    // A table in a wide window, a card in a narrow one: whichever shows.
    const can1 = page.locator('[aria-label="Can 1"]:visible');
    await expect(can1).toContainText("Camp");
    await expect(can1).toContainText("25 L");
    await expect(can1).toContainText("Metal");
    await expect(can1).toContainText("Dana's Toyota");
    await expect(can1).toContainText("Dana Driver");
    await expectRailLine(page, /Refuelling/, "1 can, 25 L", "Refuelling");

    // The driver finds it on their own card in Transport, and in the Cars.
    await signInAs(page, "fuel-driver", "Dana Driver");
    await page.goto("/transport");
    await expect(
      page.getByRole("heading", { level: 1, name: "Transport" }),
    ).toBeVisible();
    const fill = page.getByRole("region", { name: "Fill before you leave" });
    await expect(fill).toContainText("Fill before you leave: 1 can, 25 L");
    await expect(fill).toContainText("Red, camp stencil");
    await expect(
      fill.getByRole("link", { name: "See all fuel cans in Power ›" }),
    ).toHaveAttribute("href", "/power/refuelling");
    await expect(
      // A table row in a wide window, a card in the Cars list on a phone.
      page
        .getByRole("row", { name: "Dana Driver" })
        .or(
          page
            .getByRole("list", { name: "Cars" })
            .getByRole("listitem", { name: "Dana Driver" }),
        )
        .filter({ visible: true })
        .first(),
    ).toContainText("1 can, 25 L");

    // A plain member and a lead of Kitchen read the list with nothing to press.
    await approvedMember(page, request, "fuel-member", "Max Member");
    await approvedMember(page, request, "fuel-kitchen", "Kit Chen");
    await seedTeam(request, "fuel-kitchen", "kitchen", true);
    for (const [id, name] of [
      ["fuel-member", "Max Member"],
      ["fuel-kitchen", "Kit Chen"],
    ] as const) {
      await signInAs(page, id, name);
      await open(page, "/power/refuelling", "Refuelling");
      await expect(can1).toContainText("Dana Driver");
      await expect(page.getByText(READ_ONLY)).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Print the can sheet" }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Add a can" })).toHaveCount(
        0,
      );
      await expect(
        page.getByRole("button", { name: /^Edit can / }),
      ).toHaveCount(0);
    }
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
      ["/print/power/fuel-cans", "Fuel cans"],
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
