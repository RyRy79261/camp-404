import { test, expect } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
} from "./_helpers";

// All specs here rely on E2E_TEST_MODE=1 in the dev server env (see
// playwright.config.ts). The /api/test/login + reset routes are only
// registered when that flag is set; production builds never expose them.

test.describe("authenticated flow (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("god email bypasses the invite gate and reaches the questionnaire", async ({
    page,
  }) => {
    await login(page, { email: "god@example.com" });
    await page.goto("/");

    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
    await expect(
      page.getByRole("heading", { name: "Build your burner profile" }),
    ).toBeVisible();
  });

  test("non-god without an invite is bounced to the invite gate", async ({
    page,
  }) => {
    await login(page, { email: "newbie@example.com" });
    await page.goto("/");

    await expect(page).toHaveURL(/\/signup\/required/);
    await expect(page.getByLabel("Invite code")).toBeVisible();
  });

  test("an invite entered at the gate unlocks the questionnaire", async ({
    page,
  }) => {
    // Signed in via Neon Auth but no code on file → bounced to the gate.
    await login(page, { id: "redeemer-auth", email: "redeemer@example.com" });
    await page.goto("/");
    await expect(page).toHaveURL(/\/signup\/required/);

    // Entering a valid code claims it onto their row and forwards onward.
    await redeemInviteAtGate(page, "TEST-INVITE");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  });

  test("completing onboarding redirects an approved user home", async ({
    page,
    request,
  }) => {
    // God accounts are approved by default — straight to the app once
    // onboarding is done.
    await login(page, { id: "god-auth", email: "god@example.com" });
    await page.goto("/");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);

    await completeOnboarding(request, "god-auth");

    await page.goto("/");
    await expect(page).toHaveURL("/");
    // Home now shows the layered ControlPanel instead of the sign-in CTA.
    await expect(page.getByRole("link", { name: /My Teams/ })).toBeVisible();
  });

  test("a pending member is held at /pending-approval after onboarding", async ({
    page,
    request,
  }) => {
    // A vetting-required code lands the redeemer in the approval queue.
    await request.post("/api/test/seed-invite", {
      data: { code: "GATEKEEP", maxUses: 1, requiresApproval: true },
    });
    await login(page, { id: "pending-auth", email: "pending@example.com" });
    await redeemInviteAtGate(page, "GATEKEEP");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);

    // Finish onboarding — now the approval gate is the only thing left, and
    // it blocks the app with the "application submitted" screen.
    await completeOnboarding(request, "pending-auth");
    await page.goto("/");
    await expect(page).toHaveURL(/\/pending-approval/);
    await expect(page.getByText("Application submitted")).toBeVisible();

    // The gate holds on other protected routes too, not just home.
    await page.goto("/tools");
    await expect(page).toHaveURL(/\/pending-approval/);
  });

  test("an unauthenticated visit to a protected page redirects to sign-in", async ({
    page,
  }) => {
    // No test-user cookie → getAuthenticatedUserOrRedirect bounces to the
    // Neon Auth sign-in page.
    await page.goto("/tools");
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });

  test("the sign-up page is reachable without an invite", async ({ page }) => {
    // The invite gate moved past auth, so /auth/sign-up is now open — the
    // code is collected later at /signup/required.
    await page.goto("/auth/sign-up");
    await expect(page).toHaveURL(/\/auth\/sign-up$/);
    await expect(
      page.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible();
  });

  test("a rejected member sees the not-approved screen", async ({
    page,
    request,
  }) => {
    await request.post("/api/test/seed-invite", {
      data: { code: "VETO", maxUses: 1, requiresApproval: true },
    });
    await login(page, { id: "rejected-auth", email: "rejected@example.com" });
    await redeemInviteAtGate(page, "VETO");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
    await completeOnboarding(request, "rejected-auth");

    // A captain rejects them (simulated via the test seam — the real
    // approve/reject UI reads the live DB and isn't drivable in test mode).
    await request.post("/api/test/set-approval", {
      data: { authUserId: "rejected-auth", status: "rejected" },
    });

    await page.goto("/");
    await expect(page).toHaveURL(/\/pending-approval/);
    await expect(page.getByText("Application not approved")).toBeVisible();
  });

  test("/api/voice/transcribe accepts an authed request and rejects bad input", async ({
    page,
  }) => {
    await login(page, { email: "god@example.com" });

    // Wrong content type → 415. Use page.request so the auth cookie set by
    // login() travels with the request.
    const wrongType = await page.request.post("/api/voice/transcribe", {
      multipart: {
        audio: {
          name: "not-audio.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("hello"),
        },
      },
    });
    expect(wrongType.status()).toBe(415);

    // Missing audio field → 400.
    const noAudio = await page.request.post("/api/voice/transcribe", {
      multipart: {},
    });
    expect(noAudio.status()).toBe(400);
  });
});
