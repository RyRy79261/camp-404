import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  completeOnboarding,
  login,
  resetTestState,
  seedParticipation,
  seedTeam,
  setRank,
} from "./_helpers";

// The year's application pipeline (#238), on the test store's participations
// and tickets twins: the member says where their own ticket stands on their
// profile; a captain gives places and records WAP on Applications and
// sees the overview count it; a team lead sees who is coming and nothing of
// the tickets; a plain member gets a lock.

/**
 * A camp user through the god email (clears access and approval), onboarded
 * and at `rank`. The last one signed in is the one the page sees.
 */
async function person(
  page: Page,
  request: APIRequestContext,
  id: string,
  displayName: string,
  rank: "captain" | "member" = "member",
) {
  await login(page, { id, email: "god@example.com", displayName });
  await page.goto("/"); // lazily creates the camp user row
  await completeOnboarding(request, id);
  await setRank(request, id, rank);
}

/** Sign back in as someone `person` already made. */
async function as(page: Page, id: string, displayName: string) {
  await login(page, { id, email: "god@example.com", displayName });
}

async function openApplications(page: Page) {
  await page.goto("/captains/applications");
  await expect(
    page.getByRole("heading", { level: 1, name: "Applications" }),
  ).toBeVisible();
}

/** One member's row, in whichever copy (table or card list) is showing. */
function row(page: Page, name: string) {
  return page
    .locator("tr, li")
    .filter({ hasText: name })
    .filter({ visible: true });
}

/**
 * What a member said, on their row. The table has a "Says" column; the phone's
 * card has no column heads, so its badge reads "Says: Maybe".
 */
function says(page: Page, name: string, label: string) {
  return row(page, name).getByText(new RegExp(`^(Says: )?${label}$`));
}

/** The overview's "This year" card, once painted. */
async function thisYearCard(page: Page) {
  await page.goto("/captains/overview");
  const card = page.getByRole("article", { name: "This year" });
  await expect(card).toBeVisible();
  return card;
}

test.describe("applications: tickets and WAP", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetTestState(request);
    // Ada said Yes; Ben already has a place.
    await person(page, request, "ada", "Ada Yes");
    await seedParticipation(request, "ada", "applied");
    await person(page, request, "ben", "Ben Placed");
    // Accepted, though he said Maybe: the two are shown apart.
    await seedParticipation(request, "ben", "accepted", "maybe");
    await person(page, request, "cy", "Cy Captain", "captain");
  });

  test("a member says they have a ticket, and a captain gives a place and WAP that the overview counts", async ({
    page,
  }) => {
    // Before: Ben has a place and no ticket.
    await as(page, "cy", "Cy Captain");
    let card = await thisYearCard(page);
    const tickets = card.getByRole("list", { name: "Tickets" });
    await expect(
      tickets.getByRole("listitem").filter({ hasText: "no ticket yet" }),
    ).toHaveText(/1$/);

    // Ben says he has his ticket, on his own profile.
    await as(page, "ben", "Ben Placed");
    await page.goto("/profile");
    await expect(
      page.getByRole("heading", { level: 1, name: "Your profile" }),
    ).toBeVisible();
    await page.getByRole("radio", { name: "I have my ticket" }).click();
    await page.getByRole("button", { name: "Save ticket" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved." }),
    ).toBeVisible();
    // His own DDT and WAP are on his page, read-only, at their defaults.
    const setByCaptains = page.getByLabel("Set by the captains");
    await expect(setByCaptains).toContainText("WAP (work access pass)");
    await expect(setByCaptains).toContainText("Not needed");

    // The captain sees it, accepts Ada and issues Ben's WAP.
    await as(page, "cy", "Cy Captain");
    await openApplications(page);
    await expect(
      page
        .getByRole("combobox", { name: "Ticket for Ben Placed" })
        .filter({ visible: true }),
    ).toHaveValue("has_ticket");
    // What he said and what the captains decided, each in its own column.
    await expect(says(page, "Ben Placed", "Maybe")).toBeVisible();
    await expect(
      row(page, "Ben Placed").getByText("Accepted", { exact: true }),
    ).toBeVisible();
    await expect(
      row(page, "Ada Yes").getByText("Not decided yet", { exact: true }),
    ).toBeVisible();
    // "Coming, not decided" is Ada alone: Ben's decision takes him out.
    await page
      .getByRole("group", { name: "Show" })
      .getByRole("button", { name: /^Coming, not decided/ })
      .click();
    await expect(row(page, "Ada Yes")).toBeVisible();
    await expect(row(page, "Ben Placed")).toHaveCount(0);
    await page
      .getByRole("group", { name: "Show" })
      .getByRole("button", { name: /^All/ })
      .click();
    await page
      .getByRole("button", { name: "Accept Ada Yes for this year" })
      .filter({ visible: true })
      .click();
    await expect(
      row(page, "Ada Yes").getByText("Accepted", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "WAP for Ben Placed" })
      .filter({ visible: true })
      .selectOption({ label: "Issued" });
    await expect(
      page
        .getByRole("combobox", { name: "WAP for Ben Placed" })
        .filter({ visible: true }),
    ).toHaveValue("issued");

    // Ada is now the one with a place and no ticket, and one pass is out.
    card = await thisYearCard(page);
    await expect(
      card.getByRole("listitem").filter({ hasText: /^Accepted/ }),
    ).toHaveText(/^Accepted\s*2$/);
    const after = card.getByRole("list", { name: "Tickets" });
    await expect(
      after.getByRole("listitem").filter({ hasText: "no ticket yet" }),
    ).toHaveText(/1$/);
    await expect(
      after.getByRole("listitem").filter({ hasText: "WAP" }),
    ).toHaveText(/1$/);

    // And the reload keeps it.
    await openApplications(page);
    await expect(
      page
        .getByRole("combobox", { name: "WAP for Ben Placed" })
        .filter({ visible: true }),
    ).toHaveValue("issued");

    // A captain sets Ada's ticket for her; the overview stops counting her.
    await page
      .getByRole("combobox", { name: "Ticket for Ada Yes" })
      .filter({ visible: true })
      .selectOption({ label: "Has ticket" });
    await expect(
      page
        .getByRole("combobox", { name: "Ticket for Ada Yes" })
        .filter({ visible: true }),
    ).toHaveValue("has_ticket");
    card = await thisYearCard(page);
    await expect(
      card
        .getByRole("list", { name: "Tickets" })
        .getByRole("listitem")
        .filter({ hasText: "no ticket yet" }),
    ).toHaveText(/0$/);

    // Ben reads his own WAP, issued; nothing on his page lets him change it.
    await as(page, "ben", "Ben Placed");
    await page.goto("/profile");
    const mine = page.getByLabel("Set by the captains");
    await expect(mine).toContainText("Issued");
    await expect(mine.locator("select, input")).toHaveCount(0);
  });

  test("a team lead sees who is coming, and nothing of the tickets", async ({
    page,
    request,
  }) => {
    await person(page, request, "lu", "Lu Lead");
    await seedTeam(request, "lu", "kitchen", true);
    await openApplications(page);

    // Present first, then the absences.
    await expect(says(page, "Ada Yes", "Coming")).toBeVisible();
    await expect(
      row(page, "Ada Yes").getByText("Not decided yet", { exact: true }),
    ).toBeVisible();
    await expect(says(page, "Ben Placed", "Maybe")).toBeVisible();
    await expect(
      row(page, "Ben Placed").getByText("Accepted", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "WAP" })).toHaveCount(
      0,
    );
    await expect(page.getByText("Needs DDT")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /for this year$/ }),
    ).toHaveCount(0);
  });

  test("a plain member gets a lock and no names", async ({ page, request }) => {
    await person(page, request, "mo", "Mo Member");
    await openApplications(page);

    await expect(
      page.getByText(/Applications are for captains and team leads/),
    ).toBeVisible();
    await expect(page.getByText("Ada Yes")).toHaveCount(0);
  });
});
