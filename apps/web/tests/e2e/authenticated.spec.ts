import { test, expect } from "@playwright/test";
import { completeQuestionnaire, login, resetTestState } from "./_helpers";

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
    await expect(page.getByText("Just one thing")).toBeVisible();
  });

  test("invite redeemed at /signup/required unlocks the questionnaire", async ({
    page,
    request,
  }) => {
    await login(request, { email: "redeemer@example.com" });
    await page.goto("/signup/required");
    await page.getByLabel("Invite code").fill("TEST-INVITE");
    await page.getByRole("button", { name: "Unlock my account" }).click();

    // The action sets the cookie and redirects to /, which then sees the
    // (now-claimed) code on the user row and forwards to the questionnaire.
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  });

  test("completing the questionnaire redirects home", async ({
    page,
    request,
  }) => {
    await login(request, { email: "god@example.com" });
    await page.goto("/onboarding/questionnaire");
    await completeQuestionnaire(page);

    await expect(page).toHaveURL("/");
    // Home now shows the QuadrantNav instead of the sign-in CTA.
    await expect(page.getByRole("link", { name: "Members" })).toBeVisible();
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
