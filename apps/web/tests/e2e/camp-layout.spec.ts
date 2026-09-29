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

// The camp layout (#271, test-mode). A Structures lead places the kitchen with
// the keyboard alone (add, two arrow presses, R to turn) and saves version 1.
// A Kitchen lead stands on the same team_lead rung, reads the plan, and finds
// the tools disabled with the reason beside them. A captain shares the plan:
// the neighbour page opens with no sign-in, shows the plan and the arrival
// counts, and holds no name and no label; once the captain stops sharing, the
// link answers 404.

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

async function openLayout(page: Page) {
  await page.goto("/camp-layout");
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
  }) => {
    await approvedMember(page, request, "lay-lead", "Sipho Lead");
    await seedTeam(request, "lay-lead", "structures", true);
    await openLayout(page);
    await expect(page.getByText("Not saved yet")).toBeVisible();

    // The kitchen lands mid-plot on the 40 × 30 m default: 16 m from the left.
    await addPiece(page, "Kitchen");
    const kitchen = page.getByRole("button", { name: /^Kitchen, / });
    await expect(kitchen).toBeFocused();
    await expect(kitchen).toHaveAccessibleName(/16 m from the left/);

    // Two presses right is a metre; R turns it about its centre.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(kitchen).toHaveAccessibleName(
      /8 m by 6 m, 17 m from the left/,
    );
    await page.keyboard.press("r");
    await expect(kitchen).toHaveAccessibleName(
      /6 m by 8 m, 18 m from the left and 11 m from the top/,
    );
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    await save(page, "Kitchen first", 1);
    const versions = page.getByRole("list", { name: "Saved versions" });
    await expect(versions).toContainText("Version 1");
    await expect(versions).toContainText("Kitchen first");
    await expect(page.getByText("Unsaved changes")).toHaveCount(0);

    // A lead of Kitchen reads the plan but cannot change it.
    await approvedMember(page, request, "lay-kitchen", "Kit Chen");
    await seedTeam(request, "lay-kitchen", "kitchen", true);
    await openLayout(page);
    await expect(
      page.getByRole("img", { name: /Camp layout: a plot 40 m wide/ }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Only captains and Structures leads can change the layout. Everyone in camp can see it.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Add piece/ }),
    ).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save layout" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Share with neighbours" }),
    ).toHaveCount(0);
  });

  test("a captain shares the plan with neighbours: counts and kinds only, and a stopped link is gone", async ({
    page,
    request,
    browser,
  }) => {
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

    // Arrivals read as counts inside the camp too.
    await expect(
      page.getByRole("list", { name: "Arrivals by day" }),
    ).toContainText("Mon 26 Apr");

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
      neighbour.getByRole("heading", { level: 1, name: /our site plan/ }),
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
    // Then the absences: no member's name, no label typed inside the camp.
    const body = neighbour.locator("body");
    for (const secret of ["Thandi", "Driver", "Zanele", "Cap Tain"]) {
      await expect(body).not.toContainText(secret);
    }

    // Stop sharing: the same link answers 404.
    await page.getByRole("button", { name: "Stop sharing" }).click();
    await page
      .getByRole("dialog", { name: "Stop sharing the layout?" })
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
