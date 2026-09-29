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

// Dues (#240, test-mode, on the store's twin). A captain sets a fee tier; a
// member with a place pledges it and owes it; they send in a proof of payment,
// which stays "being checked" until a Finance lead marks it received, and the
// balance drops to paid up. The proof opens for its member and the Finance
// team only: a lead of another team is refused the file and the Finance tools
// both. A Finance lead reads a bank statement file and records the line that
// names a member. Amounts are made up.
//
// Intl writes no-break spaces ("R 1 500,00"), so money is matched with \s.

const PDF = Buffer.from("%PDF-1.4\n% test proof\n");

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

async function heading(page: Page, name: string) {
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function captainAddsTier(page: Page, request: APIRequestContext) {
  await login(page, {
    id: "dues-cap",
    email: "god@example.com",
    displayName: "Cap Tain",
  });
  await page.goto("/");
  await completeOnboarding(request, "dues-cap");
  await setRank(request, "dues-cap", "captain");
  await page.goto("/captains/payments/settings");
  await heading(page, "Fees and dates");
  await page.getByLabel("Name").fill("Base");
  await page.getByLabel("Amount (R)").fill("1500");
  await page.getByRole("button", { name: "Add tier" }).click();
  await expect(
    page.getByRole("list", { name: "Fee tiers" }).getByText("Base"),
  ).toBeVisible();
}

async function memberPledges(page: Page) {
  await login(page, { id: "dues-member", email: "dues-member@example.com" });
  await page.goto("/dues");
  await heading(page, "My dues");
  await expect(page.getByText("Nothing to pay yet.")).toBeVisible();
  await page.getByRole("radio", { name: /Base: R\s1\s500,00/ }).click();
  await page.getByRole("button", { name: "Save my pledge" }).click();
  await expect(page.getByText("You owe R 1 500,00.")).toBeVisible();
}

test.describe("dues (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a member pledges, sends a proof, a Finance lead marks it received, and the balance drops", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "dues-member", "Dee Member");
    await seedParticipation(request, "dues-member", "accepted");
    await approvedMember(page, request, "dues-fin", "Fin Lead");
    await seedTeam(request, "dues-fin", "finance", true);
    await approvedMember(page, request, "dues-kit", "Kit Lead");
    await seedTeam(request, "dues-kit", "kitchen", true);
    await captainAddsTier(page, request);

    // The member pledges the tier; with a place already, it is their fee.
    await memberPledges(page);

    // They tell the Finance team they paid, with a PDF.
    await page.getByLabel("Amount (R)").fill("1500");
    await page.getByLabel("Proof of payment").setInputFiles({
      name: "proof.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });
    await page.getByRole("button", { name: "Send it" }).click();
    await expect(page.getByText(/^Sent as C404-M\d{3}-/)).toBeVisible();
    const payments = page.getByRole("list", { name: "Your payments" });
    await expect(payments.getByText("Being checked")).toBeVisible();
    // Not counted until it is seen in the bank.
    await expect(page.getByText("You owe R 1 500,00.")).toBeVisible();
    const proofHref = await payments
      .getByRole("link", { name: "Your proof" })
      .getAttribute("href");
    expect(proofHref).toMatch(/^\/api\/payment-proof\//);
    expect((await page.request.get(proofHref!)).status()).toBe(200);

    // A lead of another team: no file, and a lock on the Finance tools.
    await login(page, { id: "dues-kit", email: "dues-kit@example.com" });
    expect((await page.request.get(proofHref!)).status()).toBe(403);
    await page.goto("/captains/payments/members");
    await heading(page, "Who owes what");
    await expect(
      page.getByText("Captains and Finance leads", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Dee Member")).toHaveCount(0);

    // The Finance lead finds it to check, and marks it received.
    await login(page, { id: "dues-fin", email: "dues-fin@example.com" });
    expect((await page.request.get(proofHref!)).status()).toBe(200);
    await page.goto("/captains/payments/members?show=check");
    await heading(page, "Who owes what");
    const row = page
      .getByRole("link", { name: "Dee Member" })
      .filter({ visible: true });
    await expect(row).toBeVisible();
    await row.click();
    await heading(page, "Dee Member");
    await expect(
      page.getByRole("status").filter({ hasText: /^Owes R\s1\s500,00/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Mark received" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /^Paid up/ }),
    ).toBeVisible();

    // And the member reads it back.
    await login(page, { id: "dues-member", email: "dues-member@example.com" });
    await page.goto("/dues");
    await heading(page, "My dues");
    await expect(page.getByText("You're paid up.")).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Your payments" }).getByText("Received"),
    ).toBeVisible();
    // A member reads only their own: the Finance tools stay locked.
    await page.goto("/captains/payments/members");
    await expect(
      page.getByText("Captains and Finance leads", { exact: true }),
    ).toBeVisible();
  });

  test("a Finance lead reads a bank statement and records the line that names a member", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "dues-member", "Dee Member");
    await seedParticipation(request, "dues-member", "accepted");
    await approvedMember(page, request, "dues-fin", "Fin Lead");
    await seedTeam(request, "dues-fin", "finance", true);
    await captainAddsTier(page, request);
    await memberPledges(page);
    const reference = (
      await page
        .getByText(/^C404-M\d{3}$/)
        .first()
        .textContent()
    )?.trim();
    expect(reference).toMatch(/^C404-M\d{3}$/);

    await login(page, { id: "dues-fin", email: "dues-fin@example.com" });
    await page.goto("/captains/payments/import");
    await heading(page, "Bank statement");
    const csv = [
      "Account,Cheque",
      "",
      "Date,Description,Amount,Balance",
      `15/01/2027,EFT ${reference} dues,1500.00,3000.00`,
      "16/01/2027,Card purchase,-99.00,2901.00",
    ].join("\n");
    await page.getByLabel("Statement file").setInputFiles({
      name: "statement.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await page.getByRole("button", { name: "Read the statement" }).click();
    await expect(
      page.getByText(/1 payment, 1 matched to a member by reference\./),
    ).toBeVisible();
    const lines = page.getByRole("list", { name: "Statement payments" });
    await expect(
      lines.getByRole("combobox", { name: /Member for the payment/ }),
    ).toHaveValue(/.+/);
    await lines.getByRole("button", { name: "Record" }).click();
    await expect(lines.getByText(/^Recorded as C404-M\d{3}-/)).toBeVisible();

    // The member's dues read it back: paid up.
    await page.goto("/captains/payments/members?show=all");
    await heading(page, "Who owes what");
    await page
      .getByRole("link", { name: "Dee Member" })
      .filter({ visible: true })
      .click();
    await heading(page, "Dee Member");
    await expect(
      page.getByRole("status").filter({ hasText: /^Paid up/ }),
    ).toBeVisible();
    await expect(page.getByText("From the bank statement")).toBeVisible();
  });
});
