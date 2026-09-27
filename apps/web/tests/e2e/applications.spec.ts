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
// profile; a captain gives places and records early entry on Applications and
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

/** The overview's "This year" card, once painted. */
async function thisYearCard(page: Page) {
  await page.goto("/captains/overview");
  const card = page.getByRole("article", { name: "This year" });
  await expect(card).toBeVisible();
  return card;
}

test.describe("applications: tickets and early entry", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetTestState(request);
    // Ada said Yes; Ben already has a place.
    await person(page, request, "ada", "Ada Yes");
    await seedParticipation(request, "ada", "applied");
    await person(page, request, "ben", "Ben Placed");
    await seedParticipation(request, "ben", "accepted");
    await person(page, request, "cy", "Cy Captain", "captain");
  });

  test("a member says they have a ticket, and a captain gives a place and early entry that the overview counts", async ({
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
    // The captain-only passes are not on his page.
    await expect(page.getByText(/early entry/i)).toHaveCount(0);

    // The captain sees it, accepts Ada and issues Ben's early entry.
    await as(page, "cy", "Cy Captain");
    await openApplications(page);
    await expect(
      row(page, "Ben Placed").getByText("Has ticket", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Accept Ada Yes for this year" })
      .filter({ visible: true })
      .click();
    await expect(
      row(page, "Ada Yes").getByText("Accepted", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Early entry for Ben Placed" })
      .filter({ visible: true })
      .selectOption({ label: "Issued" });
    await expect(
      page
        .getByRole("combobox", { name: "Early entry for Ben Placed" })
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
      after.getByRole("listitem").filter({ hasText: "Early entry" }),
    ).toHaveText(/1$/);

    // And the reload keeps it.
    await openApplications(page);
    await expect(
      page
        .getByRole("combobox", { name: "Early entry for Ben Placed" })
        .filter({ visible: true }),
    ).toHaveValue("issued");
  });

  test("a team lead sees who is coming, and nothing of the tickets", async ({
    page,
    request,
  }) => {
    await person(page, request, "lu", "Lu Lead");
    await seedTeam(request, "lu", "kitchen", true);
    await openApplications(page);

    // Present first, then the absences.
    await expect(
      row(page, "Ada Yes").getByText("Coming", { exact: true }),
    ).toBeVisible();
    await expect(
      row(page, "Ben Placed").getByText("Accepted", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(
      page.getByRole("columnheader", { name: "Early entry" }),
    ).toHaveCount(0);
    await expect(page.getByText("Needs directed")).toHaveCount(0);
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
