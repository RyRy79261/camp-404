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
  setRank,
} from "./_helpers";

// The payments ledger, in rands only (test-mode, on the store's ledger twin).
// A captain records two payments in the bank and a promised one, from the
// "Record a payment" dialog; there is no currency to pick. The ledger shows
// each amount, and the year's figures total the rands in the bank, with the
// promised rands under "To check", which Who owes what's "To check" filter
// agrees with. A member who opens the page sees the lock, a way to their own
// dues, and no amounts. Amounts are made up.
//
// Intl writes no-break spaces ("R 12,34"), so money is matched with \s.
// The ledger draws a table from md up and a card list below it; both are in
// the DOM, so a row is looked for among the visible ones.

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

async function openPayments(page: Page) {
  await page.goto("/captains/payments");
  // Something PRESENT first, so no check below runs on an unpainted page.
  await expect(
    page.getByRole("heading", { level: 1, name: /^Payments$/ }),
  ).toBeVisible();
}

async function recordPayment(
  page: Page,
  input: {
    member: string;
    amount: string;
    status: "reconciled" | "pending";
  },
) {
  await page.getByRole("button", { name: "Record a payment" }).click();
  const dialog = page.getByRole("dialog", { name: "Record a payment" });
  const member = dialog.locator("#payment-member");
  const value = await member
    .locator("option", { hasText: input.member })
    .getAttribute("value");
  await member.selectOption(value!);
  await dialog.getByLabel("Amount (R)").fill(input.amount);
  await dialog.locator("#payment-status").selectOption(input.status);
  await dialog.getByRole("button", { name: "Record payment" }).click();
  // The dialog closes once the payment is on file. The toast names its
  // reference; the one before it may still be up (toasts stay five seconds),
  // so the newest is the last.
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/^Recorded C404-M\d{3}-/).last()).toBeVisible();
}

async function expectLedgerAndTotals(page: Page) {
  const ledger = page.getByRole("region", { name: /^Payments for/ });
  await expect(
    ledger.getByText(/^R\s12,34$/).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    ledger.getByText(/^R\s5,00$/).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    ledger.getByText(/^R\s7,00$/).filter({ visible: true }),
  ).toBeVisible();

  const inBank = page.getByRole("group", { name: "In the bank" });
  const toCheck = page.getByRole("group", { name: "To check" });
  // One rand total, and the promised rands apart until they land.
  await expect(inBank.getByText(/^R\s17,34$/)).toBeVisible();
  await expect(toCheck.getByText(/^R\s7,00$/)).toBeVisible();
  await expect(toCheck).toContainText(/R\s7,00 promised/);
  // Paid up counts members charged a fee; nobody is charged one here.
  await expect(page.getByRole("group", { name: "Paid up" })).toContainText(
    "Nobody is charged a fee yet",
  );
}

test.describe("payments ledger (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a captain records payments in rands, and the rands received are totalled", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "pay-rand", "Rand Payer");
    await approvedMember(page, request, "pay-second", "Second Payer");

    await login(page, {
      id: "pay-cap",
      email: "god@example.com",
      displayName: "Cap Tain",
    });
    await page.goto("/");
    await completeOnboarding(request, "pay-cap");
    await setRank(request, "pay-cap", "captain");

    await openPayments(page);
    await expect(page.getByText("No payments recorded yet.")).toBeVisible();
    await expect(
      page.getByRole("group", { name: "In the bank" }).getByText(/^R\s0,00$/),
    ).toBeVisible();
    // Money is in rands only: there is no currency to pick.
    await expect(page.locator("#payment-currency")).toHaveCount(0);

    await recordPayment(page, {
      member: "Rand Payer",
      amount: "12,34",
      status: "reconciled",
    });
    await recordPayment(page, {
      member: "Second Payer",
      amount: "5",
      status: "reconciled",
    });
    await recordPayment(page, {
      member: "Second Payer",
      amount: "7",
      status: "pending",
    });

    await expectLedgerAndTotals(page);

    // Nothing was only on screen: a reload reads the same ledger back.
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: /^Payments$/ }),
    ).toBeVisible();
    await expectLedgerAndTotals(page);

    // Who owes what agrees: the promised payment is something to check.
    await page.goto("/captains/payments/members?show=check");
    await expect(
      page.getByRole("heading", { level: 1, name: "Who owes what" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("link", { name: "Second Payer" })
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Promised", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Rand Payer" }).filter({ visible: true }),
    ).toHaveCount(0);

    // The Overview's "Dues paid" card reads the same ledger.
    await page.goto("/captains/overview");
    const dues = page
      .getByRole("region", { name: "Camp at a glance" })
      .getByRole("link", { name: /Dues paid/ });
    // Only the rands that came in: the pending R 7,00 is not in the total.
    await expect(dues).toContainText(/approved · R\s17,34/);

    // A member opening the page gets the lock, and none of the money.
    await login(page, { id: "pay-rand", email: "pay-rand@example.com" });
    await openPayments(page);
    await expect(
      page.getByText(
        /Only captains and the Finance team see the camp's payments/,
      ),
    ).toBeVisible();
    await expect(page.getByText(/R\s(12,34|17,34|5,00|7,00)/)).toHaveCount(0);
    await expect(page.getByRole("group", { name: "In the bank" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Record a payment" }),
    ).toHaveCount(0);
    // What they almost always want is their own dues: the lock points there.
    await page.getByRole("link", { name: "Go to My dues" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "My dues" }),
    ).toBeVisible();
  });
});
