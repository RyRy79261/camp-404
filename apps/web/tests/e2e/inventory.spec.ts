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

// The inventory (#246, redesign option A, test-mode). A Kitchen lead adds a
// cooler box (4, two members can book one). A plain member suggests the count
// is 3; a lead of Sound reads the item but may not decide it; the Kitchen
// lead sees the change as a before and after and approves it. Then two
// members book the box until it is full, and a third finds no Book button.
// Last, a lead lends boxes to another camp and marks one broken: both come
// off what can be booked, and the strike checklist lists the loan to print.

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

async function gearList(page: Page) {
  await page.goto("/inventory");
  await expect(
    page.getByRole("heading", { level: 1, name: "Inventory" }),
  ).toBeVisible();
}

async function openItem(page: Page, name: string) {
  await gearList(page);
  // The gear list's own link: it comes after the review list's (if any).
  // On a phone the whole row is the link, so its name runs on past the
  // item's ("Cooler box 4 boxes …").
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page
    .getByRole("link", { name: new RegExp(`^${escaped}( |$)`) })
    .filter({ visible: true })
    .last()
    .click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function addCooler(page: Page) {
  await gearList(page);
  await expect(page.getByText("No gear yet")).toBeVisible();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add an item" });
  await dialog.getByLabel("Name").fill("Cooler box");
  await dialog.getByLabel("Kind of gear").selectOption("cooling");
  await dialog.getByLabel("How many").fill("4");
  await dialog.getByLabel("Members who can book one").fill("2");
  await dialog.getByRole("button", { name: "Add item" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Cooler box" }),
  ).toBeVisible();
}

function facts(page: Page) {
  return page.getByRole("region", { name: "What we have" });
}

async function bookingsTab(page: Page) {
  await page.goto("/inventory/bookings");
  await expect(
    page.getByRole("heading", { level: 1, name: "Inventory" }),
  ).toBeVisible();
  await expect(
    page.getByText("A booking is one unit for the whole burn.").first(),
  ).toBeVisible();
}

test.describe("inventory (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a member suggests a count, a lead of another team can't decide it, the item's lead approves it", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "inv-lead", "Kim Kitchen");
    await seedTeam(request, "inv-lead", "kitchen", true);
    await addCooler(page);
    await expect(facts(page)).toContainText(/How many\s*4/);

    // A plain member reads it, may not change it, and suggests 3. The Add
    // button is not there for them at all.
    await approvedMember(page, request, "inv-member", "Max Member");
    await gearList(page);
    await expect(page.getByRole("link", { name: "Cooler box" })).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Add item", exact: true }),
    ).toHaveCount(0);
    await openItem(page, "Cooler box");
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await page.getByRole("button", { name: "Suggest a change" }).click();
    const dialog = page.getByRole("dialog", { name: "Suggest a change" });
    await dialog.getByLabel("How many").fill("3");
    await dialog.getByLabel("Note (optional)").fill("One lid is cracked");
    await dialog.getByRole("button", { name: "Send for review" }).click();
    await expect(page.getByText("Change sent for review")).toBeVisible();
    await expect(page.getByText("Waiting for review")).toBeVisible();
    await expect(facts(page)).toContainText(/How many\s*4/);

    // A lead of Sound stands on the team_lead rung and still may not decide.
    await approvedMember(page, request, "inv-sound", "Sam Sound");
    await seedTeam(request, "inv-sound", "sound", true);
    await gearList(page);
    await expect(
      page.getByRole("region", { name: /changes? to review/ }),
    ).toHaveCount(0);
    await openItem(page, "Cooler box");
    await expect(page.getByText("Waiting for review")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Approve/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);

    // The Kitchen lead sees only what changed, as a before and after, on the
    // gear list's review box, and approves it there; the count moves.
    await login(page, {
      id: "inv-lead",
      email: "inv-lead@example.com",
      displayName: "Kim Kitchen",
    });
    await gearList(page);
    // On a phone the review box is folded to one line under the search.
    const fold = page.locator("summary", { hasText: "1 change to review" });
    if (await fold.isVisible()) await fold.click();
    const review = page.getByRole("region", { name: "1 change to review" });
    await expect(review).toContainText("How many");
    await expect(review).toContainText("4");
    await expect(review).toContainText("3");
    await expect(review).not.toContainText("Condition");
    await review
      .getByRole("button", { name: "Approve the change to Cooler box" })
      .click();
    await expect(page.getByText("Change approved")).toBeVisible();
    await expect(review).toHaveCount(0);
    await openItem(page, "Cooler box");
    await expect(facts(page)).toContainText(/How many\s*3/);
    await expect(page.getByText("Waiting for review")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "History" })).toContainText(
      "Max Member's change approved by Kim Kitchen",
    );
  });

  test("members book a cooler box until it is full, and the next can't", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "book-lead", "Kim Kitchen");
    await seedTeam(request, "book-lead", "kitchen", true);
    await addCooler(page);

    for (const [id, name] of [
      ["book-a", "Ann"],
      ["book-b", "Ben"],
    ] as const) {
      await approvedMember(page, request, id, name);
      await bookingsTab(page);
      await page
        .getByRole("button", { name: "Book Cooler box" })
        .filter({ visible: true })
        .click();
      await expect(page.getByText("Booked Cooler box")).toBeVisible();
      await expect(
        page
          .getByRole("button", { name: "Cancel my booking of Cooler box" })
          .filter({ visible: true }),
      ).toBeVisible();
    }

    await approvedMember(page, request, "book-c", "Cat");
    await bookingsTab(page);
    await expect(
      page.getByText("Fully booked").filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Book Cooler box" }),
    ).toHaveCount(0);
    await openItem(page, "Cooler box");
    await expect(page.getByText("It's fully booked this year.")).toBeVisible();
    // A member sees how many, never who.
    await expect(page.getByText("2 booked by other members.")).toBeVisible();
    await expect(page.getByText("Ann")).toHaveCount(0);

    // The lead sees who booked it, and may cancel one after a question.
    await login(page, {
      id: "book-lead",
      email: "book-lead@example.com",
      displayName: "Kim Kitchen",
    });
    await openItem(page, "Cooler box");
    const bookings = page.getByRole("region", { name: "Bookings this year" });
    await expect(bookings).toContainText("Ann");
    await expect(bookings).toContainText("Ben");
    await bookings
      .getByRole("button", { name: "Cancel Ann's booking" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Cancel Ann's booking?" }),
    ).toBeVisible();
  });

  test("lent-out and broken units come off what can be booked, and the strike checklist lists the loan", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "lend-lead", "Kim Kitchen");
    await seedTeam(request, "lend-lead", "kitchen", true);
    await addCooler(page);

    // Lend 3 of the 4 to another camp: only 1 is left to book, not 2.
    await page.getByRole("button", { name: "Lend out", exact: true }).click();
    const lend = page.getByRole("dialog", { name: "Lend out" });
    await lend.getByLabel("How many").fill("3");
    await lend.getByLabel("Their camp").fill("Camp Sunshine Disco");
    await lend.getByLabel("Their site address").fill("7:30 & Binnekring");
    await lend.getByRole("button", { name: "Lend out" }).click();
    await expect(
      page.getByRole("region", { name: "Lent out this year" }),
    ).toContainText("3 to Camp Sunshine Disco");
    await expect(facts(page)).toContainText("Out with other camps");

    await approvedMember(page, request, "lend-member", "Max Member");
    await bookingsTab(page);
    await expect(
      page.getByText("3 lent out").filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByText("1 left").filter({ visible: true }),
    ).toBeVisible();

    // Every member reads Lent out, but only an editor marks a loan returned.
    await page.goto("/inventory/lent");
    await expect(
      page
        .getByText(/no internet at the burn\./i)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByText("Camp Sunshine Disco").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Mark / })).toHaveCount(0);

    // The A4 strike checklist names the loan, to tick on paper at strike.
    await page.goto("/print/inventory/strike");
    await expect(
      page.getByRole("heading", { name: "Strike checklist" }),
    ).toBeVisible();
    await expect(page.getByText("Camp Sunshine Disco")).toBeVisible();
    await expect(page.getByText("7:30 & Binnekring")).toBeVisible();

    // Marked broken, it can't be booked at all.
    await login(page, {
      id: "lend-lead",
      email: "lend-lead@example.com",
      displayName: "Kim Kitchen",
    });
    await openItem(page, "Cooler box");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const edit = page.getByRole("dialog", { name: /^Edit/ });
    await edit.getByLabel("Condition").selectOption("broken");
    await edit.getByRole("button", { name: /^Save/ }).click();
    await expect(
      page.getByText(
        "It's marked broken, so it can't be booked until it's fixed.",
      ),
    ).toBeVisible();

    await login(page, {
      id: "lend-member",
      email: "lend-member@example.com",
      displayName: "Max Member",
    });
    await bookingsTab(page);
    await expect(
      page.getByText("None free").filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Book Cooler box" }),
    ).toHaveCount(0);
  });
});
