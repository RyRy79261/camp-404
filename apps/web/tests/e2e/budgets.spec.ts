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
// The lists are ResponsiveDataTables: a table in a wide window, cards in a
// narrow one, and CSS hides the other; `shown` finds whichever is on screen
// (getByRole skips the hidden one).

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

/** The table or the cards named `name`, whichever is on screen. */
function shown(page: Page, name: string) {
  return page
    .getByRole("table", { name })
    .or(page.getByRole("list", { name, exact: true }));
}

/** A table row or a card in `list` that mentions `text`. */
function rowWith(list: ReturnType<typeof shown>, text: string | RegExp) {
  return list
    .getByRole("row")
    .or(list.getByRole("listitem"))
    .filter({ hasText: text });
}

async function financeSetsKitchenBudget(page: Page) {
  await as(page, "bud-fin");
  await page.goto("/captains/payments/budgets");
  await heading(page, "Budgets");
  const kitchen = rowWith(shown(page, "Team budgets"), "Kitchen");
  await kitchen.getByRole("button", { name: "Edit Kitchen's budget" }).click();
  const dialog = page.getByRole("dialog", { name: "Kitchen’s budget" });
  await dialog.getByLabel("Kitchen budget (R)").fill("1000");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(kitchen.getByText(/^R\s1\s000,00$/).first()).toBeVisible();
}

async function memberClaims(page: Page) {
  await as(page, "bud-member");
  await page.goto("/claims");
  await heading(page, "My claims");
  await page.getByRole("button", { name: "Claim money back" }).click();
  const form = page.getByRole("dialog", { name: "Claim money back" });
  await expect(form.getByRole("combobox", { name: "Team" })).toHaveText(
    "Kitchen",
  );
  await form.getByLabel("What you bought").fill("Two gas bottle refills");
  await form.getByLabel("Amount (R)").fill("450");
  await form.getByLabel("Receipts").setInputFiles({
    name: "receipt.pdf",
    mimeType: "application/pdf",
    buffer: PDF,
  });
  await expect(
    form.getByRole("list", { name: "Chosen receipts" }),
  ).toContainText("receipt.pdf");
  await form
    .getByLabel("Bank details")
    .fill("Mem Ber, FNB 62000000000, 250655");
  await form.getByRole("button", { name: "Send my claim" }).click();
  await expect(form).toHaveCount(0);
  const mine = shown(page, "Your claims");
  await expect(mine.getByText("Waiting for the team")).toBeVisible();
  const receipt = await mine
    .getByRole("link", { name: "Receipt 1 (PDF)" })
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
    await expect(page.getByTestId("budget-stats")).toHaveText(
      /Budget\s*R\s1\s000,00\s*Spent.*R\s0,00\s*Left\s*R\s1\s000,00\s*Waiting\s*R\s450,00\s*1 claim/,
    );
    await expect(
      page.getByRole("link", { name: /Claims to approve/ }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Set budgets" })).toHaveCount(
      0,
    );
    // A plain member may only read: the approvals lock, and every team's
    // budget reads as figures with no pencil and no Finance tabs.
    await page.goto("/captains/claims");
    await heading(page, "Claims to approve");
    await expect(
      page.getByText("Team leads and captains", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Two gas bottle refills")).toHaveCount(0);
    await page.goto("/teams/kitchen");
    await heading(page, "Kitchen");
    await page.getByRole("link", { name: "Every team's budget" }).click();
    await heading(page, "Budgets");
    await expect(page).toHaveURL(/\/teams\/budgets$/);
    const budgets = shown(page, "Team budgets");
    await expect(
      rowWith(budgets, "Kitchen")
        .getByText(/^R\s1\s000,00$/)
        .first(),
    ).toBeVisible();
    await expect(
      page.getByText("Captains and Finance leads set the budgets."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Edit .*'s budget/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Payments pages" }),
    ).toHaveCount(0);
    // The Finance team's own Budgets tab stays theirs.
    await page.goto("/captains/payments/budgets");
    await heading(page, "Budgets");
    await expect(
      page.getByText(/^Setting budgets is for captains and Finance leads\./),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Edit .*'s budget/ }),
    ).toHaveCount(0);

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
    await page.getByRole("link", { name: "Claims to approve (1)" }).click();
    await heading(page, "Claims to approve");
    const waiting = shown(page, "Claims waiting for Kitchen");
    await expect(waiting.getByText("Two gas bottle refills")).toBeVisible();
    await expect(waiting.getByRole("link", { name: /Receipt/ })).toHaveCount(0);
    await waiting.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(
      page.getByText("Nothing is waiting for Kitchen."),
    ).toBeVisible();

    // The Finance lead reads the receipt and the bank details, and pays.
    await as(page, "bud-fin");
    expect((await page.request.get(receipt)).status()).toBe(200);
    await page.goto("/captains/payments/claims");
    await heading(page, "Claims");
    const toPay = shown(page, "Claims to pay");
    await expect(toPay.getByText("Two gas bottle refills")).toBeVisible();
    await expect(toPay.getByText(/approved by Kit Lead/)).toBeVisible();
    // The bank details open in their own column: Mark paid stays put.
    const markPaid = toPay.getByRole("button", { name: "Mark paid" });
    const before = await markPaid.boundingBox();
    await toPay
      .getByRole("button", { name: "Show Mem Ber's bank details" })
      .click();
    await expect(
      toPay.getByLabel("Mem Ber's bank details", { exact: true }),
    ).toContainText("Mem Ber, FNB 62000000000, 250655");
    await expect(markPaid).toBeVisible();
    const after = await markPaid.boundingBox();
    expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThan(2);
    await markPaid.click();
    await expect(page.getByText("Nothing to pay.")).toBeVisible();
    await expect(
      shown(page, "Claims paid").getByText("Two gas bottle refills"),
    ).toBeVisible();

    // The member sees it paid, and the Kitchen's budget shows it spent.
    await as(page, "bud-member");
    await page.goto("/claims");
    await heading(page, "My claims");
    await expect(
      shown(page, "Your claims").getByText("Paid", { exact: true }),
    ).toBeVisible();
    await page.goto("/teams/kitchen");
    await heading(page, "Kitchen");
    await expect(page.getByTestId("budget-stats")).toHaveText(
      /Budget\s*R\s1\s000,00\s*Spent.*R\s450,00\s*Left\s*R\s550,00/,
    );
  });

  test("a claim with no receipt is refused, on the form and at the upload", async ({
    page,
    request,
  }) => {
    await camp(page, request);
    await as(page, "bud-member");
    await page.goto("/claims");
    await heading(page, "My claims");
    await page.getByRole("button", { name: "Claim money back" }).click();
    const form = page.getByRole("dialog", { name: "Claim money back" });
    await form.getByLabel("What you bought").fill("Ice");
    await form.getByLabel("Amount (R)").fill("80");
    await form.getByLabel("Bank details").fill("FNB 1");
    await form.getByRole("button", { name: "Send my claim" }).click();
    // The error sits under the receipts, the field it names.
    await expect(form.locator("#claim-receipts-error")).toHaveText(
      "Add at least one receipt: a photo or a PDF.",
    );
    await page.keyboard.press("Escape");
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
