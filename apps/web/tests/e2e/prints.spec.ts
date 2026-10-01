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
async function sheetWithoutDesktop(page: Page, heading: string) {
  await expect(
    page.getByRole("heading", { level: 1, name: heading }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download PDF" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
  await expect(osBar(page)).toHaveCount(0);
  await expect(page.locator("[data-os-skin]")).toHaveCount(0);
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
      ["/print/power/refuel-sheet", "Refuelling log"],
      ["/print/power/grid", "Grid sheet"],
      ["/print/power/sharing", "Sharing a generator"],
      ["/print/lounge?day=1", "Lounge programme"],
      ["/print/lounge?sheet=blank", "Lounge whiteboard"],
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
    await page.goto("/print/power/refuel-sheet");
    await sheetWithoutDesktop(page, "Refuelling log");
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
      "/print/pdf?from=%2Fprint%2Fpower%2Frefuel-sheet&name=x",
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
});
