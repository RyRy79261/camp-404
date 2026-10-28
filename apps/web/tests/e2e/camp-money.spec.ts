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
} from "./_helpers";

// The camp fees sprint's Finance screens (test-mode, on the store's twins):
// a Finance lead adds a bill on Camp money, sees it date by date, marks it
// paid and finds it under Paid; on Who owes what they switch Collecting fees
// on and remind who still owes, and the dialog says who it reaches and who is
// left out for saying Not coming this year. The member reads their own
// reminder in the inbox. Amounts are made up.
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

async function heading(page: Page, name: string) {
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function financeLead(page: Page, request: APIRequestContext) {
  await approvedMember(page, request, "money-fin", "Fin Lead");
  await seedTeam(request, "money-fin", "finance", true);
  await seedParticipation(request, "money-fin", "accepted");
}

test.describe("camp money (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a Finance lead adds a bill, sees it date by date and marks it paid", async ({
    page,
    request,
  }) => {
    await financeLead(page, request);
    await page.goto("/captains/payments/camp-money");
    await heading(page, "Camp money");
    await expect(page.getByText("Nothing still to come.")).toBeVisible();

    await page.getByRole("button", { name: "Add a bill" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("What it is for").fill("Tent hire deposit");
    await dialog.getByLabel("Paid to").fill("Dimensions");
    await dialog.getByLabel("Amount (R)").fill("70000");
    await dialog.getByLabel("Due").fill("2030-12-01");
    await dialog.getByRole("button", { name: "Add bill" }).click();
    await expect(dialog).toHaveCount(0);

    const table = page
      .getByRole("table", { name: "Date by date" })
      .filter({ visible: true });
    const row = table.getByRole("row").filter({ hasText: "Tent hire deposit" });
    await expect(row).toContainText(/−R\s70\s000,00/);
    await expect(page.getByRole("group", { name: "Money left" })).toContainText(
      /−R\s70\s000,00/,
    );

    await row.getByRole("button", { name: "Mark paid" }).click();
    await expect(page.getByText("Tent hire deposit marked paid")).toBeVisible();
    await expect(page.getByText("Nothing still to come.")).toBeVisible();

    await page.getByRole("link", { name: /^Paid/ }).click();
    await expect(
      page
        .getByRole("table", { name: "Bills paid" })
        .filter({ visible: true })
        .getByText("Tent hire deposit"),
    ).toBeVisible();
  });

  test("Remind who still owes says who it reaches and who is left out", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "money-owes", "Lerato Owes");
    await seedParticipation(request, "money-owes", "applied");
    await page.goto("/dues");
    await heading(page, "My dues");
    await page.getByLabel("Or type it (R)").fill("7200");
    await page
      .getByRole("radio", {
        name: "Part by the end of November and the rest later",
      })
      .click();
    await page.getByRole("button", { name: "Save my pledge" }).click();
    await expect(page.getByTestId("my-pledge")).toBeVisible();

    await approvedMember(page, request, "money-gone", "Bongi Gone");
    await seedParticipation(request, "money-gone", "not_attending");
    await financeLead(page, request);

    await page.goto("/captains/payments/members");
    await heading(page, "Who owes what");
    const members = page
      .getByRole("table", { name: "Members' fees" })
      .filter({ visible: true });
    await expect(
      members.getByRole("row").filter({ hasText: "Lerato Owes" }),
    ).toContainText(/Part by end Nov/);

    // Off: the dialog says to switch it on, and sends nothing.
    await page.getByRole("button", { name: "Remind who still owes" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText("Switch on Collecting fees before you remind anyone."),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("switch", { name: "Collecting fees" }).click();
    await expect(page.getByText("Collecting fees is on")).toBeVisible();

    await page.getByRole("button", { name: "Remind who still owes" }).click();
    await expect(
      dialog.getByRole("heading", { name: "Remind 1 member who still owes?" }),
    ).toBeVisible();
    await expect(
      dialog.getByText(/Left out: \d+ who said Not coming this year\./),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Who?" }).click();
    await expect(dialog.getByText(/Bongi Gone/)).toBeVisible();
    await expect(
      dialog.getByRole("list", { name: "Who is reminded" }),
    ).toContainText(/Lerato Owes.*R\s3\s600,00 by 30 Nov/);
    await dialog.getByRole("button", { name: "Send 1 reminder" }).click();
    await expect(page.getByText("Reminded 1 member")).toBeVisible();

    // The member reads it in their own inbox: their next payment only.
    await login(page, { id: "money-owes", email: "money-owes@example.com" });
    await page.goto("/notifications");
    await expect(
      page.getByText(/Your camp fee: R\s3\s600,00 by 30 Nov/).first(),
    ).toBeVisible();
  });
});
