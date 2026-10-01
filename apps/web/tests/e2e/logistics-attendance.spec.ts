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
  seedParticipation,
  seedTeam,
  setRank,
} from "./_helpers";

// Logistics attendance and the AfrikaBurn deadlines (#247 follow-up, owner
// 2026-09-30; test-mode, where the store stands in for the database and the
// camp's Google Calendar).
//
//  1. A captain asks everyone who is coming. A member who said Yes is told,
//     never blocked, answers Going / Maybe / Can't on Logistics, and reads
//     everyone's answers by name. A member who said Maybe may only read: she
//     sees how many have not answered, never who, and cannot ask or edit. A
//     lead of another team sees who has not answered, but cannot change the
//     phase days or ask. Readers get the days as content: no Edit at all.
//  2. AfrikaBurn's standard dates are listed on the camp's year page before
//     anyone sets one. A captain sets "Registration closes" (on the Calendar
//     once, as "AfrikaBurn: Registration closes", whole-camp), marks the
//     second DDT round as no round this year, and adds and removes an
//     "Other" one. A member reads the set ones on Logistics, in the same
//     groups. A Transport and Logistics lead is refused the page and sent to
//     Logistics.
//  3. A captain names the camp's year under test mode (the store's twin of
//     setFoundingYear), and the dates written before it stay listed.

/** A camp day (YYYY-MM-DD) as the pages write it: "Fri 15 Jan 2027". */
function dateText(day: string): string {
  const at = new Date(`${day}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(at);
  return `${parts} ${at.getUTCFullYear()}`;
}

/** The camp's day `days` from now (YYYY-MM-DD). */
function campDay(days: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
  }).format(new Date(Date.now() + days * 86_400_000));
}

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
    id: "att-cap",
    email: "god@example.com",
    displayName: "Cap Tain",
  });
  await page.goto("/");
  await completeOnboarding(request, "att-cap");
  await setRank(request, "att-cap", "captain");
}

async function openLogistics(page: Page) {
  await page.goto("/logistics");
  await expect(
    page.getByRole("heading", { level: 1, name: "Logistics" }),
  ).toBeVisible();
}

const helpCard = (page: Page, phase: string) =>
  page
    .getByRole("list", { name: "Who can help" })
    .getByRole("listitem", { name: `Who can help: ${phase}` });

/** How many have not answered, as a plain member reads it. */
const counts = (page: Page, phase: string) =>
  page.getByTestId(`attendance-counts-${phase.toLowerCase()}`);

const EDITORS_NOTE = "Captains and Transport and Logistics leads set the days.";

/**
 * Press a control until what it opens or sets shows: a click that lands
 * before the page has hydrated does nothing, so it is pressed again.
 */
async function pressUntil(
  press: () => Promise<void>,
  shown: () => Promise<void>,
) {
  await expect(async () => {
    await press();
    await shown();
  }).toPass({ timeout: 20_000 });
}

async function answer(page: Page, phase: string, choice: string) {
  const button = helpCard(page, phase)
    .getByRole("group", { name: `Your answer for ${phase}` })
    .getByRole("button", { name: choice });
  await pressUntil(
    () => button.click(),
    () =>
      expect(button).toHaveAttribute("aria-pressed", "true", {
        timeout: 3_000,
      }),
  );
}

test.describe("logistics attendance and deadlines (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("the captain asks; a member answers; a Maybe member and a Kitchen lead only read", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "att-dee", "Dee Member");
    await seedParticipation(request, "att-dee", "applied");
    await approvedMember(page, request, "att-quinn", "Quinn Quiet");
    await seedParticipation(request, "att-quinn", "accepted");
    await approvedMember(page, request, "att-mo", "Mo Maybe");
    await seedParticipation(request, "att-mo", "maybe");
    await approvedMember(page, request, "att-kit", "Kit Lead");
    await seedTeam(request, "att-kit", "kitchen", true);

    // The captain asks: Dee and Quinn are coming; Mo said Maybe.
    await asCaptain(page, request);
    await openLogistics(page);
    // Not pressUntil: a second press is a real second ask.
    await page.getByRole("button", { name: "Ask who can help" }).click();
    await expect(page.getByText("Asked 2 members.")).toBeVisible();
    await page.getByRole("button", { name: "Ask who can help" }).click();
    await expect(
      page.getByText(
        "2 members already have the ask unread. No second notice was sent.",
      ),
    ).toBeVisible();

    // Dee is told, not blocked, and answers every day.
    await login(page, { id: "att-dee", email: "att-dee@example.com" });
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await openLogistics(page);
    await expect(page.getByTestId("attendance-asked")).toBeVisible();
    await expect(
      page.getByTestId("attendance-asked").getByRole("link", {
        name: "Answer now",
      }),
    ).toHaveAttribute("href", "#who-can-help");
    await answer(page, "Pack", "Going");
    await expect(helpCard(page, "Pack")).toContainText("Going (1)");
    await expect(counts(page, "Pack")).toHaveText("1 not answered.");
    await expect(helpCard(page, "Pack")).toContainText("Dee Member");
    // Maybe is a real answer, and hers to change.
    await answer(page, "Build", "Maybe");
    await answer(page, "Build", "Going");
    await answer(page, "Strike", "Maybe");
    await answer(page, "Unpack", "Can't");
    await openLogistics(page);
    await expect(helpCard(page, "Build")).toContainText("Going (1)");
    await expect(counts(page, "Build")).toHaveText("1 not answered.");
    await expect(page.getByTestId("attendance-asked")).toHaveCount(0);

    // Mo said Maybe: not asked, and may only read. She sees Dee's answer and
    // how many have not answered, never who.
    await login(page, { id: "att-mo", email: "att-mo@example.com" });
    await openLogistics(page);
    await expect(helpCard(page, "Pack")).toContainText("Going (1)");
    await expect(counts(page, "Pack")).toHaveText("1 not answered.");
    await expect(helpCard(page, "Strike")).toContainText("Dee Member");
    await expect(page.getByTestId("attendance-asked")).toHaveCount(0);
    await expect(page.getByText("Quinn Quiet")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Ask who can help" }),
    ).toHaveCount(0);
    await expect(page.getByText(EDITORS_NOTE)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Edit/ })).toHaveCount(0);

    // A lead of Kitchen sees who has not answered, but cannot change the
    // phase days or ask.
    await login(page, { id: "att-kit", email: "att-kit@example.com" });
    await openLogistics(page);
    await expect(helpCard(page, "Pack")).toContainText(
      "Not answered (1)Quinn Quiet",
    );
    await expect(page.getByText(EDITORS_NOTE)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Edit/ })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Ask who can help" }),
    ).toHaveCount(0);
  });

  test("a captain sets AfrikaBurn's dates; members read them in groups; a T&L lead is refused", async ({
    page,
    request,
  }) => {
    const DUE = campDay(30);
    const DUE_TEXT = dateText(DUE);

    await approvedMember(page, request, "att-truck", "Tess Truck");
    await seedTeam(request, "att-truck", "transport_and_logistics", true);
    // A Transport and Logistics lead sets the days, but not AfrikaBurn's.
    await page.goto("/captains/camp-settings/cycle");
    await expect(
      page.getByRole("heading", { level: 1, name: "The camp’s year" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "The camp's year and the AfrikaBurn deadlines are kept by captains. You can read the deadlines on Logistics.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open Logistics" }),
    ).toHaveAttribute("href", "/logistics");
    await expect(
      page.getByRole("button", {
        name: "Set the date for Registration closes",
      }),
    ).toHaveCount(0);

    // The standard dates are listed before anyone sets one.
    await asCaptain(page, request);
    await page.goto("/captains/camp-settings/cycle");
    await expect(
      page.getByRole("heading", { level: 1, name: "The camp’s year" }),
    ).toBeVisible();
    const registration = page.getByRole("region", {
      name: "Theme camp registration",
    });
    const closes = registration.getByRole("listitem", {
      name: "Registration closes",
    });
    await expect(closes).toContainText("Not announced yet");
    await expect(
      page
        .getByRole("region", { name: "Work access passes (WAP)" })
        .getByRole("listitem"),
    ).toHaveCount(3);

    // "Set the date": it says the calendar title, and needs a date.
    let dialog = page.getByRole("dialog", {
      name: "Set the date · Registration closes",
    });
    await pressUntil(
      () =>
        closes
          .getByRole("button", { name: "Set the date for Registration closes" })
          .click(),
      () => expect(dialog).toBeVisible({ timeout: 2_000 }),
    );
    await expect(dialog).toContainText(
      "Goes on the camp calendar as “AfrikaBurn: Registration closes”.",
    );
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Pick the date.")).toBeVisible();
    await dialog.getByLabel("Date", { exact: true }).fill(DUE);
    await dialog
      .getByLabel("Note (optional)")
      .fill("Wrangler said they will not extend it.");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Date saved")).toBeVisible();
    await expect(closes).toContainText(DUE_TEXT);
    await closes
      .getByRole("checkbox", { name: "Registration closes done" })
      .click();
    await expect(
      closes.getByRole("checkbox", { name: "Registration closes done" }),
    ).toBeChecked();
    await expect(
      closes.getByRole("button", { name: "Change Registration closes" }),
    ).toBeVisible();

    // The second DDT round: no round this year.
    const second = page
      .getByRole("region", { name: "Tickets (DDT)" })
      .getByRole("listitem", { name: "Second DDT round" });
    dialog = page.getByRole("dialog", {
      name: "Set the date · Second DDT round",
    });
    await pressUntil(
      () =>
        second
          .getByRole("button", { name: "Set the date for Second DDT round" })
          .click(),
      () => expect(dialog).toBeVisible({ timeout: 2_000 }),
    );
    await dialog.getByRole("checkbox", { name: "No round this year" }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(second).toContainText("No round this year");

    // Anything else, under Other.
    dialog = page.getByRole("dialog", { name: "Add a date" });
    await pressUntil(
      () => page.getByRole("button", { name: "Add a date" }).click(),
      () => expect(dialog).toBeVisible({ timeout: 2_000 }),
    );
    await dialog.getByRole("button", { name: "Add" }).click();
    await expect(dialog.getByText("Give the date a name.")).toBeVisible();
    await dialog.getByLabel("Name").fill("Mutant vehicle forms");
    await dialog.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Date added")).toBeVisible();
    const other = page
      .getByRole("region", { name: "Other" })
      .getByRole("listitem", { name: "Mutant vehicle forms" });
    await expect(other).toContainText("Not announced yet");

    // On the Calendar once, as the camp's (no team), titled AfrikaBurn: ….
    await page.goto("/calendar");
    await expect(
      page.getByRole("heading", { level: 1, name: "Calendar" }),
    ).toBeVisible();
    const events = page
      .getByRole("listitem")
      .filter({ hasText: "AfrikaBurn: Registration closes" });
    await expect(events).toHaveCount(1);
    await expect(events.getByRole("link")).toHaveCount(0);

    // A member reads them on Logistics, in the same groups; only set ones.
    await approvedMember(page, request, "att-reader", "Rae Reader");
    await openLogistics(page);
    const read = page
      .getByRole("region", { name: "Theme camp registration" })
      .getByRole("listitem", { name: "Registration closes" });
    await expect(read).toContainText(`${DUE_TEXT} · Done`);
    await expect(read).toContainText("Wrangler said they will not extend it.");
    await expect(
      page
        .getByRole("region", { name: "Tickets (DDT)" })
        .getByRole("listitem", { name: "Second DDT round" }),
    ).toContainText("No round this year");
    await expect(
      page.getByRole("region", { name: "Work access passes (WAP)" }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Edit dates" })).toHaveCount(0);

    // A captain's "Edit dates" on Logistics lands on the list.
    await asCaptain(page, request);
    await openLogistics(page);
    await expect(
      page.getByRole("link", { name: "Edit dates" }),
    ).toHaveAttribute("href", "/captains/camp-settings/cycle#deadlines");

    // The captain removes the Other one, from its dialog; the standard ones
    // stay.
    await page.goto("/captains/camp-settings/cycle");
    dialog = page.getByRole("dialog", {
      name: "Set the date · Mutant vehicle forms",
    });
    await pressUntil(
      () =>
        other
          .getByRole("button", {
            name: "Set the date for Mutant vehicle forms",
          })
          .click(),
      () => expect(dialog).toBeVisible({ timeout: 2_000 }),
    );
    await dialog.getByRole("button", { name: "Remove" }).click();
    const confirm = page.getByRole("dialog", { name: "Remove this date?" });
    await confirm.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Date removed")).toBeVisible();
    await expect(other).toHaveCount(0);
    await expect(closes).toContainText(DUE_TEXT);
  });

  test("a captain names the camp's year, and the dates set before it stay", async ({
    page,
    request,
  }) => {
    const DUE = campDay(30);
    await asCaptain(page, request);
    await page.goto("/captains/camp-settings/cycle");
    await expect(
      page.getByRole("heading", { level: 1, name: "The camp’s year" }),
    ).toBeVisible();
    // The page opens at its top: the year box does not take the focus.
    await expect(page.getByLabel("This year")).not.toBeFocused();
    const closes = page
      .getByRole("region", { name: "Theme camp registration" })
      .getByRole("listitem", { name: "Registration closes" });
    const dialog = page.getByRole("dialog", {
      name: "Set the date · Registration closes",
    });
    await pressUntil(
      () =>
        closes
          .getByRole("button", { name: "Set the date for Registration closes" })
          .click(),
      () => expect(dialog).toBeVisible({ timeout: 2_000 }),
    );
    await dialog.getByLabel("Date", { exact: true }).fill(DUE);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Date saved")).toBeVisible();

    const save = page.getByRole("button", {
      name: /^Save (\d{4} as )?the year$/,
    });
    await pressUntil(
      () => save.click(),
      () =>
        expect(page.getByText(/Type the year as four digits/)).toBeVisible({
          timeout: 2_000,
        }),
    );
    await page.getByLabel("This year").fill("2026");
    await page.getByRole("button", { name: "Save 2026 as the year" }).click();
    await expect(page.getByText("The camp is in 2026").first()).toBeVisible();
    await expect(page.getByText("You're in 2026")).toBeVisible();
    await expect(closes).toContainText(dateText(DUE));
  });
});
