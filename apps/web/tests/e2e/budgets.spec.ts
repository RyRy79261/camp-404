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

// Team budgets and claims (#242, test-mode, on the store's twin). A Finance
// lead sets the Kitchen's budget; a Kitchen member claims money back with a
// receipt; every member reads the Kitchen's totals and nothing more; a lead
// of ANOTHER team is refused the claim, its receipt and the Finance tools; the
// Kitchen's own lead says yes but never opens the receipt; the Finance lead
// reads the receipt and the bank details and marks it paid; the member sees
// it paid and the budget shows it spent. Amounts are made up.
//
// Intl writes no-break spaces ("R 1 000,00"), so money is matched with \s.

const PDF = Buffer.from("%PDF-1.4\n% test receipt\n");

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

async function as(page: Page, id: string) {
  await login(page, { id, email: `${id}@example.com` });
}

async function heading(page: Page, name: string) {
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function camp(page: Page, request: APIRequestContext) {
  await approvedMember(page, request, "bud-member", "Mem Ber");
  await seedTeam(request, "bud-member", "kitchen", false);
  await approvedMember(page, request, "bud-kit", "Kit Lead");
  await seedTeam(request, "bud-kit", "kitchen", true);
  await approvedMember(page, request, "bud-pow", "Pow Lead");
  await seedTeam(request, "bud-pow", "power_and_lighting", true);
  await approvedMember(page, request, "bud-fin", "Fin Lead");
  await seedTeam(request, "bud-fin", "finance", true);
}

async function financeSetsKitchenBudget(page: Page) {
  await as(page, "bud-fin");
  await page.goto("/captains/payments/budgets");
  await heading(page, "Budgets");
  const kitchen = page.getByRole("listitem", { name: "Kitchen" });
  await kitchen.getByRole("button", { name: "Edit Kitchen's budget" }).click();
  await kitchen.getByLabel("Kitchen budget (R)").fill("1000");
  await kitchen.getByRole("button", { name: "Save" }).click();
  await expect(kitchen.getByText(/^R\s1\s000,00$/)).toBeVisible();
}

async function memberClaims(page: Page) {
  await as(page, "bud-member");
  await page.goto("/claims");
  await heading(page, "My claims");
  await expect(page.getByLabel("Team", { exact: true })).toHaveValue("kitchen");
  await page.getByLabel("What you bought").fill("Two gas bottle refills");
  await page.getByLabel("Amount (R)").fill("450");
  await page.getByLabel("Receipts").setInputFiles({
    name: "receipt.pdf",
    mimeType: "application/pdf",
    buffer: PDF,
  });
  await page.getByLabel("Bank details").fill("Mem Ber, FNB 62000000000, 250655");
  await page.getByRole("button", { name: "Send my claim" }).click();
  const mine = page.getByRole("list", { name: "Your claims" });
  await expect(mine.getByText("Waiting for the team")).toBeVisible();
  const receipt = await mine
    .getByRole("link", { name: "Receipt 1" })
    .getAttribute("href");
  expect(receipt).toMatch(/^\/api\/claim-receipt\//);
  expect((await page.request.get(receipt!)).status()).toBe(200);
  return receipt!;
}

test.describe("budgets and claims (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a claim goes from the member, to its team's lead, to the Finance team, and the budget shows it", async ({
    page,
    request,
  }) => {
    await camp(page, request);
    await financeSetsKitchenBudget(page);
    const receipt = await memberClaims(page);

    // Any member reads the Kitchen's totals, and nothing more.
    await page.goto("/teams/kitchen");
    await heading(page, "Kitchen");
    await expect(page.getByTestId("team-budget")).toHaveText(
      /R\s0,00 of R\s1\s000,00 spent/,
    );
    await expect(page.getByText(/1 claim waiting for a yes/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Claims to approve" }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Set budgets" })).toHaveCount(
      0,
    );
    // A plain member may only read: the approvals and the Finance tools lock.
    await page.goto("/captains/claims");
    await heading(page, "Claims to approve");
    await expect(
      page.getByText("Team leads and captains", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Two gas bottle refills")).toHaveCount(0);
    await page.goto("/captains/payments/budgets");
    await heading(page, "Budgets");
    await expect(
      page.getByText("Captains and Finance leads", { exact: true }),
    ).toBeVisible();

    // A lead of ANOTHER team: none of the Kitchen's claims, no receipt, and
    // the Finance tools locked.
    await as(page, "bud-pow");
    await page.goto("/captains/claims");
    await heading(page, "Claims to approve");
    await expect(
      page.getByText("Nothing is waiting for Power and Lighting."),
    ).toBeVisible();
    await expect(page.getByText("Two gas bottle refills")).toHaveCount(0);
    expect((await page.request.get(receipt)).status()).toBe(403);
    await page.goto("/captains/payments/claims");
    await heading(page, "Claims");
    await expect(
      page.getByText("Captains and Finance leads", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Two gas bottle refills")).toHaveCount(0);

    // The Kitchen's own lead says yes, and still never opens the receipt.
    await as(page, "bud-kit");
    expect((await page.request.get(receipt)).status()).toBe(403);
    await page.goto("/teams/kitchen");
    await heading(page, "Kitchen");
    await page.getByRole("link", { name: "Claims to approve" }).click();
    await heading(page, "Claims to approve");
    const waiting = page.getByRole("list", { name: "Claims waiting" });
    await expect(waiting.getByText("Two gas bottle refills")).toBeVisible();
    await expect(waiting.getByRole("link", { name: /Receipt/ })).toHaveCount(0);
    await waiting.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByText("Nothing is waiting for Kitchen.")).toBeVisible();

    // The Finance lead reads the receipt and the bank details, and pays.
    await as(page, "bud-fin");
    expect((await page.request.get(receipt)).status()).toBe(200);
    await page.goto("/captains/payments/claims");
    await heading(page, "Claims");
    const toPay = page.getByRole("list", { name: "Claims to pay" });
    await expect(toPay.getByText("Two gas bottle refills")).toBeVisible();
    await expect(toPay.getByText(/approved by Kit Lead/)).toBeVisible();
    await toPay.getByRole("button", { name: "Show bank details" }).click();
    await expect(
      toPay.getByLabel("Mem Ber's bank details"),
    ).toHaveText("Mem Ber, FNB 62000000000, 250655");
    await toPay.getByRole("button", { name: "Mark paid" }).click();
    await expect(page.getByText("Nothing to pay.")).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Claims done" })
        .getByText("Paid", { exact: true }),
    ).toBeVisible();

    // The member sees it paid, and the Kitchen's budget shows it spent.
    await as(page, "bud-member");
    await page.goto("/claims");
    await heading(page, "My claims");
    await expect(
      page
        .getByRole("list", { name: "Your claims" })
        .getByText("Paid", { exact: true }),
    ).toBeVisible();
    await page.goto("/teams/kitchen");
    await heading(page, "Kitchen");
    await expect(page.getByTestId("team-budget")).toHaveText(
      /R\s450,00 of R\s1\s000,00 spent/,
    );
    await expect(page.getByText(/R\s550,00 left/)).toBeVisible();
  });

  test("a claim with no receipt is refused, on the form and at the upload", async ({
    page,
    request,
  }) => {
    await camp(page, request);
    await as(page, "bud-member");
    await page.goto("/claims");
    await heading(page, "My claims");
    await page.getByLabel("What you bought").fill("Ice");
    await page.getByLabel("Amount (R)").fill("80");
    await page.getByLabel("Bank details").fill("FNB 1");
    await page.getByRole("button", { name: "Send my claim" }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Add at least one receipt: a photo or a PDF." }),
    ).toBeVisible();
    // The upload itself refuses it too, whatever the page does.
    const res = await page.request.post("/api/uploads/claim", {
      multipart: {
        team: "kitchen",
        description: "Ice",
        amountCents: "8000",
        spentOn: "2027-03-02",
        accountType: "sa",
        accountDetails: "FNB 1",
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe(
      "Add at least one receipt: a photo or a PDF.",
    );
    await expect(
      page.getByText("You haven’t claimed anything yet."),
    ).toBeVisible();
  });
});
