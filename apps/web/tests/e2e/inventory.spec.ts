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

// The inventory (#246, test-mode). A Kitchen lead adds a cooler box (4, two
// bookings a year). A plain member suggests the count is 3; a lead of Sound
// reads the item but may not decide it; the Kitchen lead approves and the
// count reads 3. Then two members book the box until it is full, and a third
// finds it fully booked with Book disabled.

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

async function openItem(page: Page, name: string) {
  await page.goto("/inventory");
  await expect(
    page.getByRole("heading", { level: 1, name: "Inventory" }),
  ).toBeVisible();
  // The gear list's own link, not the review list's above it.
  await page
    .getByRole("region", { name: "Cooler boxes and fridges" })
    .getByRole("link", { name })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function addCooler(page: Page) {
  await page.goto("/inventory");
  await expect(page.getByText("No gear yet")).toBeVisible();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add an item" });
  await dialog.getByLabel("Name").fill("Cooler box");
  await dialog.getByLabel("Kind of gear").selectOption("cooling");
  await dialog.getByLabel("How many").fill("4");
  await dialog.getByLabel("Bookings a year").fill("2");
  await dialog.getByRole("button", { name: "Add item" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Cooler box" }),
  ).toBeVisible();
}

function facts(page: Page) {
  return page.getByRole("region", { name: "What we have" });
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
    await expect(facts(page)).toContainText("4");

    // A plain member reads it, may not change it, and suggests 3.
    await approvedMember(page, request, "inv-member", "Max Member");
    await openItem(page, "Cooler box");
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await page.getByRole("button", { name: "Suggest a change" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Suggest a change to Cooler box",
    });
    await dialog.getByLabel("How many").fill("3");
    await dialog.getByLabel("Note (optional)").fill("One lid is cracked");
    await dialog.getByRole("button", { name: "Send for review" }).click();
    await expect(page.getByText("Change sent for review")).toBeVisible();
    await expect(page.getByText("Waiting for review")).toBeVisible();
    await expect(facts(page)).toContainText("4");

    // A lead of Sound stands on the team_lead rung and still may not decide.
    await approvedMember(page, request, "inv-sound", "Sam Sound");
    await seedTeam(request, "inv-sound", "sound", true);
    await openItem(page, "Cooler box");
    await expect(page.getByText("Waiting for review")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Approve/ })).toHaveCount(0);

    // The Kitchen lead approves it, and the count moves.
    await login(page, {
      id: "inv-lead",
      email: "inv-lead@example.com",
      displayName: "Kim Kitchen",
    });
    await openItem(page, "Cooler box");
    await page.getByRole("button", { name: "Approve Cooler box: 3" }).click();
    await expect(page.getByText("Change approved")).toBeVisible();
    await expect(page.getByText("Waiting for review")).toHaveCount(0);
    await expect(facts(page)).toContainText("3");
    await expect(
      page.getByRole("region", { name: "Change log" }),
    ).toContainText("Max Member said 3");
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
      await page.goto("/inventory/bookings");
      await expect(
        page.getByRole("heading", { level: 1, name: "Bookings" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Book Cooler box" })
        .filter({ visible: true })
        .click();
      await expect(page.getByText("Booked Cooler box")).toBeVisible();
      await expect(
        page.getByText("Booked by you").filter({ visible: true }),
      ).toBeVisible();
    }

    await approvedMember(page, request, "book-c", "Cat");
    await page.goto("/inventory/bookings");
    await expect(
      page.getByRole("heading", { level: 1, name: "Bookings" }),
    ).toBeVisible();
    await expect(
      page.getByText("Fully booked").filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("button", { name: "Book Cooler box" })
        .filter({ visible: true }),
    ).toBeDisabled();
    await openItem(page, "Cooler box");
    await expect(page.getByText("It's fully booked this year.")).toBeVisible();
    // A member sees how many, never who.
    await expect(page.getByText("Ann")).toHaveCount(0);

    // The lead sees who booked it.
    await login(page, {
      id: "book-lead",
      email: "book-lead@example.com",
      displayName: "Kim Kitchen",
    });
    await openItem(page, "Cooler box");
    const bookings = page.getByRole("region", { name: "Bookings this year" });
    await expect(bookings).toContainText("Ann");
    await expect(bookings).toContainText("Ben");
  });
});
