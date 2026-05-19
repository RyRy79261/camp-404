import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";

/**
 * Test-mode helpers. These hit `/api/test/*` endpoints that are only
 * registered when the dev server runs with `E2E_TEST_MODE=1` (see
 * `playwright.config.ts`'s `webServer.env`). They sit on top of the
 * in-memory user / burner-profile / invite-code store in
 * `apps/web/lib/test-store.ts` — production builds never load it.
 */

export interface LoginUser {
  id?: string;
  email?: string;
  displayName?: string;
}

/** Sign in as a synthetic user. Sets the `camp404_test_user` cookie. */
export async function login(
  request: APIRequestContext,
  user: LoginUser = {},
): Promise<void> {
  const res = await request.post("/api/test/login", { data: user });
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`);
}

/** Clear the test-mode user store and the auth/invite cookies. */
export async function resetTestState(request: APIRequestContext): Promise<void> {
  await request.post("/api/test/reset");
}

/**
 * Walk every page of the burner-profile wizard with valid answers, then
 * click Finish on the last page. Caller is responsible for being on
 * /onboarding/questionnaire first.
 */
export async function completeQuestionnaire(page: Page): Promise<void> {
  // Page 1 — About you
  await page.getByLabel("First name").fill("Ash");
  await page.getByLabel("Surname").fill("Dust");
  await page.getByLabel("Nationality").fill("South African");
  await page.getByLabel("ID document").click();
  await page.getByRole("option", { name: "South African ID" }).click();
  await page.getByLabel("Document number").fill("1234567890123");
  await page.getByLabel("Telegram handle").fill("ash_in_the_dust");
  await page.getByRole("button", { name: "Next" }).click();

  // Page 2 — Burner history (everything optional, just advance)
  await page.getByText("Burner history", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Next" }).click();

  // Page 3 — Ticketing
  await page.getByText("Ticketing", { exact: false }).waitFor();
  await page.getByLabel(/Do you need help/i).click();
  await page
    .getByRole("option", { name: /No — I already have a ticket/ })
    .click();
  await page.getByRole("button", { name: "Next" }).click();

  // Page 4 — Intent
  await page.getByLabel("Your intent for this burn").fill("Cook and vibe.");
  await page.getByRole("button", { name: "Next" }).click();

  // Page 5 — Skills (sliders default to mid; just submit)
  await page.getByText("Skills", { exact: false }).first().waitFor();
  await page.getByRole("button", { name: "Next" }).click();

  // Page 6 — Bio
  await page
    .getByLabel("Tell us about yourself")
    .fill("Long-time burner, first-time member.");
  await page.getByRole("button", { name: "Next" }).click();

  // Page 7 — Referral
  await page.getByLabel("How did you hear about Camp 404?").click();
  await page
    .getByRole("option", { name: /A current member invited me/ })
    .click();
  await page.getByRole("button", { name: "Finish" }).click();
}

/** Drop a Stack-style auth-cookie placeholder for an existing Browser context. */
export async function logoutAll(context: BrowserContext): Promise<void> {
  await context.clearCookies();
}
