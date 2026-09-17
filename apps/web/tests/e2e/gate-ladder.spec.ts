import { test, expect, type Page } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
} from "./_helpers";

// The member ladder (lib/member-gate.ts) holds on every member page, not only
// home: invite, then onboarding, then approval. Each rung is checked on each
// page, and each check proves the page reached rendered its heading.
//
// /notifications is held at the invite rung only: an applicant still reads
// their inbox (owner's call PENDING-GATES, 2026-09-16), where the approval
// notice and any questionnaire they must answer arrive.

const LADDER_PAGES = [
  "/tools/invite",
  "/tools/forms",
  "/profile",
  "/family-tree",
];
const MEMBER_PAGES = [...LADDER_PAGES, "/notifications"];

async function expectInbox(page: Page): Promise<void> {
  await page.goto("/notifications");
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Notifications" }),
  ).toBeVisible();
}

test.describe("member gate ladder", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("no invite: every member page holds at the invite gate", async ({
    page,
  }) => {
    await login(page, { id: "ladder-invite", email: "ladder1@example.com" });
    for (const path of MEMBER_PAGES) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/signup\/required/);
      await expect(
        page.getByRole("heading", { name: "One more thing" }),
      ).toBeVisible();
    }
  });

  test("invite but no profile: every member page holds at onboarding", async ({
    page,
  }) => {
    await login(page, { id: "ladder-onb", email: "ladder2@example.com" });
    await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
    for (const path of LADDER_PAGES) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/onboarding\/questionnaire/);
      await expect(
        page.getByRole("heading", { name: "Before you go any further" }),
      ).toBeVisible();
    }
    await expectInbox(page);
  });

  test("profile done but not approved: every member page holds at approval", async ({
    page,
    request,
  }) => {
    await request.post("/api/test/seed-invite", {
      data: { code: "LADDER-VET", maxUses: 1, requiresApproval: true },
    });
    await login(page, { id: "ladder-pend", email: "ladder3@example.com" });
    await redeemInviteAtGate(page, "LADDER-VET");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
    await completeOnboarding(request, "ladder-pend");
    for (const path of LADDER_PAGES) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/pending-approval/);
      await expect(
        page.getByRole("heading", { name: "Application submitted" }),
      ).toBeVisible();
    }
    await expectInbox(page);
  });

  test("approved: every member page renders itself", async ({
    page,
    request,
  }) => {
    await login(page, { id: "ladder-ok", email: "ladder4@example.com" });
    await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
    await completeOnboarding(request, "ladder-ok");
    const headings: Record<string, string | RegExp> = {
      "/tools/invite": /Invite/,
      "/tools/forms": "My forms",
      "/profile": /.+/,
      "/family-tree": "Family tree",
      "/notifications": "Notifications",
    };
    for (const path of MEMBER_PAGES) {
      await page.goto(path);
      await expect(page, path).toHaveURL(new RegExp(`${path}$`));
      await expect(
        page.getByRole("heading", { level: 1, name: headings[path] }),
      ).toBeVisible();
    }
  });
});
