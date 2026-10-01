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
  seedParticipation,
  seedTeam,
  setRank,
} from "./_helpers";

// The shift roster (#248, test-mode, where the store stands in for the
// database). Owner, 2026-09-30: members sign up in the app before the burn;
// it is printed for site; at least 3 shifts each, as a reminder only.
//
//  1. A captain sets the Burn's days on Logistics. A Sanitation lead sets up
//     a one-person cleaning shift, which runs every Burn day. A member signs
//     up for the last place; a second member, whose page still offered it, is
//     refused with a sentence. A member may only read the setup. A Kitchen
//     lead is offered only Kitchen for a new shift and cannot change the
//     cleaning shift or put anyone on it.
//  2. My shifts lists the member's shift, warns when their own AfrikaBurn
//     volunteer shift clashes, and prints on a pocket card. The day's roster
//     prints with first names and a line for each open place.
//  3. A captain asks everyone who is coming; the reminder shows, and never
//     blocks.

/** The camp's day `days` from now (YYYY-MM-DD). */
function campDay(days: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
  }).format(new Date(Date.now() + days * 86_400_000));
}

/** A camp day as the roster labels it: "Thu 29 Apr". */
function dayLabel(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

const FIRST = campDay(10);
const LAST = campDay(12);
const FIRST_LABEL = dayLabel(FIRST);
/** The day as its tab and the lead tools say it: "Thu 29". */
const FIRST_TAB = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
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

async function asCaptain(page: Page, request: APIRequestContext) {
  await login(page, {
    id: "sh-cap",
    email: "god@example.com",
    displayName: "Cap Tain",
  });
  await page.goto("/");
  await completeOnboarding(request, "sh-cap");
  await setRank(request, "sh-cap", "captain");
}

async function openShifts(page: Page, day = FIRST) {
  await page.goto(`/shifts?day=${day}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Shifts" }),
  ).toBeVisible();
}

/**
 * Press a control until what it opens or sets shows: a click that lands
 * before the page has hydrated does nothing, so it is pressed again while it
 * is still there.
 */
async function pressUntil(control: Locator, shown: () => Promise<void>) {
  await expect(async () => {
    if (await control.isVisible()) await control.click({ timeout: 2_000 });
    await shown();
  }).toPass({ timeout: 20_000 });
}

// The day is a table from page-md up and stacked cards below it; whichever
// shows is the row (the other is display:none).
const slotRow = (page: Page, name: string, label = FIRST_LABEL) =>
  page
    .getByTestId("shift-day")
    .getByLabel(`${name} on ${label}`, { exact: true })
    .filter({ visible: true });

const typeRow = (page: Page, name: string) =>
  page
    .getByRole("region", { name: "The shifts" })
    .getByLabel(name, { exact: true })
    .filter({ visible: true });

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

async function addCleaningShift(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Add a shift" });
  await pressUntil(page.getByRole("button", { name: "Add a shift" }), () =>
    expect(dialog).toBeVisible({ timeout: 2_000 }),
  );
  // A Sanitation lead may set up only Sanitation's shifts: it is picked.
  await expect(dialog.getByRole("combobox", { name: "Team" })).toContainText(
    "Sanitation",
  );
  await dialog.getByLabel("Name").fill("Morning clean");
  await dialog.getByLabel("Starts").fill("08:00");
  await dialog.getByLabel("Ends").fill("10:00");
  await dialog.getByLabel("People").fill("1");
  await dialog.getByLabel("What to do (optional)").fill("Dishes and surfaces.");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Morning clean saved, on 3 days.")).toBeVisible();
}

test.describe("shift roster (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a Sanitation lead sets up cleaning; the last place goes to one member; a member and a Kitchen lead only read", async ({
    page,
    request,
    browser,
  }, testInfo) => {
    await approvedMember(page, request, "sh-dee", "Dee Member");
    await approvedMember(page, request, "sh-sam", "Sam Second");
    await approvedMember(page, request, "sh-san", "San Lead");
    await seedTeam(request, "sh-san", "sanitation_and_water", true);
    await approvedMember(page, request, "sh-kit", "Kit Lead");
    await seedTeam(request, "sh-kit", "kitchen", true);

    await asCaptain(page, request);
    await setBurnDays(page);

    // The Sanitation lead sets up a one-person cleaning shift.
    await login(page, { id: "sh-san", email: "sh-san@example.com" });
    await openShifts(page);
    await addCleaningShift(page);
    // The phone's card splits the hours over two lines.
    await expect(typeRow(page, "Morning clean")).toContainText("08:00");
    await expect(typeRow(page, "Morning clean")).toContainText("10:00");
    await expect(typeRow(page, "Morning clean")).toContainText("1 person");
    await expect(slotRow(page, "Morning clean")).toContainText("Nobody yet");
    await expect(slotRow(page, "Morning clean")).toContainText("0 of 1");
    await expect(
      page.getByRole("navigation", { name: "Burn days" }).getByRole("link"),
    ).toHaveCount(3);

    // Sam opens the roster while the place is still open.
    const other = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
    });
    const sam = await other.newPage();
    await login(sam, { id: "sh-sam", email: "sh-sam@example.com" });
    await openShifts(sam);
    const samSignUp = slotRow(sam, "Morning clean").getByRole("button", {
      name: `Sign up for Morning clean on ${FIRST_LABEL}`,
    });
    await expect(samSignUp).toBeEnabled();

    // Dee takes the last place.
    await login(page, { id: "sh-dee", email: "sh-dee@example.com" });
    await openShifts(page);
    await expect(page.getByTestId("shift-reminder")).toContainText(
      "You're not on any shifts yet.",
    );
    const leave = slotRow(page, "Morning clean").getByRole("button", {
      name: `Leave Morning clean on ${FIRST_LABEL}`,
    });
    await pressUntil(
      slotRow(page, "Morning clean").getByRole("button", {
        name: `Sign up for Morning clean on ${FIRST_LABEL}`,
      }),
      () => expect(leave).toBeVisible({ timeout: 3_000 }),
    );
    // Her own place says You; the button stayed in its slot as Leave.
    await expect(slotRow(page, "Morning clean")).toContainText("You");
    await expect(slotRow(page, "Morning clean")).toContainText("1 of 1");
    await expect(page.getByTestId("shift-reminder")).toContainText(
      "You're on 1 shift.",
    );

    // Sam's page still offered it: he is refused, in a sentence.
    await samSignUp.click();
    await expect(
      sam.getByText("That shift is full. Pick another one."),
    ).toBeVisible();
    await openShifts(sam);
    await expect(slotRow(sam, "Morning clean")).toContainText("Dee M.");
    await expect(
      slotRow(sam, "Morning clean").getByRole("status", {
        name: `Morning clean on ${FIRST_LABEL} is full`,
      }),
    ).toHaveText("Full");
    // A member only reads: no lead tools, no Add, no Change.
    await expect(
      sam.getByRole("button", { name: /^Lead tools for/ }),
    ).toHaveCount(0);
    await expect(sam.getByRole("button", { name: "Add a shift" })).toHaveCount(
      0,
    );
    await expect(
      sam.getByRole("button", { name: "Change Morning clean" }),
    ).toHaveCount(0);
    await other.close();

    // The Sanitation lead opens the row's lead tools: they are under the
    // row, never in it, and the row's own button is still Sign up's slot.
    await login(page, { id: "sh-san", email: "sh-san@example.com" });
    await openShifts(page);
    const arrow = slotRow(page, "Morning clean").getByRole("button", {
      name: "Lead tools for Morning clean",
    });
    const panel = page.locator(`[id^="lead-"]`).filter({ visible: true });
    await pressUntil(arrow, () =>
      expect(panel).toContainText(
        `Lead tools · Morning clean, ${FIRST_LABEL}`,
        { timeout: 2_000 },
      ),
    );
    await expect(arrow).toHaveAttribute("aria-expanded", "true");
    // Someone is on it: the day cannot be skipped yet.
    await expect(
      panel.getByRole("button", { name: `Not needed on ${FIRST_TAB}` }),
    ).toBeDisabled();
    await expect(panel).toContainText("Take everyone off it first.");
    await panel
      .getByRole("button", { name: "Take Dee M. off Morning clean" })
      .click();
    await expect(slotRow(page, "Morning clean")).toContainText("Nobody yet");
    // Put Sam on from the panel's member picker; the place is full again.
    await panel.getByRole("combobox", { name: "Put someone on" }).click();
    await page.getByRole("option", { name: /Sam/ }).click();
    await panel.getByRole("button", { name: "Put them on" }).click();
    await expect(slotRow(page, "Morning clean")).toContainText("Sam S.");
    await expect(slotRow(page, "Morning clean")).toContainText("1 of 1");
    await expect(panel).toContainText("Full. Take someone off first.");
    await panel
      .getByRole("button", { name: "Take Sam S. off Morning clean" })
      .click();
    await expect(slotRow(page, "Morning clean")).toContainText("Nobody yet");
    await panel
      .getByRole("button", { name: `Not needed on ${FIRST_TAB}` })
      .click();
    await expect(slotRow(page, "Morning clean")).toContainText(
      `Not needed on ${FIRST_TAB}`,
    );
    await expect(
      slotRow(page, "Morning clean").getByRole("status", {
        name: `Morning clean is not needed on ${FIRST_LABEL}`,
      }),
    ).toHaveText("Not needed");

    // A Kitchen lead: Kitchen only for a new shift, and hands off cleaning.
    await login(page, { id: "sh-kit", email: "sh-kit@example.com" });
    await openShifts(page);
    await expect(typeRow(page, "Morning clean")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Change Morning clean" }),
    ).toHaveCount(0);
    // No arrow on a cleaning row: the panel cannot be opened.
    await expect(
      page.getByRole("button", { name: "Lead tools for Morning clean" }),
    ).toHaveCount(0);
    const dialog = page.getByRole("dialog", { name: "Add a shift" });
    await pressUntil(page.getByRole("button", { name: "Add a shift" }), () =>
      expect(dialog).toBeVisible({ timeout: 2_000 }),
    );
    await expect(dialog.getByRole("combobox", { name: "Team" })).toContainText(
      "Kitchen",
    );
  });

  test("My shifts warns about a clash and prints; the roster prints with names and open lines; the captain's ask is a reminder", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "sh-dee", "Dee Member");
    await seedParticipation(request, "sh-dee", "applied");
    await approvedMember(page, request, "sh-san", "San Lead");
    await seedTeam(request, "sh-san", "sanitation_and_water", true);

    await asCaptain(page, request);
    await setBurnDays(page);
    await openShifts(page);
    // The captain may set up any team's shifts.
    const dialog = page.getByRole("dialog", { name: "Add a shift" });
    await pressUntil(page.getByRole("button", { name: "Add a shift" }), () =>
      expect(dialog).toBeVisible({ timeout: 2_000 }),
    );
    await dialog.getByRole("combobox", { name: "Team" }).click();
    await page.getByRole("option", { name: /Sanitation/ }).click();
    await dialog.getByLabel("Name").fill("Morning clean");
    await dialog.getByLabel("Starts").fill("08:00");
    await dialog.getByLabel("Ends").fill("10:00");
    await dialog.getByLabel("People").fill("2");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("Morning clean saved, on 3 days."),
    ).toBeVisible();

    // The captain asks everyone who is coming.
    await page.getByRole("button", { name: "Ask everyone" }).click();
    await expect(page.getByText("Asked 1 member.")).toBeVisible();

    // Dee is reminded, never blocked: Home still opens.
    await login(page, { id: "sh-dee", email: "sh-dee@example.com" });
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await openShifts(page);
    await expect(page.getByTestId("shift-reminder")).toContainText(
      "The captains asked everyone who is coming.",
    );
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

    // My shifts: the shift, then a clash with her Rangers shift.
    await page.goto("/shifts/mine");
    await expect(
      page.getByRole("heading", { level: 1, name: "My shifts" }),
    ).toBeVisible();
    const mine = page.getByRole("list", { name: "My shifts" });
    await expect(mine.getByRole("listitem")).toHaveCount(1);
    await expect(mine).toContainText("Morning clean");
    await expect(mine).toContainText(`${FIRST_LABEL} · 08:00–10:00`);
    const form = page.getByRole("form", { name: "Add an AfrikaBurn shift" });
    await form.getByLabel("Department").fill("Rangers");
    await form.getByLabel("Day").fill(FIRST);
    await form.getByLabel("Starts").fill("09:00");
    await form.getByLabel("Ends").fill("13:00");
    const volunteer = page.getByRole("list", {
      name: "My AfrikaBurn volunteer shifts",
    });
    await pressUntil(form.getByRole("button", { name: "Add it" }), () =>
      expect(volunteer).toContainText("Rangers", { timeout: 3_000 }),
    );
    await expect(mine).toContainText(
      "At the same time as Rangers (AfrikaBurn).",
    );

    // Her pocket card.
    await page.goto("/print/shifts/mine");
    await expect(
      page.getByRole("heading", { level: 1, name: "Dee M.'s shifts" }),
    ).toBeVisible();
    await expect(page.getByTestId("card-shift")).toHaveCount(1);
    await expect(page.getByTestId("card-shift")).toContainText("Morning clean");

    // The day's roster: her name, and a line for the open place.
    await page.goto(`/print/shifts?day=${FIRST}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Camp 404 shifts" }),
    ).toBeVisible();
    const row = page.getByTestId("print-slot");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Dee M.");
    await expect(row.getByLabel("Open place")).toHaveCount(1);
    // The whiteboard sheet: the same rows, no names.
    await page.goto(`/print/shifts?day=${FIRST}&sheet=blank`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Camp 404 shifts" }),
    ).toBeVisible();
    await expect(page.getByTestId("print-slot")).toHaveCount(1);
    await expect(
      page.getByTestId("print-slot").getByLabel("Open place"),
    ).toHaveCount(2);
    await expect(page.getByText("Dee M.")).toHaveCount(0);
  });
});
