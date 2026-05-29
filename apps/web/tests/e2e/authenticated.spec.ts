import { test, expect } from "@playwright/test";
import { completeOnboarding, login, resetTestState } from "./_helpers";

// All specs here rely on E2E_TEST_MODE=1 in the dev server env (see
// playwright.config.ts). The /api/test/login + reset routes are only
// registered when that flag is set; production builds never expose them.

test.describe("authenticated flow (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("god email bypasses the invite gate and reaches the questionnaire", async ({
    page,
    request,
  }) => {
    await login(request, { email: "god@example.com" });
    await page.goto("/");

    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
    await expect(
      page.getByRole("heading", { name: "Build your burner profile" }),
    ).toBeVisible();
  });

  test("non-god without an invite is bounced to /signup/required", async ({
    page,
    request,
  }) => {
    await login(request, { email: "newbie@example.com" });
    await page.goto("/");

    await expect(page).toHaveURL(/\/signup\/required/);
    await expect(page.getByText("You're not on the list")).toBeVisible();
  });

  test("invite redeemed at /signup unlocks the questionnaire", async ({
    page,
    request,
  }) => {
    // The invite form lives only on /signup. Redeeming drops the cookie and
    // sends the (still-anonymous) browser to the Neon Auth sign-up page.
    await page.goto("/signup");
    await page.getByLabel("Invite code").fill("TEST-INVITE");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/auth\/sign-up/);

    // Simulate sign-up completing: the test user logs in and hits /, which
    // claims the cookie code onto their row and forwards to the questionnaire.
    await login(request, { id: "redeemer-auth", email: "redeemer@example.com" });
    await page.goto("/");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  });

  test("completing onboarding redirects an approved user home", async ({
    page,
    request,
  }) => {
    // God accounts are approved by default — straight to the app once
    // onboarding is done.
    await login(request, { id: "god-auth", email: "god@example.com" });
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
    await page.goto("/signup");
    await page.getByLabel("Invite code").fill("GATEKEEP");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/auth\/sign-up/);

    await login(request, { id: "pending-auth", email: "pending@example.com" });
    await page.goto("/");
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

  test("/api/voice/transcribe accepts an authed request and rejects bad input", async ({
    request,
  }) => {
    await login(request, { email: "god@example.com" });

    // Wrong content type → 415.
    const wrongType = await request.post("/api/voice/transcribe", {
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
    const noAudio = await request.post("/api/voice/transcribe", {
      multipart: {},
    });
    expect(noAudio.status()).toBe(400);
  });
});
