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
import { startButton } from "./lib/console-nav";

// The lounge programme (#269, test-mode). A member offers sunrise yoga. A
// Kitchen lead (the same global team_lead rung) reads the programme but gets
// no offers to decide and the lock line. A Ministry of Vibes lead accepts the
// yoga and places it on day 2 at 07:00. The member then finds it on the
// programme and their offer marked Accepted, and the printed day 2 shows it
// with the host as a first name and an initial, and no console around it.

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
    page.getByRole("heading", { level: 1, name: "Lounge programme" }),
  ).toBeVisible();
}

const REFUSAL =
  "Only captains and Ministry of Vibes leads can accept offers and place them in the programme.";

test.describe("lounge programme (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a member offers, a Kitchen lead only reads, a Vibes lead accepts and places, and it shows on the programme", async ({
    page,
    request,
  }) => {
    // A member offers an activity.
    await approvedMember(page, request, "lng-member", "Sam Moon");
    await openLounge(page);
    await expect(page.getByText(REFUSAL)).toBeVisible();
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
    const mine = page.getByRole("region", { name: "Your offers" });
    await expect(mine.getByText("Sunrise yoga")).toBeVisible();
    await expect(mine.getByText("Waiting for a decision")).toBeVisible();

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
    await expect(page.getByText(REFUSAL)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Offers", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText("Sunrise yoga")).toHaveCount(0);

    // A Ministry of Vibes lead accepts it and places it.
    await approvedMember(page, request, "lng-lead", "Vee Lead");
    await seedTeam(request, "lng-lead", "ministry_of_vibes", true);
    await openLounge(page);
    await expect(page.getByText(REFUSAL)).toHaveCount(0);
    const offers = page.getByRole("region", { name: "Offers" });
    await expect(offers.getByText("Offered by Sam Moon")).toBeVisible();
    await offers.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByText("Offer accepted.")).toBeVisible();
    await offers.getByRole("button", { name: "Place" }).click();
    dialog = page.getByRole("dialog", { name: "Place Sunrise yoga" });
    // The host's day and time are picked already: day 2, 06:00.
    await dialog.getByRole("combobox", { name: "Starts at" }).click();
    await page.getByRole("option", { name: "07:00" }).click();
    await dialog
      .getByRole("button", { name: "Put it on the programme" })
      .click();
    await expect(
      page.getByText("Sunrise yoga is on the programme"),
    ).toBeVisible();
    await expect(
      page.getByTestId("programme-item").filter({ visible: true }),
    ).toContainText("07:00–08:00");

    // The member sees it on the programme and their offer accepted.
    await login(page, {
      id: "lng-member",
      email: "lng-member@example.com",
      displayName: "Sam Moon",
    });
    await openLounge(page);
    await expect(
      page.getByTestId("programme-item").filter({ visible: true }),
    ).toContainText("Sunrise yoga");
    await expect(
      page.getByRole("region", { name: "Your offers" }).getByText("Accepted"),
    ).toBeVisible();

    // The console's taskbar is here, and not on paper.
    await expect(startButton(page)).toBeVisible();

    // The printed day 2: the item, the host's first name and initial, no nav.
    await page.goto("/print/lounge?day=2");
    await expect(page.getByTestId("print-item")).toContainText("Sunrise yoga");
    await expect(page.getByTestId("print-item")).toContainText("Sam M.");
    await expect(startButton(page)).toHaveCount(0);
  });
});
