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
} from "./_helpers";

// The logistics days (#247, test-mode, where the store stands in for the
// camp's Google Calendar). A Transport and Logistics lead sets the Build days;
// they show on the Calendar once, as a whole-camp event titled "Build". Saving again with a new last day still
// leaves ONE event there (the phase owns its event id). Clearing the days
// takes it off, after the dialog asks. A lead of Kitchen and a plain member
// read the days as content: no Edit at all, and one quiet line saying who sets
// them.

/** The camp's day `days` from now (YYYY-MM-DD). */
function campDay(days: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
  }).format(new Date(Date.now() + days * 86_400_000));
}

const FIRST = campDay(20);
const LAST = campDay(22);
const LATER = campDay(23);

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

async function openLogistics(page: Page) {
  await page.goto("/logistics");
  await expect(
    page.getByRole("heading", { level: 1, name: "Logistics" }),
  ).toBeVisible();
}

function phaseRow(page: Page, name: string) {
  return page
    .getByRole("list", { name: "Logistics days" })
    .getByRole("listitem", { name, exact: true });
}

/** The Calendar's rows that are the Build phase, once the page has painted. */
async function buildEventsOnCalendar(page: Page) {
  await page.goto("/calendar");
  await expect(
    page.getByRole("heading", { level: 1, name: "Calendar" }),
  ).toBeVisible();
  return page.getByRole("listitem").filter({ hasText: "Build" });
}

test.describe("logistics days (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a T&L lead sets the Build days once on the calendar; other leads and members only read", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "log-lead", "Tess Truck");
    await seedTeam(request, "log-lead", "transport_and_logistics", true);
    await openLogistics(page);
    await expect(phaseRow(page, "Build")).toContainText("Days not set yet.");

    // Set the Build days.
    await page.getByRole("button", { name: "Edit Build" }).click();
    let dialog = page.getByRole("dialog", { name: "Build" });
    await dialog.getByLabel("First day").fill(FIRST);
    await dialog.getByLabel("Last day").fill(LAST);
    await dialog.getByLabel("Place (optional)").fill("On site");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Build saved")).toBeVisible();
    await expect(phaseRow(page, "Build")).toContainText("3 days");
    await expect(phaseRow(page, "Build")).toContainText("On site");
    // On the calendar is the normal case, said once in the page description.
    await expect(phaseRow(page, "Build")).not.toContainText("camp calendar");

    let events = await buildEventsOnCalendar(page);
    await expect(events).toHaveCount(1);
    await expect(events).toContainText("On site");
    // A whole-camp event with a plain title: no team badge (owner,
    // 2026-09-30: every phase is a whole-camp activity).
    await expect(events).toContainText("Build");
    await expect(events.getByRole("link")).toHaveCount(0);

    // Save again with a later last day: still one event.
    await openLogistics(page);
    await page.getByRole("button", { name: "Edit Build" }).click();
    dialog = page.getByRole("dialog", { name: "Build" });
    await dialog.getByLabel("Last day").fill(LATER);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Build saved")).toBeVisible();
    await expect(phaseRow(page, "Build")).toContainText("4 days");
    events = await buildEventsOnCalendar(page);
    await expect(events).toHaveCount(1);

    // A last day before the first is refused beside the field.
    await openLogistics(page);
    await page.getByRole("button", { name: "Edit Build" }).click();
    dialog = page.getByRole("dialog", { name: "Build" });
    await dialog.getByLabel("Last day").fill(campDay(10));
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(
      dialog.getByText("The last day can't be before the first."),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // A lead of Kitchen reads the days but cannot change them.
    await approvedMember(page, request, "log-kitchen", "Kit Chen");
    await seedTeam(request, "log-kitchen", "kitchen", true);
    await openLogistics(page);
    await expect(phaseRow(page, "Build")).toContainText("4 days");
    await expect(
      page.getByText(
        "Captains and Transport and Logistics leads set the days.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Edit/ })).toHaveCount(0);

    // So does a plain member.
    await approvedMember(page, request, "log-member", "Mo Member");
    await openLogistics(page);
    await expect(phaseRow(page, "Build")).toContainText("4 days");
    await expect(page.getByRole("button", { name: /^Edit/ })).toHaveCount(0);

    // The lead clears the days: the event comes off the calendar.
    await login(page, {
      id: "log-lead",
      email: "log-lead@example.com",
      displayName: "Tess Truck",
    });
    await openLogistics(page);
    await page.getByRole("button", { name: "Edit Build" }).click();
    dialog = page.getByRole("dialog", { name: "Build" });
    await dialog.getByRole("button", { name: "Clear days" }).click();
    await expect(dialog).toContainText("Take Build off the camp calendar?");
    await dialog.getByRole("button", { name: "Yes, clear the days" }).click();
    await expect(page.getByText("Build days cleared")).toBeVisible();
    await expect(phaseRow(page, "Build")).toContainText("Days not set yet.");
    events = await buildEventsOnCalendar(page);
    await expect(
      page.getByText("Nothing on the calendar for the year ahead."),
    ).toBeVisible();
    await expect(events).toHaveCount(0);
  });
});
