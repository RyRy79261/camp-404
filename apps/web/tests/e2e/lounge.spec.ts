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
} from "./_helpers";
import { osBar } from "./lib/console-nav";

// The lounge (#269), redesigned to the owner's option A (2026-10-01): tabs,
// the programme one day at a time, an offers table with the next step in one
// fixed column, and placing under the row (test-mode).
//
// 1. A member offers sunrise yoga and finds it on My offers. They get no
//    Offers or Event guide tab and no lock line. A Kitchen lead (the same
//    global team_lead rung) is refused the same way. A Ministry of Vibes lead
//    lands on Offers, accepts the yoga, places it on day 2 at 07:00 from the
//    panel under its row, and the member then finds it on day 2 and their
//    offer On. The printed day 2 shows it with a first name and an initial.
// 2. With a week seeded: the lead asks for changes to a placed set, and the
//    dialog says it comes off the programme; the host reads what was asked on
//    My offers and in the form, and sends it back; the lead sees it New.

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

async function openLounge(page: Page) {
  await page.goto("/lounge");
  await expect(
    page.getByRole("heading", { level: 1, name: "Lounge" }),
  ).toBeVisible();
}

const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name: new RegExp(`^${name}`) });

/** The offers table's row (a table row, or a card in a narrow window). */
const offerRow = (page: Page, title: string): Locator =>
  page
    .getByTestId("offer-row")
    .filter({ visible: true })
    .filter({ hasText: title });

const OLD_REFUSAL =
  "Only captains and Ministry of Vibes leads can accept offers and place them in the programme.";

test.describe("lounge (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a member offers, a Kitchen lead only reads, a Vibes lead accepts and places from the row, and it shows on the day", async ({
    page,
    request,
  }) => {
    // A member offers an activity.
    await approvedMember(page, request, "lng-member", "Sam Moon");
    await openLounge(page);
    await expect(tab(page, "Programme")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // A member gets no runner's tabs and no lock line.
    await expect(tab(page, "My offers")).toBeVisible();
    await expect(tab(page, "Offers")).toHaveCount(0);
    await expect(tab(page, "Event guide")).toHaveCount(0);
    await expect(page.getByText(OLD_REFUSAL)).toHaveCount(0);

    await page.getByRole("button", { name: "Offer something" }).click();
    let dialog = page.getByRole("dialog", { name: "Offer something" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("Sunrise yoga");
    await dialog.getByLabel("Description").fill("Bring a mat.");
    await dialog.getByRole("checkbox", { name: "Space" }).click();
    await dialog.getByRole("checkbox", { name: "Day 2", exact: true }).click();
    await dialog.getByRole("checkbox", { name: /^Morning/ }).click();
    await dialog.getByRole("button", { name: "Send offer" }).click();
    await expect(
      page.getByText("Offer sent to the Ministry of Vibes"),
    ).toBeVisible();
    await tab(page, "My offers").click();
    const mine = page.getByRole("list", { name: "My offers" });
    const yoga = mine.getByRole("listitem", { name: "Sunrise yoga" });
    await expect(yoga).toBeVisible();
    await expect(yoga.getByText("Waiting", { exact: true })).toBeVisible();
    await expect(yoga.getByText("Day 2 · Morning")).toBeVisible();

    // A DJ sees the (unset) music note on the DJ form.
    await page.getByRole("button", { name: "Offer something" }).click();
    dialog = page.getByRole("dialog", { name: "Offer something" });
    await dialog.getByRole("combobox", { name: "What is it?" }).click();
    await page.getByRole("option", { name: "DJ set" }).click();
    await expect(dialog.getByTestId("music-policy")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    // A lead of Kitchen reads, but gets nothing to decide.
    await approvedMember(page, request, "lng-kitchen", "Kit Chen");
    await seedTeam(request, "lng-kitchen", "kitchen", true);
    await openLounge(page);
    await expect(tab(page, "Programme")).toBeVisible();
    await expect(tab(page, "Offers")).toHaveCount(0);
    await expect(page.getByTestId("offer-row")).toHaveCount(0);

    // A Ministry of Vibes lead lands on Offers, with one to act on.
    await approvedMember(page, request, "lng-lead", "Vee Lead");
    await seedTeam(request, "lng-lead", "ministry_of_vibes", true);
    await openLounge(page);
    await expect(tab(page, "Offers")).toHaveAttribute("aria-selected", "true");
    await expect(tab(page, "Offers")).toContainText("1");
    const row = offerRow(page, "Sunrise yoga");
    await expect(row).toContainText("Sam Moon");
    await expect(row).toContainText("New");
    await row.getByRole("button", { name: "Accept Sunrise yoga" }).click();
    await expect(page.getByText("Sunrise yoga accepted.")).toBeVisible();

    // The same slot now says Place; the panel opens under the row with the
    // host's day picked.
    await expect(row).toContainText("Not placed yet");
    await row.getByRole("button", { name: "Place: Sunrise yoga" }).click();
    const panel = page.getByTestId("place-panel").filter({ visible: true });
    await expect(panel.getByRole("combobox", { name: "Day" })).toContainText(
      "Day 2",
    );
    await expect(panel.getByRole("combobox", { name: "Day" })).toContainText(
      "Sam's choice",
    );
    await expect(panel.getByTestId("already-then")).toHaveText(
      "Already on Day 2 then: nothing.",
    );
    await panel.getByRole("combobox", { name: "Starts at" }).click();
    await page.getByRole("option", { name: /^07:00/ }).click();
    await panel
      .getByRole("button", { name: "Place on Day 2 at 07:00" })
      .click();
    await expect(
      page.getByText("Sunrise yoga is on Day 2 at 07:00"),
    ).toBeVisible();

    // Placed, it leaves "To act on" and is on the programme.
    const show = page.getByRole("group", { name: "Show" });
    await expect(
      show.getByRole("button", { name: /^To act on/ }),
    ).toContainText("0");
    await show.getByRole("button", { name: /^On the programme/ }).click();
    await expect(row).toContainText("Day 2 · 07:00");
    await expect(
      row.getByRole("button", { name: "Add another time: Sunrise yoga" }),
    ).toBeVisible();

    // The member finds it on day 2 and their offer On.
    await login(page, {
      id: "lng-member",
      email: "lng-member@example.com",
      displayName: "Sam Moon",
    });
    await openLounge(page);
    const days = page.getByRole("group", { name: "Day" });
    await expect(days.getByRole("button", { name: /^Day 2/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const item = page
      .getByTestId("programme-item")
      .filter({ visible: true })
      .filter({ hasText: "Sunrise yoga" });
    await expect(item).toContainText("07:00–08:00");
    // A member gets no ⋯ on the programme.
    await expect(
      page.getByRole("button", { name: "More for Sunrise yoga" }),
    ).toHaveCount(0);
    await tab(page, "My offers").click();
    await expect(
      page
        .getByRole("listitem", { name: "Sunrise yoga" })
        .getByText("On", { exact: true }),
    ).toBeVisible();

    // The console's bar is here (the taskbar, or the phone's bottom bar), and
    // not on paper.
    await expect(osBar(page)).toBeVisible();

    // The printed day 2: the item, the host's first name and initial, no nav.
    await page.goto("/print/lounge?day=2");
    await expect(page.getByTestId("print-item")).toContainText("Sunrise yoga");
    await expect(page.getByTestId("print-item")).toContainText("Sam M.");
    await expect(osBar(page)).toHaveCount(0);
  });

  test("asking for changes to a placed set warns it comes off; the host reads the note and sends it back", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "lng-dj", "Thandi Nkosi");
    await approvedMember(page, request, "lng-lead", "Vee Lead");
    await seedTeam(request, "lng-lead", "ministry_of_vibes", true);
    const seeded = await request.post("/api/test/seed-lounge", {
      data: {
        runnerAuthUserId: "lng-lead",
        offers: [
          {
            hostAuthUserId: "lng-dj",
            offer: {
              kind: "dj_set",
              title: "Sunset deep house",
              description: "Slow deep house as the sun drops.",
              durationMinutes: 120,
              needs: ["sound"],
              needsNote: null,
              preferredDays: [3],
              preferredBands: ["sunset"],
              recurring: false,
              publicGuide: true,
            },
            decision: "accepted",
            places: [{ day: 3, startMinute: 18 * 60 }],
          },
        ],
      },
    });
    expect(seeded.ok()).toBe(true);

    // Nothing waits, so the lead lands on the Programme; the guide lists it.
    await openLounge(page);
    await expect(tab(page, "Programme")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await tab(page, "Event guide").click();
    await expect(
      page.getByTestId("guide-entry").filter({ visible: true }),
    ).toContainText("Day 3 · 18:00–20:00");

    await tab(page, "Offers").click();
    const row = offerRow(page, "Sunset deep house");
    await expect(row).toContainText("On");
    await row
      .getByRole("button", { name: "More for Sunset deep house" })
      .click();
    await page.getByRole("menuitem", { name: "Ask for changes" }).click();
    const ask = page.getByRole("dialog", { name: "Ask for changes" });
    await expect(ask.getByTestId("decide-warning")).toHaveText(
      "This takes Sunset deep house off Day 3 18:00.",
    );
    // A reason is needed: the host reads it.
    await ask
      .getByRole("button", { name: "Ask for changes and take it off" })
      .click();
    await expect(
      ask.getByText("Say why, so the host knows what to do."),
    ).toBeVisible();
    await ask
      .getByLabel("What should they change?")
      .fill("Can you start at 19:00?");
    await ask
      .getByRole("button", { name: "Ask for changes and take it off" })
      .click();
    await expect(page.getByText("Changes asked for")).toBeVisible();
    await page
      .getByRole("group", { name: "Show" })
      .getByRole("button", { name: /^Changes asked/ })
      .click();
    await expect(row).toContainText("Waiting for Thandi");

    // The host reads what was asked, and sends it back from the form.
    await login(page, {
      id: "lng-dj",
      email: "lng-dj@example.com",
      displayName: "Thandi Nkosi",
    });
    await openLounge(page);
    await expect(tab(page, "My offers")).toContainText("1");
    await tab(page, "My offers").click();
    const set = page.getByRole("listitem", { name: "Sunset deep house" });
    await expect(set).toContainText("The Ministry asked");
    await expect(set).toContainText("Can you start at 19:00?");
    await set
      .getByRole("button", { name: "Make changes to Sunset deep house" })
      .click();
    const form = page.getByRole("dialog", { name: "Change your offer" });
    await expect(form.getByTestId("asked-note")).toContainText(
      "Can you start at 19:00?",
    );
    await form.getByRole("button", { name: "Send it back" }).click();
    await expect(
      page.getByText("Sent back to the Ministry of Vibes"),
    ).toBeVisible();
    await expect(set.getByText("Waiting", { exact: true })).toBeVisible();

    // The lead has it to act on again.
    await login(page, {
      id: "lng-lead",
      email: "lng-lead@example.com",
      displayName: "Vee Lead",
    });
    await openLounge(page);
    await expect(tab(page, "Offers")).toHaveAttribute("aria-selected", "true");
    await expect(offerRow(page, "Sunset deep house")).toContainText("New");
  });
});
