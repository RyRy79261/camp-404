import { expect } from "@playwright/test";
import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";
import type { ParticipationIntent, ParticipationStatus } from "@camp404/types";

/**
 * Test-mode helpers. These hit `/api/test/*` endpoints that are only
 * registered when the dev server runs with `E2E_TEST_MODE=1` (see
 * `playwright.config.ts`'s `webServer.env`). They sit on top of the
 * in-memory user / burner-profile / invite-code store in
 * `apps/web/lib/test-store.ts` — production builds never load it.
 *
 * Cookie jars matter here. The standalone `request` fixture has its OWN
 * cookie jar that is NOT shared with `page`, so the auth cookie must be set
 * through `page.request` (which shares the browser context's cookies) or the
 * page navigations won't be authenticated. The other helpers below only
 * mutate the process-wide in-memory store (keyed by authUserId, not a
 * cookie), so they're fine on the standalone `request` fixture.
 */

export interface LoginUser {
  id?: string;
  email?: string;
  displayName?: string;
  /** Defaults to true. False signs in as a member who has not confirmed
   * their email yet (a password member moved from Neon Auth). */
  emailVerified?: boolean;
}

/**
 * Sign in as a synthetic user by setting the `camp404_test_user` cookie on
 * the PAGE's browser context (via `page.request`), so subsequent
 * `page.goto(...)` navigations are authenticated. Passing the standalone
 * `request` fixture instead would drop the cookie into a jar the page never
 * sends — the classic Playwright auth-cookie pitfall.
 */
export async function login(page: Page, user: LoginUser = {}): Promise<void> {
  const res = await page.request.post("/api/test/login", { data: user });
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`);
}

/** Clear the test-mode user store and the auth/invite cookies. */
export async function resetTestState(
  request: APIRequestContext,
): Promise<void> {
  await request.post("/api/test/reset");
}

/**
 * Mark a test user's burner-profile onboarding complete via the test seam.
 * The questionnaire is a 13-page wizard whose page-by-page navigation,
 * validation and submission contract are covered at the component layer
 * (`components/__tests__/runner.test.tsx`); e2e only needs to reach the
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

/**
 * Redeem an invite code at the post-auth gate (/signup/required). The user
 * must already be signed in (see {@link login}). Submitting a valid code
 * claims it onto their row and redirects home, which routes onward to the
 * questionnaire; an invalid code keeps them on the gate with an error.
 */
export async function redeemInviteAtGate(
  page: Page,
  code: string,
): Promise<void> {
  await page.goto("/signup/required");
  await expect(page.getByLabel("Invite code")).toBeVisible();
  await page.getByLabel("Invite code").fill(code);
  await page.getByRole("button", { name: "Enter camp" }).click();
}

/**
 * Force a test user's rank via the test seam. Lets a spec promote a user to
 * captain to reach captain-only surfaces without minting a captain invite and
 * walking the redeem flow. The user row must already exist (hit a gated page
 * once after login so `ensureCampUser` creates it).
 */
export async function setRank(
  request: APIRequestContext,
  authUserId: string,
  rank: "captain" | "member",
): Promise<void> {
  const res = await request.post("/api/test/set-rank", {
    data: { authUserId, rank },
  });
  if (!res.ok()) throw new Error(`setRank failed: ${res.status()}`);
}

/**
 * Put a test user on a team for this year via the test seam, leading it when
 * `isLead` is true. A lead is a team-lead persona: the builder and the
 * Questionnaires tool open for them. The user row must already exist.
 */
export async function seedTeam(
  request: APIRequestContext,
  authUserId: string,
  team: string,
  isLead = false,
): Promise<void> {
  const res = await request.post("/api/test/seed-team", {
    data: { authUserId, team, isLead },
  });
  if (!res.ok()) throw new Error(`seedTeam failed: ${res.status()}`);
}

/**
 * Give a test user a lift this year through the test seam: their own car
 * (`driver`), or a seat in `driverAuthUserId`'s car (`rider`). Both users must
 * have loaded a page. The store's twin of getMyLift reads it.
 */
export async function seedLift(
  request: APIRequestContext,
  authUserId: string,
  lift:
    | {
        role: "driver";
        vehicleMake?: string;
        vehicleModel?: string;
        seatsOffered?: number;
        departureCity?: string;
      }
    | { role: "rider"; driverAuthUserId: string },
): Promise<void> {
  const res = await request.post("/api/test/seed-lift", {
    data: { authUserId, ...lift },
  });
  if (!res.ok()) throw new Error(`seedLift failed: ${res.status()}`);
}

/**
 * Put a test user at an attendance status for this year (applied, maybe,
 * accepted, waitlisted or not_attending). The user must have loaded a page.
 */
export async function seedParticipation(
  request: APIRequestContext,
  authUserId: string,
  status: ParticipationStatus,
  /** The member's own answer; the server defaults it from the status. */
  intent?: ParticipationIntent,
): Promise<void> {
  const res = await request.post("/api/test/seed-participation", {
    data: { authUserId, status, intent },
  });
  if (!res.ok()) throw new Error(`seedParticipation failed: ${res.status()}`);
}

/** Clear cookies for an existing Browser context. */
export async function logoutAll(context: BrowserContext): Promise<void> {
  await context.clearCookies();
}
