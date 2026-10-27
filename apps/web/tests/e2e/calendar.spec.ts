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
import {
  closeConsoleNav,
  navEntry,
  openConsoleNav,
  openToday,
  usesPhoneLayout,
} from "./lib/console-nav";
import { desktopOnly } from "./lib/dom";

/** The month's chips are the desktop grid's; a phone has its own test below. */
const GRID = "a phone's month is the compact grid; it has its own test";

// The Calendar (test-mode, where the store stands in for a connected Google
// Calendar that starts empty). One program since 2026-10-10 (owner:
// "Meetings is a type of calendar item, it shouldn't be a separate app, you
// make events in the calendar app"): a month, a list (Coming up, Past), the
// open event beside it, and every view a link. Captains and team leads make
// events and meetings; a meeting's team writes its minutes.

/** A camp day `days` from today, YYYY-MM-DD. */
function campDay(days: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
  }).format(new Date(Date.now() + days * 86_400_000));
}
const TODAY = campDay(0);
const TOMORROW = campDay(1);
const THIS_MONTH = TODAY.slice(0, 7);
/** The 10th of last month: always in the past, always in last month. */
function lastMonth(day = "10"): string {
  const at = new Date(`${THIS_MONTH}-01T00:00:00Z`);
  at.setUTCMonth(at.getUTCMonth() - 1);
  return `${at.toISOString().slice(0, 7)}-${day}`;
}
const MONTH_NAME = (month: string) =>
  new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

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

async function captain(page: Page, request: APIRequestContext, id: string) {
  await login(page, { id, email: "god@example.com", displayName: "Cap Tain" });
  await page.goto("/");
  await completeOnboarding(request, id);
  await setRank(request, id, "captain");
}

async function seedCalendar(
  request: APIRequestContext,
  makerAuthUserId: string,
  events: unknown[],
): Promise<string[]> {
  return (await seedCalendarWithNotes(request, makerAuthUserId, events)).ids;
}

async function seedCalendarWithNotes(
  request: APIRequestContext,
  makerAuthUserId: string,
  events: unknown[],
): Promise<{ ids: string[]; noteIds: (string | null)[] }> {
  const res = await request.post("/api/test/seed-calendar", {
    data: { makerAuthUserId, events },
  });
  if (!res.ok()) throw new Error(`seedCalendar: ${await res.text()}`);
  return (await res.json()) as { ids: string[]; noteIds: (string | null)[] };
}

/** The Calendar's heading, then the board under it. */
async function openCalendar(page: Page, url = "/calendar") {
  await page.goto(url);
  await expect(
    page.getByRole("heading", { level: 1, name: "Calendar" }),
  ).toBeVisible();
}

/** One event on the month, by the start of its name. */
function chip(page: Page, title: string) {
  return page.getByRole("button", { name: new RegExp(`^${title}`) });
}

function panel(page: Page, name: string) {
  return page.getByRole("complementary", { name });
}

test.describe("the Calendar (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a captain adds an event and a meeting from the month; both show on it and on Home", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, GRID);
    await approvedMember(page, request, "cal-crew", "Kitchen Crew");
    await seedTeam(request, "cal-crew", "kitchen");
    await captain(page, request, "cal-cap");

    await openCalendar(page);
    // The month on screen, Monday first.
    await expect(
      page.getByRole("heading", { level: 2, name: MONTH_NAME(THIS_MONTH) }),
    ).toBeVisible();

    // An event for the whole camp, all day, from New event.
    await page.getByRole("button", { name: "New event" }).first().click();
    await expect(page).toHaveURL(new RegExp(`new=${TODAY}`));
    const form = page.getByRole("form", { name: "New event" });
    await expect(form.locator("#event-team")).toHaveText("Whole camp");
    await form.getByLabel("Title").fill("Workshop clean-out");
    await form.getByLabel("All day").click();
    await form.getByLabel("Place").fill("The workshop");
    await form.getByRole("button", { name: "Add to the calendar" }).click();
    await expect(page.getByText("Added to the calendar")).toBeVisible();
    // It opens beside the month, and its link says so.
    const cleanOut = panel(page, "Workshop clean-out");
    await expect(cleanOut).toBeVisible();
    await expect(cleanOut.getByText("The workshop")).toBeVisible();
    await expect(page).toHaveURL(/event=[0-9a-v]+/);
    await expect(chip(page, "Workshop clean-out")).toBeVisible();

    // A Kitchen meeting, tomorrow: an event added with an agenda is a
    // meeting, its meeting page made with the same agenda. Tomorrow, not a
    // fixed day, so Home's Coming up still lists it late in the month.
    await page.getByRole("button", { name: "New event" }).first().click();
    const meeting = page.getByRole("form", { name: "New event" });
    await meeting.locator("#event-team").click();
    await page.getByRole("option", { name: "Kitchen" }).click();
    await meeting.getByLabel("Title").fill("Kitchen planning");
    await meeting.getByLabel("Date").fill(TOMORROW);
    await meeting.getByLabel("Starts").fill("19:00");
    await meeting.getByLabel("Ends").fill("20:30");
    await meeting
      .getByRole("textbox", { name: "Agenda", exact: true })
      .fill("The menu and the gas");
    await meeting.getByRole("button", { name: "Add to the calendar" }).click();
    await expect(
      page.getByText("Added to the calendar, with its meeting page"),
    ).toBeVisible();
    const planning = panel(page, "Kitchen planning");
    await expect(planning.getByText("MEETING", { exact: true })).toBeVisible();
    await expect(planning.getByText("The menu and the gas")).toBeVisible();
    if (TOMORROW.slice(0, 7) !== THIS_MONTH) {
      await page.getByRole("button", { name: "Next month" }).click();
    }
    await expect(chip(page, "Kitchen planning, 19:00, meeting")).toBeVisible();

    // The store's Google stand-in has both, so Home's Coming up lists them.
    await login(page, { id: "cal-crew", email: "cal-crew@example.com" });
    await page.goto("/");
    const today = await openToday(page);
    await expect(
      today
        .getByRole("list", { name: "Coming up" })
        .getByText("Kitchen planning"),
    ).toBeVisible();
  });

  test("a plain member reads the calendar but adds nothing", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, GRID);
    await captain(page, request, "cal-cap");
    await seedCalendar(request, "cal-cap", [
      {
        event: {
          kind: "event",
          team: null,
          title: "Dome rehearsal",
          date: TODAY,
          allDay: false,
          start: "10:00",
          end: "13:00",
        },
      },
    ]);
    await approvedMember(page, request, "cal-plain", "Plain Member");
    await seedTeam(request, "cal-plain", "kitchen");

    await openCalendar(page);
    // Present first: the event. Then the absences.
    await expect(chip(page, "Dome rehearsal")).toBeVisible();
    await expect(page.getByRole("button", { name: "New event" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: /^New event on / }),
    ).toHaveCount(0);
    await chip(page, "Dome rehearsal").click();
    const detail = panel(page, "Dome rehearsal");
    await expect(detail).toBeVisible();
    await expect(
      detail.getByRole("button", { name: "Edit event" }),
    ).toHaveCount(0);

    // A link to the form shows no form, and the old Add an event page sends
    // here too.
    await page.goto(`/calendar?new=${TODAY}`);
    await expect(chip(page, "Dome rehearsal")).toBeVisible();
    await expect(page.getByRole("form", { name: "New event" })).toHaveCount(0);
    await page.goto("/captains/calendar");
    await expect(page).toHaveURL(/\/calendar\?view=month/);
    await expect(chip(page, "Dome rehearsal")).toBeVisible();
    await expect(page.getByRole("form", { name: "New event" })).toHaveCount(0);

    // No Meetings and no New event program: the Calendar holds both.
    await page.goto("/");
    const programs = await openConsoleNav(page);
    await expect(navEntry(programs, "Calendar")).toBeVisible();
    await expect(navEntry(programs, "Meetings")).toHaveCount(0);
    await expect(navEntry(programs, "New event")).toHaveCount(0);
    await closeConsoleNav(page);
  });

  test("a captain makes an event for picked people, with a call link; it says who it is for", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, GRID);
    await approvedMember(page, request, "cal-pick", "Picked Person");
    await approvedMember(page, request, "cal-other", "Someone Else");
    await captain(page, request, "cal-cap");

    await openCalendar(page);
    await page.getByRole("button", { name: "New event" }).first().click();
    const form = page.getByRole("form", { name: "New event" });
    await form.locator("#event-team").click();
    await expect(
      page.getByRole("option", { name: "Team leads" }),
    ).toBeVisible();
    await page.getByRole("option", { name: "Pick people" }).click();
    await form.getByLabel("Title").fill("Budget chat");
    await form.getByPlaceholder("Find someone").fill("Picked");
    await form.getByRole("checkbox", { name: "Picked Person" }).click();
    await expect(form.getByText("1 person picked.")).toBeVisible();
    await form.locator("#event-team").scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("people-picker.png") });
    await form
      .getByLabel("Video call link")
      .fill("https://meet.google.com/abc-defg-hij");
    await page.screenshot({
      path: testInfo.outputPath("new-event-people.png"),
    });
    await form.getByRole("button", { name: "Add to the calendar" }).click();
    await expect(page.getByText("Added to the calendar")).toBeVisible();

    const chat = panel(page, "Budget chat");
    await expect(chat.getByText("Picked people")).toBeVisible();
    await expect(chat.getByText("Picked Person")).toBeVisible();
    await expect(chat.getByText("Someone Else")).toHaveCount(0);
    await expect(
      chat.getByRole("link", { name: "Join the call" }),
    ).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
    await page.screenshot({ path: testInfo.outputPath("event-people.png") });
  });

  test("last month's meeting opens with its minutes; a team member writes the minutes of another", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, GRID);
    await approvedMember(page, request, "cal-cook", "Kitchen Crew");
    await seedTeam(request, "cal-cook", "kitchen");
    await approvedMember(page, request, "cal-money", "Finance Crew");
    await seedTeam(request, "cal-money", "finance");
    await captain(page, request, "cal-cap");
    await seedCalendar(request, "cal-cap", [
      {
        event: {
          kind: "meeting",
          team: "kitchen",
          title: "Kitchen planning",
          date: lastMonth("10"),
          allDay: false,
          start: "19:00",
          end: "20:30",
          place: "Online",
          agenda: "1. Menu for the week",
        },
        minutes: {
          notes: "We agreed on a seven-day menu.",
          decisions: ["Seven dinners, two of them vegan"],
          attendeeAuthUserIds: ["cal-cook"],
          actionItems: [
            { text: "Price a chest freezer", assigneeAuthUserId: "cal-cook" },
          ],
        },
      },
      {
        event: {
          kind: "meeting",
          team: "kitchen",
          title: "Kitchen menu tasting",
          date: lastMonth("12"),
          allDay: false,
          start: "12:00",
          end: "13:00",
          agenda: "Taste three dinners",
        },
      },
    ]);

    // A member of the Kitchen goes back a month and opens the meeting.
    await login(page, { id: "cal-cook", email: "cal-cook@example.com" });
    await openCalendar(page);
    await page.getByRole("button", { name: "Previous month" }).click();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: MONTH_NAME(lastMonth().slice(0, 7)),
      }),
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`month=${lastMonth().slice(0, 7)}`),
    );
    await chip(page, "Kitchen planning").click();
    const planning = panel(page, "Kitchen planning");
    await expect(
      planning.getByText("We agreed on a seven-day menu."),
    ).toBeVisible();
    await expect(
      planning
        .getByRole("list", { name: "Decisions" })
        .getByText("Seven dinners, two of them vegan"),
    ).toBeVisible();
    await expect(
      planning
        .getByRole("list", { name: "Action items" })
        .getByText("Price a chest freezer"),
    ).toBeVisible();
    await expect(
      planning
        .getByRole("list", { name: "Who came" })
        .getByText("Kitchen Crew"),
    ).toBeVisible();

    // The other meeting has no minutes: the member writes them.
    await chip(page, "Kitchen menu tasting").click();
    const tasting = panel(page, "Kitchen menu tasting");
    await expect(tasting.getByText("Taste three dinners")).toBeVisible();
    await tasting.getByRole("link", { name: "Write minutes" }).click();
    await expect(page).toHaveURL(/\/calendar\/[0-9a-v]+\/minutes$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Kitchen menu tasting" }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Notes", exact: true })
      .fill("The curry won.");
    await page.getByRole("checkbox", { name: "Kitchen Crew" }).click();
    await page.getByRole("button", { name: "Add decision" }).click();
    await page
      .getByLabel("Decision 1", { exact: true })
      .fill("Curry on night two");
    await page.getByRole("button", { name: "Save meeting" }).click();
    await expect(page.getByText("Meeting saved")).toBeVisible();
    // Back on the meeting, in its month, with its minutes.
    await expect(page).toHaveURL(/\/calendar\?view=month&month=.*&event=/);
    const saved = panel(page, "Kitchen menu tasting");
    await expect(saved.getByText("The curry won.")).toBeVisible();
    await expect(
      saved
        .getByRole("list", { name: "Decisions" })
        .getByText("Curry on night two"),
    ).toBeVisible();

    // Someone on another team reads them, and gets no Edit.
    await login(page, { id: "cal-money", email: "cal-money@example.com" });
    const link = new URL(page.url());
    await page.goto(`${link.pathname}${link.search}`);
    await expect(
      panel(page, "Kitchen menu tasting").getByText("The curry won."),
    ).toBeVisible();
    await expect(
      panel(page, "Kitchen menu tasting").getByRole("link", { name: "Edit" }),
    ).toHaveCount(0);
    const id = link.searchParams.get("event")!;
    await page.goto(`/calendar/${id}/minutes`);
    await expect(page.getByText("The team's members only")).toBeVisible();
  });

  test("Claude's suggestions are kept, and saving the meeting puts every action item on the task board", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, GRID);
    await approvedMember(page, request, "cal-find", "Kitchen Crew");
    await seedTeam(request, "cal-find", "kitchen");
    await captain(page, request, "cal-cap");
    await seedCalendar(request, "cal-cap", [
      {
        event: {
          kind: "meeting",
          team: "kitchen",
          title: "Kitchen sync",
          date: TODAY,
          allDay: false,
          start: "18:00",
          end: "19:00",
          agenda: "1. Fees",
        },
      },
    ]);

    // A Kitchen member writes the notes and asks Claude (the test store's
    // stand-in answer: no call is made).
    await login(page, { id: "cal-find", email: "cal-find@example.com" });
    await openCalendar(page);
    await chip(page, "Kitchen sync").click();
    await panel(page, "Kitchen sync")
      .getByRole("link", { name: "Write minutes" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Kitchen sync" }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Notes", exact: true })
      .fill("We agreed to target 35 people. Speaker 3 takes logistics.");
    await page
      .getByRole("button", { name: "Find decisions and action items" })
      .click();
    await expect(
      page.getByText("Claude suggests 2 decisions and 2 action items."),
    ).toBeVisible();
    // A name the camp does not know is a question, never a guess.
    await expect(page.getByText("The notes say “Speaker 3”")).toBeVisible();
    await expect(page.getByText("Who is this? Pick")).toBeVisible();

    // Nothing is kept until Keep: keep them all, then save.
    await page.getByRole("button", { name: "Keep all 2" }).first().click();
    await page.getByRole("button", { name: "Keep all 2" }).click();
    await expect(page.locator("[data-suggested]")).toHaveCount(0);
    await expect(page.getByLabel("Decision 1", { exact: true })).toHaveValue(
      "Camp targets 35 people instead of 45 to 50",
    );
    await page.getByRole("button", { name: "Save meeting" }).click();
    await expect(page.getByText("Meeting saved")).toBeVisible();

    // Back on the meeting: each action item is a task, and says how it stands.
    const saved = panel(page, "Kitchen sync");
    const items = saved.getByRole("list", { name: "Action items" });
    await expect(items.getByText("Start collecting camp fees")).toBeVisible();
    await expect(
      items.getByRole("link", { name: "On the board: To do" }),
    ).toHaveCount(2);

    // And on the board, for everyone.
    await page.goto("/tasks");
    await expect(page.getByText("Start collecting camp fees")).toBeVisible();
    await expect(
      page.getByText("Take on the logistics lead role"),
    ).toBeVisible();

    // Once on the board, its words are changed there, not in the minutes.
    await page.goBack();
    await saved.getByRole("link", { name: "Edit" }).click();
    await expect(
      page.getByText("On the task board: change it there."),
    ).toHaveCount(2);
    await expect(page.getByLabel("Action item 1")).toHaveCount(0);
  });

  test("a shared link opens the same view: the list of past meetings with one open", async ({
    page,
    request,
  }) => {
    await captain(page, request, "cal-cap");
    const [id] = await seedCalendar(request, "cal-cap", [
      {
        event: {
          kind: "meeting",
          team: null,
          title: "Year wrap-up",
          date: lastMonth("08"),
          allDay: false,
          start: "14:00",
          end: "16:00",
        },
        minutes: { notes: "Mostly happy.", decisions: ["Shade goes up first"] },
      },
      {
        event: {
          kind: "event",
          team: null,
          title: "Not a meeting",
          date: lastMonth("09"),
          allDay: true,
        },
      },
    ]);
    await approvedMember(page, request, "cal-reader", "Reader");

    // The list, Past, Meetings, the wrap-up open: from the toolbar...
    await openCalendar(page);
    await page
      .getByRole("group", { name: "View" })
      .getByRole("button", { name: "List" })
      .click();
    await page
      .getByRole("group", { name: "When" })
      .getByRole("button", { name: "Past" })
      .click();
    if (usesPhoneLayout(page)) {
      // A narrow window picks the type from a list.
      await page.getByRole("combobox", { name: "Type" }).click();
      await page.getByRole("option", { name: "Meetings" }).click();
    } else {
      await page
        .getByRole("group", { name: "Type" })
        .getByRole("button", { name: "Meetings" })
        .click();
    }
    await page.getByRole("button", { name: /Year wrap-up/ }).click();
    await expect(panel(page, "Year wrap-up")).toBeVisible();
    await expect(page).toHaveURL(
      `/calendar?view=list&when=past&type=meetings&event=${id}`,
    );

    // ...and the same link, opened fresh, shows exactly that.
    await page.goto("/");
    await openCalendar(
      page,
      `/calendar?view=list&when=past&type=meetings&event=${id}`,
    );
    await expect(
      page
        .getByRole("group", { name: "When" })
        .getByRole("button", { name: "Past" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      panel(page, "Year wrap-up").getByText("Mostly happy."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Year wrap-up/ }),
    ).toHaveAttribute("aria-current", "true");
    await expect(
      page.getByRole("button", { name: /Not a meeting/ }),
    ).toHaveCount(0);

    // A link to an event with no month opens on the event's month.
    await openCalendar(page, `/calendar?event=${id}`);
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: MONTH_NAME(lastMonth().slice(0, 7)),
      }),
    ).toBeVisible();
    await expect(panel(page, "Year wrap-up")).toBeVisible();
  });

  test("the old Meetings addresses open the Calendar", async ({
    page,
    request,
  }) => {
    await captain(page, request, "cal-cap");
    const seeded = await seedCalendarWithNotes(request, "cal-cap", [
      {
        event: {
          kind: "meeting",
          team: "kitchen",
          title: "Kitchen kickoff",
          date: lastMonth("05"),
          allDay: false,
          start: "18:00",
          end: "19:00",
        },
        minutes: { notes: "Kicked off." },
      },
    ]);
    await page.goto("/meetings?team=kitchen");
    await expect(page).toHaveURL(
      "/calendar?view=list&when=past&team=kitchen&type=meetings",
    );
    await expect(
      page.getByRole("button", { name: /Kitchen kickoff/ }),
    ).toBeVisible();

    await page.goto("/meetings/new");
    await expect(page).toHaveURL(
      new RegExp(`/calendar\\?view=month&month=${THIS_MONTH}&type=meetings$`),
    );

    // An old note's own address opens its meeting, on its month, and its
    // old edit address opens its minutes.
    const noteId = seeded.noteIds[0]!;
    await page.goto(`/meetings/${noteId}`);
    await expect(page).toHaveURL(
      `/calendar?view=month&month=${lastMonth().slice(0, 7)}&event=${seeded.ids[0]}`,
    );
    await expect(
      panel(page, "Kitchen kickoff").getByText("Kicked off."),
    ).toBeVisible();
    await page.goto(`/meetings/${noteId}/edit`);
    await expect(page).toHaveURL(`/calendar/${seeded.ids[0]}/minutes`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Kitchen kickoff" }),
    ).toBeVisible();
    // A minutes address that is no event's id is a plain 404, not a crash.
    const stray = await page.goto("/calendar/a%25b/minutes");
    expect(stray?.status()).toBe(404);

    // A note no one can find lands on the past meetings.
    await page.goto("/meetings/00000000-0000-4000-8000-000000000000");
    await expect(page).toHaveURL("/calendar?view=list&when=past&type=meetings");
  });

  test("on a phone: the compact month, a day's events, and the event as a sheet", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await captain(page, request, "cal-cap");
    await seedCalendar(request, "cal-cap", [
      {
        event: {
          kind: "meeting",
          team: null,
          title: "Captains' check-in",
          date: TODAY,
          allDay: false,
          start: "19:00",
          end: "20:00",
          place: "Online",
        },
      },
    ]);
    await openCalendar(page);
    // Today is picked: its events are listed under the month.
    const day = page.getByRole("list", { name: "Events on this day" });
    await expect(day.getByText("Captains' check-in")).toBeVisible();
    await expect(day.getByText("Whole camp · Meeting")).toBeVisible();
    await day.getByRole("button", { name: /Captains' check-in/ }).click();
    const sheet = panel(page, "Captains' check-in");
    await expect(sheet.getByText("19:00 to 20:00")).toBeVisible();
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(day.getByText("Captains' check-in")).toBeVisible();
  });
});
