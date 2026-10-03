import {
  test,
  expect,
  type APIRequestContext,
  type Locator,
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

// Each shift links to its duty card (#250; the owner's Option A, 2026-10-02;
// test-mode, where the store stands in for the database). A Kitchen lead
// writes a Dishes duty card, then sets up Breakfast dishes and picks the card
// in the shift's set-up. A plain member sees "Duty card" under the shift on
// Shifts, opens it, and the card's page lists the shift. Which leads may
// link which shifts, the compare-and-set and the year's pick-up by name are
// covered on a real Postgres (packages/db shift-duty-cards.test.ts).

function campDay(days: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
  }).format(new Date(Date.now() + days * 86_400_000));
}

const FIRST = campDay(10);
const LAST = campDay(12);
const FIRST_LABEL = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
}).format(new Date(`${FIRST}T00:00:00Z`));

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

/** Press a control until what it opens shows (a click before hydration does nothing). */
async function pressUntil(control: Locator, shown: () => Promise<void>) {
  await expect(async () => {
    if (await control.isVisible()) await control.click({ timeout: 2_000 });
    await shown();
  }).toPass({ timeout: 20_000 });
}

async function openShifts(page: Page) {
  await page.goto(`/shifts?day=${FIRST}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Shifts" }),
  ).toBeVisible();
}

const slotRow = (page: Page, name: string) =>
  page
    .getByTestId("shift-day")
    .getByLabel(`${name} on ${FIRST_LABEL}`, { exact: true })
    .filter({ visible: true });

test.describe("a shift's duty card (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a Kitchen lead links a card in the shift's set-up; a member sees Duty card on the shift and opens it", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "dc-kit", "Kit Lead");
    await seedTeam(request, "dc-kit", "kitchen", true);
    await approvedMember(page, request, "dc-dee", "Dee Member");

    // A captain sets the Burn's days.
    await login(page, {
      id: "dc-cap",
      email: "god@example.com",
      displayName: "Cap Tain",
    });
    await page.goto("/");
    await completeOnboarding(request, "dc-cap");
    await setRank(request, "dc-cap", "captain");
    await page.goto("/logistics");
    const burn = page.getByRole("dialog", { name: "Burn" });
    await pressUntil(page.getByRole("button", { name: "Edit Burn" }), () =>
      expect(burn).toBeVisible({ timeout: 2_000 }),
    );
    await burn.getByLabel("First day").fill(FIRST);
    await burn.getByLabel("Last day").fill(LAST);
    await burn.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Burn saved")).toBeVisible();

    // The Kitchen lead writes the Dishes duty card.
    await login(page, { id: "dc-kit", email: "dc-kit@example.com" });
    await page.goto("/guide/new");
    await expect(
      page.getByRole("heading", { level: 1, name: "New chapter" }),
    ).toBeVisible();
    await pressUntil(page.getByRole("radio", { name: "Duty card" }), () =>
      expect(page.getByLabel("Who to ask")).toBeVisible({ timeout: 2_000 }),
    );
    await page.getByLabel("Title").fill("Dishes");
    await page.getByLabel("Who to ask").fill("The Kitchen lead on shift");
    await page.getByRole("button", { name: "Add sub-role" }).click();
    await page.getByLabel("Job").fill("Washing");
    await page.getByLabel("Fewest").fill("2");
    await page.getByLabel("Most").fill("2");
    await page.getByLabel("Steps").fill("Fill the three basins.");
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Dishes" }),
    ).toBeVisible();
    // No shift uses it yet.
    await expect(
      page.getByRole("region", { name: "For the shifts" }),
    ).toContainText("No shift uses this card this year yet.");

    // ... then sets up Breakfast dishes and picks the card.
    await openShifts(page);
    const dialog = page.getByRole("dialog", { name: "Add a shift" });
    await pressUntil(page.getByRole("button", { name: "Add a shift" }), () =>
      expect(dialog).toBeVisible({ timeout: 2_000 }),
    );
    await dialog.getByLabel("Name").fill("Breakfast dishes");
    await dialog.getByLabel("Starts").fill("09:00");
    await dialog.getByLabel("Ends").fill("10:00");
    await dialog.getByLabel("People").fill("3");
    await dialog.getByRole("combobox", { name: "Duty card" }).click();
    await page.getByRole("option", { name: /^Dishes/ }).click();
    await expect(
      dialog.getByRole("combobox", { name: "Duty card" }),
    ).toContainText("Dishes");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("Breakfast dishes saved, on 3 days."),
    ).toBeVisible();

    // A plain member sees Duty card on the shift and opens it.
    await login(page, { id: "dc-dee", email: "dc-dee@example.com" });
    await openShifts(page);
    const link = slotRow(page, "Breakfast dishes").getByRole("link", {
      name: "Duty card for Breakfast dishes: Dishes",
    });
    await expect(link).toHaveText("Duty card");
    await link.click();
    await expect(page).toHaveURL(/\/guide\/dishes$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Dishes" }),
    ).toBeVisible();
    const forShifts = page.getByRole("region", { name: "For the shifts" });
    await expect(
      forShifts.getByRole("list", { name: "Shifts that use this card" }),
    ).toContainText("Breakfast dishes · Kitchen · 09:00–10:00 every day");
    await expect(
      forShifts.getByRole("link", { name: "Open in Shifts" }),
    ).toBeVisible();
    // The member only reads: no Change on the roster.
    await openShifts(page);
    await expect(
      page.getByRole("button", { name: "Change Breakfast dishes" }),
    ).toHaveCount(0);
  });
});
