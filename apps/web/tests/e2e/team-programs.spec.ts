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

// Team programs (test-mode; docs/specs/2026-09-27-team-programs.md). Every
// member reads every team's program: its description (ruling 4; no links to
// outside tools: everything happens inside the app),
// the announcements it has sent (ruling 3) and, on Power and Lighting, the
// power plan at a glance (ruling 2). Only a captain or a lead OF THAT TEAM
// changes what it says (ruling 1): a lead of another team gets no Edit.
//
// The power figures are the fuel estimate's worked example (power.spec.ts):
// one 1065 W load all day on a 5.5 kVA generator, 10 days at 24 h: a peak of
// 1.07 kW, 24.2% of the generator, 236.7 L with the 20% margin, 12 cans.

const PROGRAM = "/teams/power_and_lighting";
const EDIT = /^Edit what .* does$/;

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

async function openProgram(page: Page, path: string, title: string) {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
}

/** The P&L lead's plan, through the Power tool: a generator, a load, 10 days. */
async function planThePower(page: Page) {
  await page.goto("/power/fuel");
  await page
    .getByRole("button", { name: "Add generator", exact: true })
    .click();
  const gen = page.getByRole("dialog", { name: "Add a generator" });
  await gen.getByRole("textbox", { name: "Model" }).fill("Test 5.5");
  await gen.getByRole("spinbutton", { name: "Rated kVA" }).fill("5.5");
  await gen.getByRole("spinbutton", { name: "Max kVA" }).fill("6");
  await gen.getByRole("spinbutton", { name: "Tank (L)" }).fill("13.5");
  await gen
    .getByRole("spinbutton", { name: "Runtime at 50% load (h)" })
    .fill("9.8");
  await gen
    .getByRole("spinbutton", { name: "Runtime at 100% load (h)" })
    .fill("5.5");
  await gen.getByRole("button", { name: "Add generator" }).click();
  await expect(page.getByText("Generator added")).toBeVisible();

  await page.goto("/power/loads");
  await page.getByRole("button", { name: "Add load", exact: true }).click();
  const load = page.getByRole("dialog", { name: "Add a load" });
  await load
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Camp all day");
  await load.getByLabel("Area").fill("campsite");
  await load
    .getByRole("spinbutton", { name: "Watts each", exact: true })
    .fill("1065");
  await load.getByRole("button", { name: "Add load" }).click();
  await expect(page.getByText("Load added")).toBeVisible();

  await page.goto("/power/fuel");
  await page.getByRole("combobox", { name: "Generator" }).click();
  await page.getByRole("option", { name: "Test 5.5 (5.5 kVA)" }).click();
  await page.getByRole("spinbutton", { name: /^Days on site/ }).fill("10");
  await page
    .getByRole("radiogroup", { name: "Hours running" })
    .getByRole("radio", { name: "24 h" })
    .click();
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page.getByText("Fuel plan saved")).toBeVisible();
}

/** A captain writes to the P&L team: one published, one left as a draft. */
async function announceToPower(page: Page) {
  for (const [title, publish] of [
    ["Generator test Saturday", true],
    ["Draft nobody may read", false],
  ] as const) {
    await page.goto("/captains/announcements");
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Message").fill("Bring ear plugs.");
    await page.locator("#announcement-audience").click();
    await page.getByRole("option", { name: "Power and Lighting" }).click();
    await page.locator("#announcement-presentation").click();
    await page.getByRole("option", { name: /Quiet/ }).click();
    await page.getByRole("button", { name: "Save draft" }).click();
    if (!publish) {
      await expect(page.getByText(title)).toBeVisible();
      continue;
    }
    await page
      .getByRole("button", { name: "Publish to Power and Lighting" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Publish to 1 member/ })
      .click();
    await expect(page.getByText(/Published to 1 member/)).toBeVisible();
  }
}

test.describe("team programs (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("everyone reads Power and Lighting's program; its lead and a captain change it, a Kitchen lead cannot", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "tp-member", "Mo Member");
    await approvedMember(page, request, "tp-kitchen", "Kit Chen");
    await seedTeam(request, "tp-kitchen", "kitchen", true);
    await approvedMember(page, request, "tp-lead", "Pat Power");
    await seedTeam(request, "tp-lead", "power_and_lighting", true);

    // The lead plans the power in the Power tool, then writes the program.
    await planThePower(page);
    await openProgram(page, PROGRAM, "Power and Lighting");
    await expect(
      page.getByText("Nobody has written what this team does yet."),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Edit the load list" }),
    ).toBeVisible();
    await page.getByRole("button", { name: EDIT }).click();
    const dialog = page.getByRole("dialog", {
      name: "About Power and Lighting",
    });
    await dialog
      .getByLabel("What the team does")
      .fill("We keep the lights on and the freezers cold.");
    // The dialog takes the description only: nothing to link out to.
    await expect(dialog.getByRole("button", { name: /link/i })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("About this team saved")).toBeVisible();
    await expect(
      page.getByText("We keep the lights on and the freezers cold."),
    ).toBeVisible();

    // A reload keeps it.
    await page.reload();
    await expect(
      page.getByText("We keep the lights on and the freezers cold."),
    ).toBeVisible();

    // A captain sends the team one announcement and keeps one as a draft.
    await login(page, { id: "tp-cap", email: "god@example.com" });
    await page.goto("/");
    await completeOnboarding(request, "tp-cap");
    await setRank(request, "tp-cap", "captain");
    await announceToPower(page);

    // A member on no team reads it all, read-only.
    await login(page, { id: "tp-member", email: "tp-member@example.com" });
    await openProgram(page, PROGRAM, "Power and Lighting");
    await expect(
      page.getByText("We keep the lights on and the freezers cold."),
    ).toBeVisible();
    await expect(page.getByRole("list", { name: "Team links" })).toHaveCount(0);
    const sent = page.getByRole("list", { name: "Team announcements" });
    await expect(sent.getByText("Generator test Saturday")).toBeVisible();
    await expect(sent.getByText("Bring ear plugs.")).toBeVisible();
    await expect(page.getByText("Draft nobody may read")).toHaveCount(0);

    const glance = page.getByRole("region", { name: "Power plan at a glance" });
    await expect(
      glance.getByRole("article", { name: "Peak load" }),
    ).toContainText("1.07 kW");
    await expect(
      glance.getByRole("article", { name: "Generator load" }),
    ).toContainText("24.2%");
    await expect(
      glance.getByRole("article", { name: "Fuel for the burn" }),
    ).toContainText("236.7 L");
    await expect(
      glance.getByRole("article", { name: "Jerry cans" }),
    ).toContainText("12");
    await expect(
      page.getByRole("link", { name: "See the load list" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: EDIT })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Edit the/ })).toHaveCount(0);

    // A lead of another team stands on the same rung and still cannot edit.
    await login(page, { id: "tp-kitchen", email: "tp-kitchen@example.com" });
    await openProgram(page, PROGRAM, "Power and Lighting");
    await expect(
      page.getByText("We keep the lights on and the freezers cold."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: EDIT })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Edit the/ })).toHaveCount(0);

    // A captain changes another team's program, and it stays.
    await login(page, { id: "tp-cap", email: "god@example.com" });
    await openProgram(page, "/teams/water", "Water");
    await page.getByRole("button", { name: EDIT }).click();
    const water = page.getByRole("dialog", { name: "About Water" });
    await water.getByLabel("What the team does").fill("We bring the water.");
    await water.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("About this team saved")).toBeVisible();
    await page.reload();
    await expect(page.getByText("We bring the water.")).toBeVisible();
    // Water has no power panel; the power plan belongs to its own team.
    await expect(
      page.getByRole("region", { name: "Power plan at a glance" }),
    ).toHaveCount(0);
  });
});
