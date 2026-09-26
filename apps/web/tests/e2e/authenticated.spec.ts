import { test, expect } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
} from "./_helpers";
import {
  expectDesktop,
  navEntry,
  openConsoleNav,
  openToday,
} from "./lib/console-nav";

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
    // The required-questionnaire gate interstitial (S23) is what greets them.
    await expect(
      page.getByRole("heading", { name: "Before you go any further" }),
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
    // Signed in but no code on file → bounced to the gate.
    await login(page, { id: "redeemer-auth", email: "redeemer@example.com" });
    await page.goto("/");
    await expect(page).toHaveURL(/\/signup\/required/);

    // Entering a valid code claims it onto their row and forwards onward.
    await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
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
    // Home is now the member's desktop instead of the sign-in CTA, with a
    // member program in its Start menu (or phone home screen) that opens.
    await expectDesktop(page);
    const me = await openConsoleNav(page, "Me");
    await navEntry(me, "My forms").click();
    await expect(page).toHaveURL("/tools/forms");
    await expect(
      page.getByRole("heading", { level: 1, name: "My forms" }),
    ).toBeVisible();
  });

  test("a member reaches their sign-in and security page from the profile", async ({
    page,
    request,
  }) => {
    await login(page, { id: "secure-auth", email: "god@example.com" });
    await page.goto("/");
    await completeOnboarding(request, "secure-auth");

    await page.goto("/profile");
    await page
      .getByRole("navigation", { name: "Account sections" })
      .getByRole("link", { name: "Sign-in and security" })
      .click();
    await expect(page).toHaveURL("/profile/security");
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign-in and security" }),
    ).toBeVisible();
    for (const panel of [
      "Password",
      "Two-factor authentication",
      "Passkeys",
      "Signed-in devices",
    ]) {
      await expect(page.getByRole("heading", { name: panel })).toBeVisible();
    }
    // The test store has no Better Auth session to list, and the page says it
    // could not read the devices rather than showing an empty list.
    await expect(
      page.getByText(/couldn.t read your active sessions/),
    ).toBeVisible();
  });

  test("a pending member lands on Home, told they are waiting, and is held everywhere else", async ({
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

    // Finish onboarding — now approval is the only thing left. Home says so
    // (owner, 2026-09-23: after the Burner Bio "I land on my dashboard. It
    // will give me information about the fact that I still need to be
    // approved"), and shows nothing they cannot act on yet.
    await completeOnboarding(request, "pending-auth");
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    // The restricted desktop: its Today gadget says they are waiting.
    const today = await openToday(page);
    await expect(today.getByText("Waiting for a captain")).toBeVisible();
    await expect(today.getByRole("list", { name: "Needs you" })).toHaveCount(0);
    await expect(today.getByText("Coming up")).toHaveCount(0);

    // Every other member page still holds at the approval screen.
    await page.goto("/tools/forms");
    await expect(page).toHaveURL(/\/pending-approval/);
  });

  test("an unauthenticated visit to a protected page redirects to sign-in", async ({
    page,
  }) => {
    // No test-user cookie → getAuthenticatedUserOrRedirect bounces to the
    // Neon Auth sign-in page.
    await page.goto("/tools/forms");
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
      data: {
        authUserId: "rejected-auth",
        status: "rejected",
        reason: "We are full this year.",
      },
    });

    await page.goto("/");
    await expect(page).toHaveURL(/\/pending-approval/);
    await expect(page.getByText("Application not approved")).toBeVisible();
    // The captain's reason is shown to the member.
    await expect(page.getByText("We are full this year.")).toBeVisible();
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

  test("/api/voice/transcribe refuses a signed-in account with no camp access", async ({
    page,
  }) => {
    // Sign-up is open, and every clip spends the camp's Groq key: an account
    // that has not redeemed an invite is refused before anything is read.
    await login(page, { email: "stranger@example.com" });
    const res = await page.request.post("/api/voice/transcribe", {
      multipart: {
        audio: {
          name: "clip.webm",
          mimeType: "audio/webm",
          buffer: Buffer.from("not really audio"),
        },
      },
    });
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });
});
