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
  seedParticipation,
  seedTeam,
  setRank,
} from "./_helpers";

// Gear rental (#241, test-mode, on the store's twin). A captain lists a tent
// the camp has one of and a mattress only the supplier rents. A member orders
// a shared tent and two mattresses without picking a source; the captain picks
// camp stock for the tent, confirms, and the charge is on the member's dues.
// The friend in the tent reads the tent and its label and nothing else; a
// lead of another team and a Finance lead get a lock. A second member cannot
// be given the camp's one tent again. Prices are made up.
//
// Intl writes no-break spaces ("R 1 500,00"), so money is matched with \s.

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

// The toast that follows a save can say the same words as the page, and both
// are `role="status"`: the page's own elements are named by test id.
const SENT = "Sent. A captain will confirm it.";

async function heading(page: Page, name: string) {
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function asCaptain(page: Page, request: APIRequestContext) {
  await login(page, {
    id: "rent-cap",
    email: "god@example.com",
    displayName: "Cap Tain",
  });
  await page.goto("/");
  await completeOnboarding(request, "rent-cap");
  await setRank(request, "rent-cap", "captain");
}

async function captainListsGear(page: Page, request: APIRequestContext) {
  await asCaptain(page, request);
  await page.goto("/captains/gear-rental/catalogue");
  await heading(page, "Catalogue");
  const items = page.getByRole("list", { name: "Rental items" });

  // A tent: the supplier rents it, and the camp has one of its own.
  await page.getByLabel("Name").fill("2-person tent");
  await page.getByRole("checkbox", { name: /It.s a tent/ }).click();
  await page.getByLabel("Sleeps").fill("2");
  await page.getByLabel("Supplier price (R)").fill("250");
  await page
    .getByRole("checkbox", { name: /The camp has some of these/ })
    .click();
  await page.getByLabel("Camp stock price (R)").fill("100");
  await page.getByLabel("How many the camp has").fill("1");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(items.getByText("2-person tent")).toBeVisible();
  await expect(items.getByText(/the camp has 1$/)).toBeVisible();

  // A mattress: the supplier only.
  await page.getByLabel("Name").fill("Mattress");
  await page.getByLabel("Supplier price (R)").fill("80");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(items.getByText("Mattress")).toBeVisible();
  await expect(items.getByText("No camp stock")).toBeVisible();
}

/** The signed-in member asks for a tent (and mattresses) and sends it. */
async function orderGear(
  page: Page,
  options: { shareWith?: string; mattresses?: number } = {},
) {
  await page.goto("/gear");
  await heading(page, "My gear");
  const tent = page.getByRole("listitem", { name: "2-person tent" });
  await tent.getByRole("radio", { name: "I need one" }).click();
  if (options.shareWith) {
    await tent
      .getByLabel("Who shares it with you?")
      .selectOption({ label: options.shareWith });
    await expect(
      tent.getByRole("list", { name: "Sharing 2-person tent with" }),
    ).toContainText(options.shareWith);
  }
  if (options.mattresses) {
    const mattress = page.getByRole("listitem", { name: "Mattress" });
    await mattress.getByRole("radio", { name: "I need one" }).click();
    await mattress
      .getByLabel("How many")
      .selectOption(String(options.mattresses));
  }
}

async function openOrder(page: Page, member: string) {
  await page.goto("/captains/gear-rental");
  await heading(page, "Gear rental");
  await page
    .getByRole("link", { name: member })
    .filter({ visible: true })
    .click();
  await heading(page, member);
}

test.describe("gear rental (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a member orders a shared tent, a captain confirms it from camp stock, and the charge is on the member's dues", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "rent-member", "Dee Member");
    await seedParticipation(request, "rent-member", "accepted");
    await approvedMember(page, request, "rent-friend", "Fay Friend");
    await approvedMember(page, request, "rent-kit", "Kit Lead");
    await seedTeam(request, "rent-kit", "kitchen", true);
    await approvedMember(page, request, "rent-fin", "Fin Lead");
    await seedTeam(request, "rent-fin", "finance", true);
    await captainListsGear(page, request);

    // The member says what they need. No source to pick, and a price range.
    await login(page, { id: "rent-member", email: "rent-member@example.com" });
    await orderGear(page, { shareWith: "Fay Friend", mattresses: 2 });
    await expect(
      page.getByRole("radio", { name: /camp stock|supplier/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("status", { name: "What it may cost" }),
    ).toHaveText(/R\s260,00 to R\s410,00/);
    await page.getByRole("button", { name: "Send my order" }).click();
    await expect(page.getByTestId("order-state")).toHaveText(SENT);

    // The friend reads the tent they are in, and nothing else of the order.
    await login(page, { id: "rent-friend", email: "rent-friend@example.com" });
    await page.goto("/gear");
    await heading(page, "My gear");
    await expect(
      page.getByText("Dee Member put you in their tent."),
    ).toBeVisible();
    await expect(page.getByTestId("in-a-tent")).toHaveText(
      /in Dee Member.s tent\. You don.t need to order one yourself\./,
    );
    await expect(page.getByText("Not confirmed yet")).toBeVisible();
    await expect(page.getByRole("list", { name: "Your order" })).toHaveCount(0);

    // A lead of another team and a Finance lead: a lock, and no member named.
    for (const id of ["rent-kit", "rent-fin"]) {
      await login(page, { id, email: `${id}@example.com` });
      for (const path of [
        "/captains/gear-rental",
        "/captains/gear-rental/summary",
        "/captains/gear-rental/catalogue",
      ]) {
        await page.goto(path);
        await expect(
          page.getByText("Captains only", { exact: true }),
        ).toBeVisible();
        await expect(page.getByText("Dee Member")).toHaveCount(0);
        await expect(page.getByText("2-person tent")).toHaveCount(0);
      }
      await page.goto("/print/gear-rental?sheet=tents");
      await expect(
        page.getByText("Gear rental is for captains."),
      ).toBeVisible();
      await expect(page.getByText("Dee M.")).toHaveCount(0);
    }

    // The captain opens the order, picks camp stock for the tent, confirms.
    await asCaptain(page, request);
    await openOrder(page, "Dee Member");
    await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
    // The sharer has no place yet, and the captain is told.
    await expect(page.getByText("Not accepted yet")).toBeVisible();
    const tent = page.getByRole("listitem", { name: "2-person tent" });
    await expect(tent.getByText("1 left in camp stock.")).toBeVisible();
    await expect(page.getByRole("status", { name: "Order total" })).toHaveText(
      "Not yet",
    );
    await tent
      .getByRole("radio", { name: /Camp stock\s*R\s100,00 each/ })
      .click();
    // The mattress has one source, so it is already picked.
    await expect(page.getByRole("status", { name: "Order total" })).toHaveText(
      /R\s260,00/,
    );
    await page.getByRole("button", { name: "Confirm and charge" }).click();
    await expect(page.getByTestId("order-on-dues")).toContainText(
      "On their dues.",
    );
    await tent.getByLabel("Tent label").fill("T3");
    await tent.getByRole("button", { name: "Save label" }).click();
    await expect(page.getByText("Label saved")).toBeVisible();

    // The summary: one tent out of storage and none left, two mattresses to order.
    await page.goto("/captains/gear-rental/summary");
    await heading(page, "Summary");
    const totals = page.getByRole("table", { name: "Totals by item" });
    const tentRow = totals.getByRole("row", { name: /2-person tent/ });
    await expect(tentRow.getByRole("cell").nth(3)).toHaveText("1");
    await expect(tentRow.getByRole("cell").nth(4)).toHaveText("0 of 1");
    await expect(tentRow.getByRole("cell").nth(5)).toHaveText("0");
    const mattressRow = totals.getByRole("row", { name: /Mattress/ });
    await expect(mattressRow.getByRole("cell").nth(5)).toHaveText("2");
    await expect(
      page.getByRole("list", { name: "Tents" }).getByRole("listitem"),
    ).toContainText(["T3"]);

    // On paper: counts only for the supplier, and the tent list by label.
    await page.goto("/print/gear-rental");
    await expect(page.getByTestId("print-order-row")).toHaveText([
      /Mattress\s*2/,
    ]);
    await expect(page.getByTestId("print-storage-row")).toContainText([
      "2-person tent",
    ]);
    await expect(page.getByText("Dee")).toHaveCount(0);
    await page.goto("/print/gear-rental?sheet=tents");
    await expect(page.getByTestId("print-tent-row")).toHaveText([
      /T3.*2-person tent.*Dee M\., Fay F\./,
    ]);

    // The member owes it, and sees where it came from and the tent's label.
    await login(page, { id: "rent-member", email: "rent-member@example.com" });
    await page.goto("/dues");
    await heading(page, "My dues");
    await expect(page.getByText(/You owe R\s260,00\./)).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Charges" })
        .getByText("Gear rental: 1 × 2-person tent, 2 × Mattress"),
    ).toBeVisible();
    await page.goto("/gear");
    await heading(page, "My gear");
    await expect(page.getByTestId("order-state")).toHaveText(
      /^Confirmed\. It.s on your dues\.$/,
    );
    const order = page.getByRole("list", { name: "Your order" });
    await expect(order.getByText("From camp stock")).toBeVisible();
    await expect(order.getByText("Tent label: T3")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send my order" }),
    ).toHaveCount(0);

    // The friend sees the label too.
    await login(page, { id: "rent-friend", email: "rent-friend@example.com" });
    await page.goto("/gear");
    await heading(page, "My gear");
    await expect(
      page.getByRole("list", { name: "Your tent" }).getByText("T3"),
    ).toBeVisible();
  });

  test("the camp's one tent is not given out twice, and a reopened order comes off the dues", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "rent-one", "Ona First");
    await approvedMember(page, request, "rent-two", "Tim Second");
    await captainListsGear(page, request);
    for (const id of ["rent-one", "rent-two"]) {
      await login(page, { id, email: `${id}@example.com` });
      await orderGear(page);
      await page.getByRole("button", { name: "Send my order" }).click();
      await expect(page.getByTestId("order-state")).toHaveText(SENT);
    }

    await asCaptain(page, request);
    await openOrder(page, "Ona First");
    const tent = page.getByRole("listitem", { name: "2-person tent" });
    await tent.getByRole("radio", { name: /Camp stock/ }).click();
    await page.getByRole("button", { name: "Confirm and charge" }).click();
    await expect(page.getByTestId("order-on-dues")).toContainText(
      "On their dues.",
    );

    // The second order: camp stock is refused in a sentence, the supplier works.
    await openOrder(page, "Tim Second");
    await expect(tent.getByText("No camp stock left.")).toBeVisible();
    await tent.getByRole("radio", { name: /Camp stock/ }).click();
    await page.getByRole("button", { name: "Confirm and charge" }).click();
    await expect(
      page.getByText(
        "The camp has 1 of 2-person tent and none are left. Pick the supplier, or raise the count in the catalogue.",
      ),
    ).toBeVisible();
    await tent
      .getByRole("radio", { name: /Supplier\s*R\s250,00 each/ })
      .click();
    await page.getByRole("button", { name: "Confirm and charge" }).click();
    await expect(page.getByRole("status", { name: "Order total" })).toHaveText(
      /R\s250,00/,
    );
    await expect(page.getByTestId("order-on-dues")).toContainText(
      "On their dues.",
    );

    // Reopened: the charge comes off, and the member may change the order.
    await page.getByRole("button", { name: "Reopen" }).click();
    await page
      .getByRole("dialog", { name: "Reopen this order?" })
      .getByRole("button", { name: "Reopen" })
      .click();
    await expect(
      page.getByRole("button", { name: "Confirm and charge" }),
    ).toBeVisible();
    await login(page, { id: "rent-two", email: "rent-two@example.com" });
    await page.goto("/dues");
    await heading(page, "My dues");
    await expect(page.getByText("Nothing to pay yet.")).toBeVisible();
    await page.goto("/gear");
    await heading(page, "My gear");
    await page.getByRole("button", { name: "Change my order" }).click();
    await expect(
      page.getByRole("button", { name: "Send my order" }),
    ).toBeVisible();
  });
});
