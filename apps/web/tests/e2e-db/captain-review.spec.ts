import {
  test,
  expect,
  type Browser,
  type APIRequestContext,
} from "@playwright/test";
import { login, redeemInviteAtGate, resetTestState } from "../e2e/_helpers";
import { signInCaptain } from "./_flows";

// A captain reviews applications in the roster, on a real database: the member
// panel decrypts the applicant's ID number, Approve lets them in, Reject with a
// reason holds the other at a screen that shows the reason, and the audit log
// records the decisions and the ID read. The store cannot run the member panel.

const CODE = "vet-me-please";

async function applicant(
  browser: Browser,
  request: APIRequestContext,
  input: { id: string; name: string; idNumber?: string },
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, {
    id: input.id,
    email: `${input.id}@example.com`,
    displayName: input.name,
  });
  await redeemInviteAtGate(page, CODE);
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  const res = await request.post("/api/test/complete-onboarding", {
    data: {
      authUserId: input.id,
      ...(input.idNumber ? { idType: "sa_id", idNumber: input.idNumber } : {}),
    },
  });
  expect(res.ok()).toBe(true);
  // Home tells an applicant they are waiting (every other page holds them at
  // /pending-approval).
  await page.goto("/");
  await expect(page.getByText("Waiting for a captain")).toBeVisible();
  return page;
}

test("approve one applicant, reject another with a reason", async ({
  browser,
  request,
}) => {
  await resetTestState(request);
  const captain = await signInCaptain(browser, request);
  await request.post("/api/test/seed-invite", {
    data: { code: CODE, requiresApproval: true },
  });

  const ada = await applicant(browser, request, {
    id: "db-ada",
    name: "Ada Applicant",
    idNumber: "9001015009087",
  });
  const bo = await applicant(browser, request, {
    id: "db-bo",
    name: "Bo Applicant",
  });

  // Approve Ada, reading her ID number on the way.
  await captain.goto("/captains/camp-management");
  await captain
    .getByRole("button", { name: "Open Ada Applicant's profile" })
    .click();
  const adaPanel = captain.getByRole("region", {
    name: "Ada Applicant profile",
  });
  await expect(adaPanel.getByText("9001015009087")).toBeVisible();
  await adaPanel.getByRole("button", { name: "Approve" }).click();
  await expect(adaPanel.getByText("Approved", { exact: true })).toHaveCount(2);
  await expect(adaPanel.getByText("Awaiting a captain's decision")).toHaveCount(
    0,
  );

  await ada.goto("/tools/forms");
  await expect(
    ada.getByRole("heading", { level: 1, name: "My forms" }),
  ).toBeVisible();

  // Reject Bo, telling him why.
  await captain.getByRole("button", { name: "Close profile" }).click();
  await captain
    .getByRole("button", { name: "Open Bo Applicant's profile" })
    .click();
  const boPanel = captain.getByRole("region", { name: "Bo Applicant profile" });
  await boPanel.getByRole("button", { name: "Reject" }).click();
  const dialog = captain.getByRole("dialog", { name: "Reject application" });
  await dialog
    .getByLabel("Reason for Bo Applicant (optional)")
    .fill("The camp is full this year.");
  await dialog.getByRole("button", { name: "Reject" }).click();
  await expect(boPanel.getByText("Rejected", { exact: true })).toHaveCount(2);

  await bo.goto("/");
  await expect(
    bo.getByRole("heading", { name: "Application not approved" }),
  ).toBeVisible();
  await expect(bo.getByText("The camp is full this year.")).toBeVisible();

  // The trail.
  await captain.goto("/captains/audit");
  const log = captain.getByRole("table", { name: "Audit log" });
  await expect(log.getByText("Decided an application")).toHaveCount(2);
  // `next dev` runs React effects twice, so opening the panel reads (and
  // audits) the ID twice here; production reads once. What matters: the read
  // is recorded, and only for the applicant who has an ID number.
  const idReads = log
    .getByRole("row")
    .filter({ hasText: "Viewed an ID number" });
  await expect(idReads.first()).toBeVisible();
  await expect(idReads.filter({ hasNotText: "Ada Applicant" })).toHaveCount(0);
});
