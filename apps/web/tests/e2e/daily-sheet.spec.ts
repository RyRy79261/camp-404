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
  seedAllergy,
  seedParticipation,
  seedTeam,
  setRank,
} from "./_helpers";

// The daily site sheet (#249, test-mode, where the store stands in for the
// database). Each team's usual tasks come from Shifts; the sheet groups one
// day's slots by team with the first names of who signed up, and the
// Kitchen's section names the allergies (safety data: team lead and up).
// Each day prints with a General page of empty rows to write on.
//
// A captain sets the Burn's days and a Sanitation and a Kitchen shift; Dee
// signs up and has a nut allergy. Dee, a member, is refused the print and
// is offered no "Print daily sheets". A lead of another team (Power) opens
// it from Shifts: the Sanitation section with "Dee" (never her surname), the
// Kitchen's allergy line, the General page, and a real PDF.

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

/** Press until what it opens shows (a click before hydration does nothing). */
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

async function setBurnDays(page: Page) {
  await page.goto("/logistics");
  await expect(
    page.getByRole("heading", { level: 1, name: "Logistics" }),
  ).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "Burn" });
  await pressUntil(page.getByRole("button", { name: "Edit Burn" }), () =>
    expect(dialog).toBeVisible({ timeout: 2_000 }),
  );
  await dialog.getByLabel("First day").fill(FIRST);
  await dialog.getByLabel("Last day").fill(LAST);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Burn saved")).toBeVisible();
}

async function addShift(
  page: Page,
  team: RegExp,
  name: string,
  starts: string,
  ends: string,
) {
  const dialog = page.getByRole("dialog", { name: "Add a shift" });
  await pressUntil(page.getByRole("button", { name: "Add a shift" }), () =>
    expect(dialog).toBeVisible({ timeout: 2_000 }),
  );
  await dialog.getByRole("combobox", { name: "Team" }).click();
  await page.getByRole("option", { name: team }).click();
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Starts").fill(starts);
  await dialog.getByLabel("Ends").fill(ends);
  await dialog.getByLabel("People").fill("2");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`${name} saved, on 3 days.`)).toBeVisible();
  // Closed before the next one opens.
  await expect(dialog).toBeHidden();
}

const slotRow = (page: Page, name: string) =>
  page
    .getByTestId("shift-day")
    .getByLabel(`${name} on ${FIRST_LABEL}`, { exact: true })
    .filter({ visible: true });

test.describe("daily site sheet (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a lead prints a day: each team's tasks with first names, the allergy line and the General page; a member is refused", async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    await approvedMember(page, request, "ds-dee", "Dee Member");
    await seedParticipation(request, "ds-dee", "applied");
    await seedAllergy(request, "ds-dee", "Nuts", true);
    await approvedMember(page, request, "ds-pow", "Pat Power");
    await seedTeam(request, "ds-pow", "power_and_lighting", true);

    await login(page, {
      id: "ds-cap",
      email: "god@example.com",
      displayName: "Cap Tain",
    });
    await page.goto("/");
    await completeOnboarding(request, "ds-cap");
    await setRank(request, "ds-cap", "captain");
    await setBurnDays(page);
    await openShifts(page);
    await addShift(page, /Sanitation/, "Morning clean", "08:00", "10:00");
    await addShift(page, /Kitchen/, "Breakfast cooks", "07:00", "09:00");

    // Dee signs up for the cleaning.
    await login(page, { id: "ds-dee", email: "ds-dee@example.com" });
    await openShifts(page);
    await pressUntil(
      slotRow(page, "Morning clean").getByRole("button", {
        name: `Sign up for Morning clean on ${FIRST_LABEL}`,
      }),
      () =>
        expect(
          slotRow(page, "Morning clean").getByRole("button", {
            name: `Leave Morning clean on ${FIRST_LABEL}`,
          }),
        ).toBeVisible({ timeout: 3_000 }),
    );
    // A member is offered no daily sheet, and is refused it, with no sheet.
    await expect(
      page.getByRole("link", { name: "Print daily sheets" }),
    ).toHaveCount(0);
    await page.goto(`/print/daily-sheet?day=${FIRST}`);
    await expect(
      page.getByText(/Only captains and team leads can print/),
    ).toBeVisible();
    await expect(page.locator("[data-print-sheet]")).toHaveCount(0);
    await expect(page.getByText("Nuts")).toHaveCount(0);

    // A lead of another team opens it from Shifts.
    await login(page, { id: "ds-pow", email: "ds-pow@example.com" });
    await openShifts(page);
    await page.getByRole("link", { name: "Print daily sheets" }).click();
    await expect(page).toHaveURL(/\/print\/daily-sheet\?day=/);
    const sheet = page.getByRole("region", { name: "Day 1 sheet" });
    await expect(
      sheet.getByRole("heading", { level: 2, name: /^Day 1 · / }),
    ).toBeVisible();
    const san = sheet.getByRole("region", { name: "Sanitation and MOOP" });
    await expect(san).toContainText("Morning clean");
    await expect(san).toContainText("08:00–10:00");
    await expect(san).toContainText("Dee");
    await expect(san.getByLabel("Open place")).toHaveCount(1);
    const kitchen = sheet.getByRole("region", { name: "Kitchen" });
    await expect(kitchen).toContainText("Breakfast cooks");
    await expect(kitchen.getByTestId("sheet-allergies")).toHaveText(
      "Allergies: Nuts (severe) Dee",
    );
    // Only teams with tasks that day.
    await expect(
      sheet.getByRole("region", { name: "Power and Lighting" }),
    ).toHaveCount(0);
    await expect(sheet.getByRole("region", { name: "Notes" })).toBeVisible();
    // First names only: never her surname, nor anyone's email.
    await expect(page.locator("[data-print-sheet]")).not.toContainText(
      "Member",
    );
    await expect(page.locator("[data-print-sheet]")).not.toContainText("@");

    const general = page.getByRole("region", { name: "Day 1 General page" });
    await expect(general).toContainText("Asked by");
    await expect(general.getByTestId("general-row")).toHaveCount(20);

    // Every day: a sheet and a General page each.
    await page
      .getByRole("navigation", { name: "Print options" })
      .getByRole("link", { name: "Every day" })
      .click();
    await expect(
      page.getByRole("region", { name: "Day 3 General page" }),
    ).toBeVisible();
    await expect(page.getByText("page 6 of 6")).toBeVisible();
  });
});
