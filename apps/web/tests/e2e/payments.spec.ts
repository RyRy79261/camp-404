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
// A captain records two received payments and a pending one; there is no
// currency to pick. The ledger shows each amount, and "Dues paid" totals the
// rands that came in, with the promised rands on a line of their own. A member
// who opens the page sees the lock and no amounts. Amounts are made up.
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
    page.getByRole("heading", { level: 1, name: "Dues & payments" }),
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
  const member = page.locator("#payment-member");
  const value = await member
    .locator("option", { hasText: input.member })
    .getAttribute("value");
  await member.selectOption(value!);
  await page.getByLabel("Amount (R)").fill(input.amount);
  await page.locator("#payment-status").selectOption(input.status);
  await page.getByRole("button", { name: "Record payment" }).click();
  // The form clears once the payment is on file. The toast names its
  // reference; the one before it may still be up (toasts stay five seconds,
  // and nothing covers the Record button to make the next click wait), so the
  // newest is the last.
  await expect(page.getByLabel("Amount (R)")).toHaveValue("");
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

  const received = page.getByRole("status").filter({ hasText: /^Received:/ });
  const pending = page.getByRole("status").filter({ hasText: /^Pending:/ });
  // One rand total, and the promised rands apart until they land.
  await expect(received).toHaveText(/^Received: R\s17,34$/);
  await expect(pending).toHaveText(/^Pending: R\s7,00$/);
  await expect(
    page.getByRole("status").filter({ hasText: /members have paid/ }),
  ).toHaveText(/^2 of \d+ members have paid for this year\.$/);
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
      page.getByRole("status").filter({ hasText: /^Received:/ }),
    ).toHaveText(/^Received: R\s0,00$/);
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
      page.getByRole("heading", { level: 1, name: "Dues & payments" }),
    ).toBeVisible();
    await expectLedgerAndTotals(page);

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
    await expect(page.getByText(/Payments are captain-only/)).toBeVisible();
    await expect(page.getByText(/R\s(12,34|17,34|5,00|7,00)/)).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: /^Received:/ }),
    ).toHaveCount(0);
    await expect(page.locator("#payment-member")).toHaveCount(0);
  });
});
