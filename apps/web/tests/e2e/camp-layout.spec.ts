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
  setRank,
} from "./_helpers";
import { desktopOnly } from "./lib/dom";
import { campSitePlan, seedSitePlan } from "./lib/site-plan";

// The camp layout (#271; the approved redesign, 2026-10-01). A Structures lead
// places the kitchen with the keyboard alone on the camp's half of the block
// (add, two arrow presses, R to turn) and saves version 1 from the rail. A
// Kitchen lead stands on the same team_lead rung and reads the plan with no
// tools at all. A member finds a tent through the numbered key, and an
// editor brings an older version back from its banner. A captain shares the
// plan: the neighbour page opens with no sign-in, shows the plan and the
// arrival counts, and holds no name, no label and no road; once the captain
// stops sharing, the link answers 404.

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

async function openLayout(page: Page, query = "") {
  await page.goto(`/camp-layout${query}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Camp layout" }),
  ).toBeVisible();
}

/** Add a piece of `kind`; it lands mid-plot and takes the keyboard focus. */
async function addPiece(page: Page, kind: string) {
  await page.getByRole("combobox", { name: "Kind of piece to add" }).click();
  await page.getByRole("option", { name: kind, exact: true }).click();
  await page.getByRole("button", { name: "Add piece", exact: true }).click();
}

async function save(page: Page, note: string, version: number) {
  await page.getByLabel("What changed (optional)").fill(note);
  await page.getByRole("button", { name: "Save layout" }).click();
  await expect(
    page.getByText(`Layout saved (version ${version})`),
  ).toBeVisible();
}

test.describe("camp layout (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a Structures lead places the kitchen by keyboard and saves; a Kitchen lead only reads", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "the plan is changed on a computer");
    await approvedMember(page, request, "lay-lead", "Sipho Lead");
    await seedTeam(request, "lay-lead", "structures", true);
    await openLayout(page);
    await expect(
      page.getByText("Nothing drawn yet. Add the first piece."),
    ).toBeVisible();
    // A new year starts on the camp's usual half: 28 m along the roads, 60 deep.
    await expect(
      page.getByRole("group", {
        name: /a plot 28 m wide and 60 m deep, the right half of the block/,
      }),
    ).toBeVisible();

    // The kitchen (8 × 6 m) lands mid-plot: 10 m from the left, 27 from B Road.
    await addPiece(page, "Kitchen");
    const kitchen = page.getByRole("button", { name: /^1, Kitchen, / });
    await expect(kitchen).toBeFocused();
    await expect(kitchen).toHaveAccessibleName(
      "1, Kitchen, 8 m by 6 m, 10 m from the left edge and 27 m from B Road",
    );
    // The rail's Piece tab shows it, its fields beside the plan.
    await expect(
      page.getByRole("region", { name: "Picked: 1 Kitchen" }),
    ).toBeVisible();

    // Two presses right is a metre; R turns it about its centre.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(kitchen).toHaveAccessibleName(
      /8 m by 6 m, 11 m from the left/,
    );
    await page.keyboard.press("r");
    await expect(kitchen).toHaveAccessibleName(
      "1, Kitchen, 6 m by 8 m, 12 m from the left edge and 26 m from B Road",
    );
    await expect(page.getByText("Unsaved", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Kitchen turned", { exact: true }),
    ).toBeVisible();

    await save(page, "Kitchen first", 1);
    // The page reads the new version back: its heading names it.
    await expect(
      page.getByText(/^Version 1 · drawn by Sipho Lead/),
    ).toBeVisible();
    await expect(page.getByText("Unsaved", { exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: "Versions" }).click();
    const versions = page.getByRole("list", { name: "Saved versions" });
    await expect(versions).toContainText("Version 1");
    await expect(versions).toContainText("Kitchen first");

    // A lead of Kitchen reads the plan, with no tools at all.
    await approvedMember(page, request, "lay-kitchen", "Kit Chen");
    await seedTeam(request, "lay-kitchen", "kitchen", true);
    await openLayout(page);
    await expect(
      page.getByRole("img", { name: /Camp layout: a plot 28 m wide/ }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "This plan" })).toBeVisible();
    await expect(
      page.getByRole("toolbar", { name: "Layout tools" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Add piece/ })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: "Save layout" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("tab", { name: "Share" })).toHaveCount(0);
  });

  test("a member finds a tent by its number; a lead brings an older version back from its banner", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "lay-lead2", "Sipho Ndlovu");
    await seedTeam(request, "lay-lead2", "structures", true);
    const first = campSitePlan();
    await seedSitePlan(request, "lay-lead2", first, "Copied from 2025");
    const second = campSitePlan();
    second.pieces = second.pieces.filter((p) => p.id !== "p-art");
    await seedSitePlan(request, "lay-lead2", second, "Shadow Work moves");

    await approvedMember(page, request, "lay-member", "Zanele Mthembu");
    await openLayout(page);
    // The key numbers every piece the plan wears: camp pieces, then tents.
    const camp = page.getByRole("list", { name: "Camp pieces" });
    await expect(camp.getByRole("listitem")).toHaveCount(15);
    await expect(camp).toContainText("Lounge tent");
    const zanele = page.getByRole("button", {
      name: "T1, Zanele: show on the plan",
    });
    await zanele.click();
    await expect(zanele).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("img", {
        name: /Camp layout: a plot 28 m wide and 60 m deep, the left half of the block, 31 pieces/,
      }),
    ).toBeVisible();

    // An older version is read with Back to the latest, and nothing to bring back.
    await page.getByRole("tab", { name: "Versions" }).click();
    await page.getByRole("link", { name: "View version 1" }).click();
    const banner = page.getByRole("status").filter({ hasText: "version 1" });
    await expect(banner).toBeVisible();
    await expect(
      banner.getByRole("button", { name: /Bring back/ }),
    ).toHaveCount(0);

    // The lead brings it back from the banner: saved again as version 3.
    await login(page, {
      id: "lay-lead2",
      email: "lay-lead2@example.com",
      displayName: "Sipho Ndlovu",
    });
    await openLayout(page, "?version=1");
    await expect(
      page.getByRole("toolbar", { name: "Layout tools" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Bring back version 1" }).click();
    await page
      .getByRole("alertdialog", { name: "Bring back version 1?" })
      .or(page.getByRole("dialog", { name: "Bring back version 1?" }))
      .getByRole("button", { name: "Bring it back" })
      .click();
    await expect(page.getByText("Version 1 is back")).toBeVisible();
    await expect(page).toHaveURL(/\/camp-layout$/);
    // A phone's heading has the short line: no "drawn by", no time.
    await expect(
      page
        .getByText(/^Version 3 · (drawn by )?Sipho Ndlovu/)
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(page.getByRole("list", { name: "Camp pieces" })).toContainText(
      "Shadow Work",
    );

    // The plan prints on A4 for site.
    await page.getByRole("link", { name: /Print (plan )?\(A4\)/ }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: /^Site plan/ }),
    ).toBeVisible();
    await expect(page.getByRole("list", { name: "Tents" })).toContainText(
      "Zanele",
    );
  });

  test("a captain shares the plan with neighbours: counts and kinds only, and a stopped link is gone", async ({
    page,
    request,
    browser,
  }, testInfo) => {
    desktopOnly(testInfo, "the plan is changed on a computer");
    // A member who arrives on 26 April.
    await approvedMember(page, request, "lay-driver", "Thandi Driver");
    await seedLift(request, "lay-driver", {
      role: "driver",
      arrivalDay: "2027-04-26",
    });

    await approvedMember(page, request, "lay-captain", "Cap Tain");
    await setRank(request, "lay-captain", "captain");
    await openLayout(page);
    await addPiece(page, "Tent");
    await page.getByLabel("Label").fill("Zanele's tent");
    await save(page, "One tent", 1);
    await expect(
      page.getByText(/^Version 1 · drawn by Cap Tain/),
    ).toBeVisible();

    // Arrivals read as counts inside the camp too.
    await page.getByRole("tab", { name: "Arrivals" }).click();
    await expect(
      page.getByRole("list", { name: "Arrivals by day" }),
    ).toContainText("Mon 26 Apr");

    await page.getByRole("tab", { name: "Share" }).click();
    await page.getByRole("button", { name: "Share with neighbours" }).click();
    await expect(page.getByText("The neighbour link is on")).toBeVisible();
    const link = page.getByRole("textbox", { name: "Neighbour link" });
    await expect(link).toHaveValue(/\/neighbours\/[A-Za-z0-9_-]{32}$/);
    const url = await link.inputValue();

    // A neighbour: a fresh browser with no sign-in.
    const outside = await browser.newContext();
    const neighbour = await outside.newPage();
    const opened = await neighbour.goto(url);
    expect(opened?.status()).toBe(200);
    // Present first: the plan, its tent, and the day's count.
    await expect(
      neighbour.getByRole("heading", { level: 1, name: "Our site plan" }),
    ).toBeVisible();
    await expect(
      neighbour.getByRole("img", { name: /Camp 404's site plan/ }),
    ).toBeVisible();
    await expect(
      neighbour.getByRole("list", { name: "What's on the plan" }),
    ).toContainText("Tent");
    const arrivals = neighbour.getByRole("list", { name: "Arrivals by day" });
    await expect(arrivals).toContainText("Mon 26 Apr");
    await expect(arrivals).toContainText("1");
    // Then the absences: no member's name, no label, no road typed in camp.
    const body = neighbour.locator("body");
    for (const secret of [
      "Thandi",
      "Driver",
      "Zanele",
      "Cap Tain",
      "B Road",
      "B ROAD",
    ]) {
      await expect(body).not.toContainText(secret);
    }

    // Stop sharing: the same link answers 404.
    await page.getByRole("button", { name: "Stop sharing" }).click();
    await page
      .getByRole("dialog", { name: "Stop sharing the layout?" })
      .or(page.getByRole("alertdialog", { name: "Stop sharing the layout?" }))
      .getByRole("button", { name: "Stop sharing" })
      .click();
    await expect(page.getByText("The neighbour link is off")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Share with neighbours" }),
    ).toBeVisible();
    const gone = await neighbour.goto(url);
    expect(gone?.status()).toBe(404);
    await outside.close();
  });
});
