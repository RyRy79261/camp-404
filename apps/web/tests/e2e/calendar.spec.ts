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
} from "./lib/console-nav";

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
  }) => {
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

    // A Kitchen meeting with an agenda, on the 20th.
    await page.getByRole("button", { name: "New event" }).first().click();
    const meeting = page.getByRole("form", { name: "New event" });
    await meeting.getByRole("button", { name: /^Meeting/ }).click();
    await meeting.locator("#event-team").click();
    await page.getByRole("option", { name: "Kitchen" }).click();
    await meeting.getByLabel("Title").fill("Kitchen planning");
    await meeting.getByLabel("Date").fill(`${THIS_MONTH}-20`);
    await meeting.getByLabel("Starts").fill("19:00");
    await meeting.getByLabel("Ends").fill("20:30");
    await meeting
      .getByRole("textbox", { name: "Agenda", exact: true })
      .fill("The menu and the gas");
    await meeting.getByRole("button", { name: "Add to the calendar" }).click();
    const planning = panel(page, "Kitchen planning");
    await expect(planning.getByText("MEETING", { exact: true })).toBeVisible();
    await expect(planning.getByText("The menu and the gas")).toBeVisible();
    await expect(chip(page, "Kitchen planning, 19:00, meeting")).toBeVisible();

    // The store's Google stand-in has both, so Home's Coming up lists them.
    await login(page, { id: "cal-crew", email: "cal-crew@example.com" });
    await page.goto("/");
    const today = await openToday(page);
    await expect(
      today.getByRole("list", { name: "Coming up" }).getByText("Kitchen planning"),
    ).toBeVisible();
  });

  test("a plain member reads the calendar but adds nothing", async ({
    page,
    request,
  }) => {
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
    await expect(page.getByRole("button", { name: "New event" })).toHaveCount(0);
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

  test("last month's meeting opens with its minutes; a team member writes the minutes of another", async ({
    page,
    request,
  }) => {
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
          actionItems: [{ text: "Price a chest freezer", assigneeAuthUserId: "cal-cook" }],
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
    await expect(planning.getByText("We agreed on a seven-day menu.")).toBeVisible();
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
      planning.getByRole("list", { name: "Who came" }).getByText("Kitchen Crew"),
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
    await page.getByText("Kitchen Crew", { exact: true }).click();
    await page.getByRole("button", { name: "Add decision" }).click();
    await page.getByLabel("Decision 1", { exact: true }).fill("Curry on night two");
    await page.getByRole("button", { name: "Save minutes" }).click();
    await expect(page.getByText("Minutes saved")).toBeVisible();
    // Back on the meeting, in its month, with its minutes.
    await expect(page).toHaveURL(/\/calendar\?view=month&month=.*&event=/);
    const saved = panel(page, "Kitchen menu tasting");
    await expect(saved.getByText("The curry won.")).toBeVisible();
    await expect(
      saved.getByRole("list", { name: "Decisions" }).getByText("Curry on night two"),
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
    await page.getByRole("group", { name: "View" }).getByRole("button", { name: "List" }).click();
    await page.getByRole("group", { name: "When" }).getByRole("button", { name: "Past" }).click();
    await page.getByRole("group", { name: "Type" }).getByRole("button", { name: "Meetings" }).click();
    await page.getByRole("button", { name: /Year wrap-up/ }).click();
    await expect(panel(page, "Year wrap-up")).toBeVisible();
    await expect(page).toHaveURL(
      `/calendar?view=list&when=past&type=meetings&event=${id}`,
    );

    // ...and the same link, opened fresh, shows exactly that.
    await page.goto("/");
    await openCalendar(page, `/calendar?view=list&when=past&type=meetings&event=${id}`);
    await expect(
      page.getByRole("group", { name: "When" }).getByRole("button", { name: "Past" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(panel(page, "Year wrap-up").getByText("Mostly happy.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Year wrap-up/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(page.getByRole("button", { name: /Not a meeting/ })).toHaveCount(0);

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
    await expect(page.getByRole("button", { name: /Kitchen kickoff/ })).toBeVisible();

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
    // A note no one can find lands on the past meetings.
    await page.goto("/meetings/00000000-0000-4000-8000-000000000000");
    await expect(page).toHaveURL("/calendar?view=list&when=past&type=meetings");
  });
});
