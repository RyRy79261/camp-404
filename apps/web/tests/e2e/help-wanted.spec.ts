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

// Help wanted (test-mode; owner's pick A, 2026-10-09). Every member reads every
// team's roles and presses "I'm keen"; a captain or a lead OF THAT TEAM adds
// roles and picks someone, keen people first; a role that is full says so
// quietly. Lead is the lead flag itself, and only a captain picks it. Who is
// keen is shown to the team's lead and the captains, never to a member.

const PATH = "/help-wanted";

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

async function openBoard(page: Page) {
  await page.goto(PATH);
  await expect(
    page.getByRole("heading", { level: 1, name: "Help wanted" }),
  ).toBeVisible();
}

const team = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });

test.describe("help wanted (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a lead adds a role, a member is keen, the lead picks them, and a captain picks a lead", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "hw-member", "Dee Member");
    await approvedMember(page, request, "hw-other", "Sam Other");
    await approvedMember(page, request, "hw-lead", "Kit Lead");
    await seedTeam(request, "hw-lead", "kitchen", true);

    // The Kitchen's lead adds a role with one place.
    await openBoard(page);
    const kitchen = team(page, "Kitchen");
    await kitchen.getByRole("button", { name: "Add a role to Kitchen" }).click();
    const form = kitchen.getByRole("form", { name: "New role in Kitchen" });
    await form.getByLabel("Role name").fill("Shopper");
    await form.getByLabel("Places").fill("1");
    await form
      .getByLabel("Note, optional")
      .fill("Shops in Cape Town the week before");
    await form.getByRole("button", { name: "Add role" }).click();
    await expect(page.getByText("Added Shopper to Kitchen.")).toBeVisible();
    await expect(
      kitchen.getByText("Shops in Cape Town the week before"),
    ).toBeVisible();
    // A lead of the Kitchen does not pick its Lead: a captain does.
    await expect(
      page.getByRole("button", { name: "Pick someone for Lead in Kitchen" }),
    ).toHaveCount(0);

    // A member reads the board, presses I'm keen, and sees no lead tools.
    await login(page, { id: "hw-member", email: "hw-member@example.com" });
    await openBoard(page);
    await expect(page.getByTestId("help-wanted-summary")).toContainText(
      "role open",
    );
    await expect(page.getByRole("button", { name: /^Pick someone/ })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: /^Change / })).toHaveCount(0);
    await page
      .getByRole("button", { name: "I'm keen on Shopper in Kitchen" })
      .click();
    await expect(
      page.getByRole("button", {
        name: "You're keen on Shopper in Kitchen. Undo",
      }),
    ).toBeVisible();
    await expect(page.getByText("You're keen on 1")).toBeVisible();

    // Another member never sees who else is keen.
    await login(page, { id: "hw-other", email: "hw-other@example.com" });
    await openBoard(page);
    await expect(
      page.getByRole("button", { name: "I'm keen on Shopper in Kitchen" }),
    ).toBeVisible();
    await expect(page.getByText("Dee Member")).toHaveCount(0);

    // The lead sees who is keen and picks them, keen people first.
    await login(page, { id: "hw-lead", email: "hw-lead@example.com" });
    await openBoard(page);
    await expect(team(page, "Kitchen").getByText("1 keen:")).toBeVisible();
    await page
      .getByRole("button", { name: "Pick someone for Shopper in Kitchen" })
      .click();
    const picker = page.getByRole("dialog", { name: "Shopper · Kitchen" });
    await expect(picker.getByText("Keen · 1")).toBeVisible();
    await picker.getByRole("radio", { name: /Dee Member/ }).check();
    await expect(
      picker.getByText("Dee Member becomes a Shopper and joins Kitchen."),
    ).toBeVisible();
    await picker.getByRole("button", { name: "Give them the role" }).click();
    await expect(
      page.getByText("Dee Member is a Shopper in Kitchen now."),
    ).toBeVisible();
    const shopper = team(page, "Kitchen").locator('[data-role="Shopper"]');
    await expect(shopper.getByText("1 of 1")).toBeVisible();
    await expect(shopper.getByText("Full", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Pick someone for Shopper in Kitchen" }),
    ).toHaveCount(0);

    // A captain picks a lead for Structures, which has none.
    await login(page, { id: "hw-cap", email: "god@example.com" });
    await page.goto("/");
    await completeOnboarding(request, "hw-cap");
    await setRank(request, "hw-cap", "captain");
    await openBoard(page);
    const structures = team(page, "Structures");
    await expect(structures.getByText("Needs a lead")).toBeVisible();
    await page
      .getByRole("button", { name: "Pick someone for Lead in Structures" })
      .click();
    const leadPicker = page.getByRole("dialog", {
      name: "A lead for Structures",
    });
    await leadPicker.getByRole("radio", { name: /Sam Other/ }).check();
    await leadPicker.getByRole("button", { name: "Give them the role" }).click();
    await expect(
      page.getByText("Sam Other is a lead of Structures now."),
    ).toBeVisible();
    await expect(structures.getByText("Needs a lead")).toHaveCount(0);
    await expect(structures.getByText("Sam Other").first()).toBeVisible();
  });
});
