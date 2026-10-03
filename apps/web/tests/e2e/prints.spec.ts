import { readFile } from "node:fs/promises";
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
import { osBar } from "./lib/console-nav";
import { acceptedAt50, DISH } from "./lib/kitchen";

// The printable pages in the shared print shell (#249, test-mode). Each print
// draws its sheet with no desktop around it; Download PDF gives a real PDF
// file of the page (the owner's ruling 2026-09-30), made on the server as the
// member who asked, so a page the member may not print gives no PDF; and the
// recipe card prints only a plate count the Kitchen has checked.

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

async function asCaptain(page: Page, request: APIRequestContext) {
  await login(page, {
    id: "pr-cap",
    email: "god@example.com",
    displayName: "Cap Tain",
  });
  await page.goto("/");
  await completeOnboarding(request, "pr-cap");
  await setRank(request, "pr-cap", "captain");
}

/** The sheet is drawn (present first), then nothing of the desktop is. */
async function sheetWithoutDesktop(
  page: Page,
  heading: string,
  { landscape = false }: { landscape?: boolean } = {},
) {
  await expect(
    page.getByRole("heading", { level: 1, name: heading }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download PDF" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
  await expect(osBar(page)).toHaveCount(0);
  await expect(page.locator("[data-os-skin]")).toHaveCount(0);
  // Exact letter widths: without them Chromium on Linux (the PDF route's)
  // rounds each letter to a whole pixel and words break apart ("MET HOD").
  expect(
    await page
      .locator("[data-print-sheet]")
      .evaluate((el) => getComputedStyle(el).textRendering),
  ).toBe("geometricprecision");
  await staysA4(page, landscape ? A4_LONG_PX : A4_PX);
}

/** A4 is 210 mm: 793.7 CSS pixels. */
const A4_PX = (210 * 96) / 25.4;
/** A4 on its side is 297 mm wide. */
const A4_LONG_PX = (297 * 96) / 25.4;

/**
 * A print is A4 paper, never a phone layout (owner, 2026-10-01): on a 390 px
 * screen the sheet keeps its A4 width, scaled down to fit, and the page
 * never scrolls sideways.
 */
async function staysA4(page: Page, widthPx = A4_PX) {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  const sheet = page.locator("[data-print-sheet]");
  await expect(sheet).toBeVisible();
  // Its own width is A4's, whatever the screen.
  expect(
    await sheet.evaluate((el) => parseFloat(getComputedStyle(el).width)),
  ).toBeCloseTo(widthPx, 0);
  // Scaled to fit: on screen it is no wider than the phone.
  await expect
    .poll(async () => (await sheet.boundingBox())?.width ?? Infinity)
    .toBeLessThanOrEqual(390);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  if (size) await page.setViewportSize(size);
}

/** Press Download PDF and return the saved file's bytes. */
async function downloadPdf(page: Page): Promise<Buffer> {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 45_000 }),
    page.getByRole("button", { name: "Download PDF" }).click(),
  ]);
  const path = await download.path();
  expect(download.suggestedFilename()).toMatch(/^camp-404-[a-z0-9-]+\.pdf$/);
  return readFile(path);
}

test.describe("prints (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("every moved print draws its sheet in the shell, with no desktop", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "pr-member", "Mem Print");
    for (const [path, heading] of [
      ["/print/power/fuel-cans", "Fuel cans"],
      ["/print/power/grid", "Grid sheet"],
      ["/print/power/sharing", "Sharing a generator"],
      ["/print/lounge?day=1", "Lounge programme"],
      ["/print/lounge?sheet=blank", "Lounge whiteboard"],
      ["/print/shifts/mine", "Mem P.'s shifts"],
      ["/print/shifts", "Camp 404 shifts"],
    ] as const) {
      await page.goto(path);
      await sheetWithoutDesktop(page, heading);
    }

    // Gear rental is the captains': a member reads a refusal, with no sheet
    // and no buttons.
    await page.goto("/print/gear-rental");
    await expect(page.getByText("Gear rental is for captains.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Download PDF" }),
    ).toHaveCount(0);

    await asCaptain(page, request);
    for (const [path, heading] of [
      ["/print/gear-rental", "Order and storage"],
      ["/print/gear-rental?sheet=tents", "Tents"],
    ] as const) {
      await page.goto(path);
      await sheetWithoutDesktop(page, heading);
    }
  });

  test("Download PDF saves a real PDF of the page; a page the member may not print gives none", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    await approvedMember(page, request, "pr-pdf", "Pat Pdf");
    await page.goto("/print/power/fuel-cans");
    await sheetWithoutDesktop(page, "Fuel cans");
    const pdf = await downloadPdf(page);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1_000);

    // The route makes the file as the member: the captains' rental sheet is
    // refused, and so is anything that is not a print page.
    const refused = await page.request.get(
      "/print/pdf?from=%2Fprint%2Fgear-rental&name=x",
    );
    expect(refused.status()).toBe(403);
    expect((await refused.body()).subarray(0, 4).toString("latin1")).not.toBe(
      "%PDF",
    );
    const elsewhere = await page.request.get(
      "/print/pdf?from=%2Fcaptains%2Froster&name=x",
    );
    expect(elsewhere.status()).toBe(400);

    // Signed out: nothing, and no browser is started.
    await page.context().clearCookies();
    const signedOut = await page.request.get(
      "/print/pdf?from=%2Fprint%2Fpower%2Ffuel-cans&name=x",
    );
    expect(signedOut.status()).toBe(401);
  });

  test("the recipe card prints a checked plate count, any member may print it, and an unchecked count is refused", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const recipeUrl = await acceptedAt50(page, request);
    const id = recipeUrl.split("/").at(-1)!;

    // The Kitchen's recipe page links to the card at the count on show.
    const link = page.getByRole("link", { name: "Print card" });
    await expect(link).toHaveAttribute(
      "href",
      `/print/kitchen/recipes/${id}?plates=50`,
    );

    // A member who is not in the Kitchen prints it.
    await approvedMember(page, request, "pr-reader", "Rea Der");
    await page.goto(`/print/kitchen/recipes/${id}?plates=50`);
    await sheetWithoutDesktop(page, DISH);
    await expect(
      page.getByText("For 50 plates", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByTestId("card-line").filter({ hasText: "Red lentils" }),
    ).toContainText("2.5 kg");
    await expect(page.getByTestId("card-step").first()).toBeVisible();
    const pdf = await downloadPdf(page);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // 45 plates was never checked: refused, never worked out, and no PDF.
    await page.goto(`/print/kitchen/recipes/${id}?plates=45`);
    await expect(page.getByTestId("card-refusal")).toContainText(
      "There is no checked recipe for 45 plates.",
    );
    await expect(page.getByRole("link", { name: "50 plates" })).toBeVisible();
    await expect(page.getByTestId("card-line")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Download PDF" }),
    ).toHaveCount(0);
    const refused = await page.request.get(
      `/print/pdf?from=${encodeURIComponent(`/print/kitchen/recipes/${id}?plates=45`)}&name=x`,
    );
    expect(refused.status()).toBe(403);
  });

  test("a Kitchen lead downloads the shopping list PDF by shop with prices; a member's print has no price", async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    // A Kitchen lead: Overnight oats on Day 2's breakfast for 60, and a
    // price on the peanut butter.
    await approvedMember(page, request, "pr-klead", "Kay Lead");
    await seedTeam(request, "pr-klead", "kitchen", true);
    await page.goto("/kitchen/meal-plan");
    await page.getByLabel("Days on site").fill("2");
    await page.getByLabel("Day 1 date").fill("2027-04-22");
    await page.getByLabel("Day 2 breakfast").fill("60");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Meal plan saved")).toBeVisible();
    const seeded = await request.post("/api/test/seed-kitchen-book", {
      data: {
        authUserId: "pr-klead",
        recipes: [
          {
            title: "Overnight oats",
            plates: [60],
            ingredients: [
              {
                name: "Rolled oats",
                category: "grain",
                quantity: 3,
                unit: "kg",
              },
              {
                name: "Peanut butter",
                category: "other",
                quantity: 1,
                unit: "kg",
              },
            ],
          },
        ],
      },
    });
    expect(seeded.ok()).toBe(true);
    await page.reload();
    await page
      .getByRole("button", { name: "Add a recipe to Day 2, breakfast" })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Add recipes to breakfast",
    });
    await picker
      .getByRole("button", { name: "Add Overnight oats to Day 2, breakfast" })
      .click();
    await picker.getByRole("button", { name: "Done" }).click();

    await page.goto("/kitchen/shopping");
    await page
      .getByRole("button", {
        name: "Shop, price and where it comes from: Peanut butter",
      })
      .click();
    await page.getByLabel("Shop: Peanut butter").fill("Vlei Farm Stall");
    await page.getByLabel("Price in rands: Peanut butter").fill("96,00");
    await page.getByLabel("Price in rands: Peanut butter").blur();
    await expect(
      page.getByText(/Vlei Farm Stall · R\s96,00 estimate/),
    ).toBeVisible();

    // The list's own heading links to the print.
    await expect(
      page.getByRole("link", { name: "Print list" }),
    ).toHaveAttribute("href", "/print/kitchen/shopping");
    await page.goto("/print/kitchen/shopping");
    await sheetWithoutDesktop(page, "Shopping list");
    const shop = page.getByRole("table", { name: "Vlei Farm Stall" });
    await expect(shop).toContainText("Peanut butter");
    await expect(shop).toContainText(/Shop total\s*R\s96,00/);
    await expect(
      page.getByRole("table", { name: "No shop yet" }),
    ).toContainText("Rolled oats");
    await expect(page.getByTestId("all-shops-total")).toContainText(
      /To spend, all shops \(estimate\)\s*R\s96,00/,
    );
    const pdf = await downloadPdf(page);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1_000);

    // A member prints the same list by shop area, with no shop and no price.
    await approvedMember(page, request, "pr-kmember", "Mem Ber");
    await page.goto("/print/kitchen/shopping");
    await sheetWithoutDesktop(page, "Shopping list");
    await expect(page.getByRole("table", { name: "Other" })).toContainText(
      "Peanut butter",
    );
    await expect(page.getByText("Vlei Farm Stall")).toHaveCount(0);
    await expect(page.getByText(/R\s96,00/)).toHaveCount(0);
    await expect(page.getByText("Shop total")).toHaveCount(0);
    await expect(page.getByTestId("all-shops-total")).toHaveCount(0);
  });

  test("any member prints the burn timeline and the loading checklist; the prep plan is the Kitchen's", async ({
    page,
    request,
  }) => {
    await asCaptain(page, request);
    const seeded = await request.post("/api/test/seed-prints", {
      data: { authUserId: "pr-cap" },
    });
    expect(seeded.ok(), await seeded.text()).toBe(true);

    await approvedMember(page, request, "pr-timeline", "Tim Line");
    await page.goto("/logistics");
    await expect(
      page.getByRole("link", { name: "Print the timeline" }),
    ).toHaveAttribute("href", "/print/logistics/timeline");
    await page.goto("/print/logistics/timeline");
    await sheetWithoutDesktop(page, "Burn timeline", { landscape: true });
    const strip = page.getByTestId("timeline-strip");
    // Pack: 7 going, +3 maybe; burn days: the 10 accepted members.
    await expect(strip.getByTestId("timeline-people").first()).toHaveText("7");
    await expect(strip).toContainText("+3");
    await expect(strip.getByTestId("timeline-people").nth(5)).toHaveText("10");
    // Counts only: no member's name anywhere on the sheet.
    await expect(page.locator("[data-print-sheet]")).not.toContainText("Pat");

    await page.goto("/inventory");
    await expect(
      page.getByRole("link", { name: "Print loading checklist" }),
    ).toHaveAttribute("href", "/print/inventory/loading");
    await page.goto("/print/inventory/loading");
    await sheetWithoutDesktop(page, "Loading checklist");
    await expect(page.getByTestId("loading-vehicles")).toContainText(
      "Big Red, behind Pat's car",
    );
    await expect(
      page.getByRole("columnheader", { name: /^Cooler boxes and fridges/ }),
    ).toBeVisible();
    await expect(page.getByTestId("loading-item")).toHaveCount(20);

    // The prep plan: refused to a member, outside the sheet.
    await page.goto("/print/kitchen/prep");
    await expect(page.getByTestId("prep-refusal")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Download PDF" }),
    ).toHaveCount(0);
  });
});
