import type { APIRequestContext, BrowserContext } from "@playwright/test";

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
 * Mark a test user's burner-profile onboarding complete via the test seam.
 * The questionnaire is a 13-page wizard whose page-by-page navigation,
 * validation and submission contract are covered at the component layer
 * (`components/__tests__/wizard.test.tsx`); e2e only needs to reach the
 * post-onboarding gates (home vs. /pending-approval), so it shortcuts there
 * deterministically instead of re-driving every field.
 *
 * The user row must already exist — hit a gated page (e.g. `/`) once after
 * login so `ensureCampUser` lazily creates it before calling this.
 */
export async function completeOnboarding(
  request: APIRequestContext,
  authUserId: string,
): Promise<void> {
  const res = await request.post("/api/test/complete-onboarding", {
    data: { authUserId },
  });
  if (!res.ok()) {
    throw new Error(`completeOnboarding failed: ${res.status()}`);
  }
}

/** Clear cookies for an existing Browser context. */
export async function logoutAll(context: BrowserContext): Promise<void> {
  await context.clearCookies();
}
