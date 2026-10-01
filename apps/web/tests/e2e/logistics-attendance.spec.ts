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
//  2. A captain adds an AfrikaBurn deadline on the camp's year page; it is
//     on Logistics for members and on the Calendar as a whole-camp event,
//     once, moved in place when the date changes, and gone when removed. A
//     Transport and Logistics lead is refused the page and sent to Logistics.
//  3. A captain names the camp's year under test mode (the store's twin of
//     setFoundingYear), and the deadlines written before it stay listed.

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

async function openAddDeadline(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Add a deadline" });
  await pressUntil(
    () => page.getByRole("button", { name: "Add a deadline" }).click(),
    () => expect(dialog).toBeVisible({ timeout: 2_000 }),
  );
  return dialog;
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

  test("a captain keeps the AfrikaBurn deadlines; members read them; a T&L lead is refused", async ({
    page,
    request,
  }) => {
    const DUE = campDay(30);
    const LATER = campDay(32);

    await approvedMember(page, request, "att-truck", "Tess Truck");
    await seedTeam(request, "att-truck", "transport_and_logistics", true);
    // A Transport and Logistics lead sets the days, but not the deadlines.
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
      page.getByRole("button", { name: "Add a deadline" }),
    ).toHaveCount(0);

    // The captain adds one with a date, and one whose date is not known.
    await asCaptain(page, request);
    await page.goto("/captains/camp-settings/cycle");
    await expect(
      page.getByRole("heading", { level: 1, name: "The camp’s year" }),
    ).toBeVisible();
    let dialog = await openAddDeadline(page);
    await dialog.getByRole("button", { name: "Add" }).click();
    await expect(dialog.getByText("Give the deadline a title.")).toBeVisible();
    await dialog.getByLabel("Title").fill("Theme camp registration closes");
    await dialog.getByLabel("Date (optional)").fill(DUE);
    await dialog.getByLabel("Note (optional)").fill("On the AfrikaBurn site.");
    await dialog.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Deadline added")).toBeVisible();
    dialog = await openAddDeadline(page);
    await dialog.getByLabel("Title").fill("DDT sale opens");
    await dialog.getByRole("button", { name: "Add" }).click();
    const list = page.getByRole("list", { name: "AfrikaBurn deadlines" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    const registration = list.getByRole("listitem", {
      name: "Theme camp registration closes",
    });
    await expect(registration).toContainText("Theme camp registration closes");
    await expect(registration).not.toContainText("camp calendar");
    await expect(
      list.getByRole("listitem", { name: "DDT sale opens" }),
    ).toContainText("Date not known yet.");

    // On the Calendar once, as the camp's (no team).
    const onCalendar = async () => {
      await page.goto("/calendar");
      await expect(
        page.getByRole("heading", { level: 1, name: "Calendar" }),
      ).toBeVisible();
      return page
        .getByRole("listitem")
        .filter({ hasText: "Theme camp registration closes" });
    };
    let events = await onCalendar();
    await expect(events).toHaveCount(1);
    await expect(events.getByRole("link")).toHaveCount(0);

    // A new date moves the same event; "Mark done" marks it done.
    await page.goto("/captains/camp-settings/cycle");
    dialog = page.getByRole("dialog", { name: "Edit deadline" });
    await pressUntil(
      () =>
        registration
          .getByRole("button", { name: "Edit Theme camp registration closes" })
          .click(),
      () => expect(dialog).toBeVisible({ timeout: 2_000 }),
    );
    await dialog.getByLabel("Date (optional)").fill(LATER);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Deadline saved")).toBeVisible();
    const done = registration.getByRole("button", {
      name: "Theme camp registration closes done",
    });
    await expect(done).toHaveText("Mark done");
    await done.click();
    await expect(done).toHaveAttribute("aria-pressed", "true");
    await expect(done).toHaveText("Not done");
    await expect(registration).toContainText("Done");
    events = await onCalendar();
    await expect(events).toHaveCount(1);

    // A member reads them on Logistics.
    await approvedMember(page, request, "att-reader", "Rae Reader");
    await openLogistics(page);
    // Open ones first; the done one is folded into "Done (1)" at the end.
    const read = page.getByRole("list", { name: "AfrikaBurn deadlines" });
    await expect(read.getByRole("listitem")).toHaveCount(1);
    await expect(
      read.getByRole("listitem", { name: "DDT sale opens" }),
    ).toBeVisible();
    await page.getByText("Done (1)").click();
    await expect(
      page
        .getByRole("list", { name: "Done AfrikaBurn deadlines" })
        .getByRole("listitem", { name: "Theme camp registration closes" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Edit deadlines" }),
    ).toHaveCount(0);

    // A captain's "Edit deadlines" on Logistics lands on the list.
    await asCaptain(page, request);
    await openLogistics(page);
    await expect(
      page.getByRole("link", { name: "Edit deadlines" }),
    ).toHaveAttribute("href", "/captains/camp-settings/cycle#deadlines");

    // The captain removes it, from its Edit dialog: off the list and off the
    // calendar.
    await page.goto("/captains/camp-settings/cycle");
    await pressUntil(
      () =>
        registration
          .getByRole("button", { name: "Edit Theme camp registration closes" })
          .click(),
      () => expect(dialog).toBeVisible({ timeout: 2_000 }),
    );
    await dialog.getByRole("button", { name: "Remove" }).click();
    const confirm = page.getByRole("dialog", { name: "Remove this deadline?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Deadline removed")).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    events = await onCalendar();
    await expect(
      page.getByRole("heading", { level: 1, name: "Calendar" }),
    ).toBeVisible();
    await expect(events).toHaveCount(0);
  });

  test("a captain names the camp's year, and the deadlines written before it stay", async ({
    page,
    request,
  }) => {
    await asCaptain(page, request);
    await page.goto("/captains/camp-settings/cycle");
    await expect(
      page.getByRole("heading", { level: 1, name: "The camp’s year" }),
    ).toBeVisible();
    // The page opens at its top: the year box does not take the focus.
    await expect(page.getByLabel("This year")).not.toBeFocused();
    const dialog = await openAddDeadline(page);
    await dialog.getByLabel("Title").fill("WAP applications close");
    await dialog.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Deadline added")).toBeVisible();

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
    await expect(
      page
        .getByRole("list", { name: "AfrikaBurn deadlines" })
        .getByRole("listitem", { name: "WAP applications close" }),
    ).toBeVisible();
  });
});
