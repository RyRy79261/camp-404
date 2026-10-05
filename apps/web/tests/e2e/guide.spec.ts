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
import { showPreview } from "./lib/guide";

// The Survival Guide (#250, test-mode). A captain writes a duty card: Publish
// is refused while the card has no steps, then the card goes up. A plain
// member finds it marked New, reads it (steps, hard rules), and the mark goes;
// they get no Edit and the editor locks for them. A Kitchen lead writes and
// publishes a Kitchen chapter; a Structures lead reads it but its editor locks
// for them (the write refuses them too: packages/db documents.test.ts).

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

async function openGuide(page: Page) {
  await page.goto("/guide");
  await expect(
    page.getByRole("heading", { level: 1, name: "Survival Guide" }),
  ).toBeVisible();
}

function chapterRow(page: Page, title: string) {
  return page.getByRole("listitem").filter({
    has: page.getByRole("link", { name: title, exact: true }),
  });
}

test.describe("survival guide (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a captain publishes a duty card and a member reads it", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "guide-captain", "Cap Tain");
    await setRank(request, "guide-captain", "captain");

    await page.goto("/guide/new");
    await expect(
      page.getByRole("heading", { level: 1, name: "New chapter" }),
    ).toBeVisible();
    await page.getByRole("radio", { name: "Duty card" }).click();
    await page.getByLabel("Title").fill("Morning clean");
    await page.getByLabel("Who to ask").fill("The Sanitation lead");
    await page.getByRole("button", { name: "Add sub-role" }).click();
    await page.getByLabel("Job").fill("Dishes");
    await page.getByLabel("Fewest").fill("2");
    await page.getByLabel("Most").fill("3");

    // No steps yet: Publish is refused beside the buttons.
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Add at least one step." }),
    ).toBeVisible();

    await page
      .getByLabel("Steps")
      .fill("Fill the three basins.\nWash, rinse, sanitise.");
    await page
      .getByLabel("Hard rules")
      .fill("Never pour liquid into the burn barrel.");
    await page
      .getByLabel("Lead's end-of-shift checklist")
      .fill("Basins empty and upside down.");
    // The free text is the WYSIWYG editor: Ctrl+B makes bold as on a page.
    await page.getByRole("textbox", { name: "Good to know" }).click();
    await page.keyboard.press("Control+b");
    await page.keyboard.type("Gloves");
    await page.keyboard.press("Control+b");
    await page.keyboard.type(" are in the blue crate.");
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Morning clean" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/guide\/morning-clean$/);
    await expect(page.getByRole("list", { name: "Hard rules" })).toContainText(
      "Never pour liquid into the burn barrel.",
    );
    await expect(page.locator("strong", { hasText: "Gloves" })).toBeVisible();

    // A plain member: the card is New, then read, then no longer New.
    await approvedMember(page, request, "guide-member", "Mo Member");
    await openGuide(page);
    await expect(page.getByRole("link", { name: "New chapter" })).toHaveCount(
      0,
    );
    const row = chapterRow(page, "Morning clean");
    await expect(row).toContainText("Duty card");
    await expect(row).toContainText("New");
    await row.getByRole("link", { name: "Morning clean" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Morning clean" }),
    ).toBeVisible();
    await expect(page.getByRole("list", { name: "Steps" })).toContainText(
      "Wash, rinse, sanitise.",
    );
    await expect(page.getByRole("list", { name: "Sub-roles" })).toContainText(
      "2–3 people",
    );
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);

    await openGuide(page);
    await expect(chapterRow(page, "Morning clean")).toBeVisible();
    await expect(chapterRow(page, "Morning clean")).not.toContainText("New");

    // Search finds it by a word on the card.
    await page.getByLabel("Search the guide").fill("barrel");
    // The guide's own Search, in its form; the taskbar's Ctrl+K hint is a
    // "Search" button too.
    await page
      .locator("form")
      .filter({ has: page.getByLabel("Search the guide") })
      .getByRole("button", { name: "Search", exact: true })
      .click();
    await expect(chapterRow(page, "Morning clean")).toBeVisible();

    // The editor is not theirs.
    await page.goto("/guide/morning-clean/edit");
    await expect(
      page.getByText("Captains and this team's leads only"),
    ).toBeVisible();
    await expect(page.getByLabel("Steps")).toHaveCount(0);
  });

  test("a lead writes their team's chapter, and a lead of another team only reads it", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "guide-cook", "Kit Chen");
    await seedTeam(request, "guide-cook", "kitchen", true);

    await page.goto("/guide/new");
    await expect(
      page.getByRole("heading", { level: 1, name: "New chapter" }),
    ).toBeVisible();
    await page.getByLabel("Title").fill("Fridge rules");
    // The text is written as on a page, never as Markdown: the toolbar
    // makes the heading, and the preview shows it as members will read it.
    const body = page.getByRole("textbox", { name: "The chapter" });
    await body.click();
    await page.getByRole("button", { name: "Heading", exact: true }).click();
    await page.keyboard.type("Labels");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Name and date.");
    const preview = await showPreview(page);
    await expect(
      preview.getByRole("heading", { name: "Labels" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(/\/guide\/fridge-rules\/edit$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Fridge rules" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page).toHaveURL(/\/guide\/fridge-rules$/);
    await expect(page.getByRole("link", { name: "Edit" })).toBeVisible();

    await approvedMember(page, request, "guide-builder", "Bo Builder");
    await seedTeam(request, "guide-builder", "structures", true);
    await page.goto("/guide/fridge-rules");
    await expect(
      page.getByRole("heading", { level: 1, name: "Fridge rules" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Labels" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await page.goto("/guide/fridge-rules/edit");
    await expect(
      page.getByText(
        "Only captains and this team's leads can edit its chapters.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "The chapter" }),
    ).toHaveCount(0);
  });

  test("a duty card prints on A4: any member prints a published card or all of them, and only a writer prints a draft", async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    await approvedMember(page, request, "dp-cap", "Cap Tain");
    await setRank(request, "dp-cap", "captain");

    await page.goto("/guide/new");
    await expect(
      page.getByRole("heading", { level: 1, name: "New chapter" }),
    ).toBeVisible();
    await page.getByRole("radio", { name: "Duty card" }).click();
    await page.getByLabel("Title").fill("Evening clean");
    await page.getByLabel("Who to ask").fill("Kitchen lead on shift");
    await page.getByRole("button", { name: "Add sub-role" }).click();
    await page.getByLabel("Job").fill("Washer");
    await page.getByLabel("Fewest").fill("2");
    await page.getByLabel("Most").fill("2");
    await page
      .getByLabel("Steps")
      .fill("Boil water for the wash basin.\nScrape plates first.");
    await page
      .getByLabel("Hard rules")
      .fill("No grey water on the ground, ever.");
    await page
      .getByLabel("Lead's end-of-shift checklist")
      .fill("Gas off at the bottle");
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page).toHaveURL(/\/guide\/evening-clean$/);
    await expect(
      page.getByRole("link", { name: "Print card" }),
    ).toHaveAttribute("href", "/print/guide/duty-cards/evening-clean");

    // A second card, saved but never published.
    await page.goto("/guide/new");
    await expect(
      page.getByRole("heading", { level: 1, name: "New chapter" }),
    ).toBeVisible();
    await page.getByRole("radio", { name: "Duty card" }).click();
    await page.getByLabel("Title").fill("Half written");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(/\/guide\/half-written\/edit$/);
    await expect(
      page.getByRole("link", { name: "Print draft" }),
    ).toHaveAttribute("href", "/print/guide/duty-cards/half-written?draft=1");
    await page.goto("/print/guide/duty-cards/half-written?draft=1");
    await expect(page.getByTestId("duty-card")).toContainText(
      "Duty card (draft)",
    );

    // A plain member prints the published card, and every published card.
    await approvedMember(page, request, "dp-member", "Mo Member");
    await openGuide(page);
    await expect(
      page.getByRole("link", { name: "Print all duty cards" }),
    ).toHaveAttribute("href", "/print/guide/duty-cards");
    await page.goto("/print/guide/duty-cards/evening-clean");
    const card = page.getByTestId("duty-card");
    await expect(
      card.getByRole("heading", { level: 2, name: "Evening clean" }),
    ).toBeVisible();
    await expect(card).toContainText("Stuck? Ask the Kitchen lead on shift.");
    await expect(
      card.getByRole("list", { name: "Who does what" }),
    ).toContainText("2 people");
    await expect(card).toContainText("Never skip these");
    await expect(card).toContainText("page 1 of 1");
    await expect(page.locator("[data-os-skin]")).toHaveCount(0);

    await page.goto("/print/guide/duty-cards");
    await expect(page.getByTestId("duty-card")).toHaveCount(1);
    await expect(page.getByTestId("duty-card")).toContainText("Evening clean");
    await expect(page.locator("[data-print-sheet]")).not.toContainText(
      "Half written",
    );
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 45_000 }),
      page.getByRole("button", { name: "Download PDF" }).click(),
    ]);
    const pdf = await readFile(await download.path());
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // The draft is not theirs to print: refused outside the sheet, no PDF.
    await page.goto("/print/guide/duty-cards/half-written?draft=1");
    await expect(page.getByTestId("duty-card-refusal")).toBeVisible();
    await expect(page.locator("[data-print-sheet]")).toHaveCount(0);
    const refused = await page.request.get(
      `/print/pdf?from=${encodeURIComponent("/print/guide/duty-cards/half-written?draft=1")}&name=x`,
    );
    expect(refused.status()).toBe(403);
  });
});
