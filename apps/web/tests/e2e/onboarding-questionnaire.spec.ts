import { test, expect } from "@playwright/test";
import {
  completeOnboarding,
  login,
  resetTestState,
  redeemInviteAtGate,
} from "./_helpers";

// The questionnaire wizard previously had ZERO e2e coverage — specs only ever
// reached its landing page or shortcut completion via a test seam. The
// production "can't get from stage 2 to stage 3" bug lived exactly here: the
// "About you" page collects the government ID number, and a save failure (a
// missing PGCRYPTO_KEY made encrypt() throw) was silently swallowed by the
// wizard, blocking the advance. This spec proves the GREEN-PATH advance past
// that page. The throw → error-banner recovery behaviour is covered by the
// runner unit test, since E2E_TEST_MODE bypasses encryption (the in-memory
// backend stores the ID raw) so the save cannot throw here.
//
// Relies on E2E_TEST_MODE=1 + INVITE_CODES=TEST-INVITE-E2E-ONLY-CODE (see playwright.config.ts).

test.describe("onboarding questionnaire wizard", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a member can advance past the ID-document page", async ({ page }) => {
    await login(page, { id: "wizard-user", email: "wizard@example.com" });
    await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);

    // Surface 23 — the gate interstitial lands first; start into the wizard
    // (surface 24, the blocking runner).
    await expect(
      page.getByRole("heading", { name: "Before you go any further" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Start questionnaire" }).click();
    // The runner's blocking chrome is up (the persistent notice is unique copy).
    await expect(
      page.getByText(/can't use the rest of the app/i),
    ).toBeVisible();

    // Page 1 — profile photo: optional, so skip it. By its heading: the step
    // rail above the form names every section too.
    await expect(
      page.getByRole("heading", { name: "Add a profile photo", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Skip" }).click();

    // Page 2 — "About you": fill every required field, crucially the ID number
    // that the bug choked on. Identify the page by its <h2> heading (exact) so
    // the substring "about you" can't collide with page 3's "A bit about you".
    await expect(
      page.getByRole("heading", { name: "About you", exact: true }),
    ).toBeVisible();
    await page.locator("#q-birthday").fill("1990-04-12");
    await page.locator("#q-phone").fill("+27 82 555 1234");

    // Country: searchable cmdk combobox — open, filter, pick.
    await page.getByRole("combobox").click();
    await page.getByPlaceholder(/Search countries/).fill("South Africa");
    await page.getByRole("option", { name: /South Africa/ }).click();

    // ID document: passport keeps the cross-field validation simple (any
    // 6–12 char alphanumeric), avoiding the SA-ID date/Luhn checksum.
    await page.getByRole("radio", { name: "Passport" }).click();
    await page.locator("#q-id\\.number").fill("A1234567");

    // `exact` so we don't also match next dev's "Open Next.js Dev Tools" button.
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // Page 3 — "A bit about you" (bio): reaching it proves we advanced PAST
    // the ID-document page that used to block onboarding.
    await expect(
      page.getByRole("heading", { name: "A bit about you", exact: true }),
    ).toBeVisible();
  });

  test("a Telegram username is checked, then shows on the roster as the member's handle", async ({
    page,
    request,
  }) => {
    await login(page, {
      id: "tg-user",
      email: "tg@example.com",
      displayName: "Nova Reyes",
    });
    await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
    await page.getByRole("link", { name: "Start questionnaire" }).click();
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(
      page.getByRole("heading", { name: "About you", exact: true }),
    ).toBeVisible();

    await page.locator("#q-birthday").fill("1990-04-12");
    await page.locator("#q-phone").fill("+27 82 555 1234");
    await page.getByRole("combobox").click();
    await page.getByPlaceholder(/Search countries/).fill("South Africa");
    await page.getByRole("option", { name: /South Africa/ }).click();
    await page.getByRole("radio", { name: "Passport" }).click();
    await page.locator("#q-id\\.number").fill("A1234567");

    // Not a Telegram username (a hyphen): the page says so and stays.
    await page.locator("#q-telegram").fill("nova-reyes");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText(/Enter a Telegram username/)).toBeVisible();

    await page.locator("#q-telegram").fill("@nova_reyes");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "A bit about you", exact: true }),
    ).toBeVisible();

    await completeOnboarding(request, "tg-user");
    await page.goto("/captains/camp-management");
    await expect(
      page.getByRole("heading", { level: 1, name: "Camp management" }),
    ).toBeVisible();
    // Phone and desktop draw the roster differently; one of them is visible.
    await expect(
      page.getByText("@nova_reyes").filter({ visible: true }).first(),
    ).toBeVisible();
  });
});
