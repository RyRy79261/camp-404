import "server-only";

import {
  bootstrapFirstCaptain,
  getBootstrapState,
} from "@camp404/db/bootstrap";
import { isGodEmail } from "./access-control";
import { founderEmails } from "./integration-config";
import { usesTestStore } from "./test-mode";
import { seedBurnerProfileAction } from "./users";
import type { AuthenticatedUser } from "./auth";

// The fixed root invite code minted for the founding captain (matches the
// admin-CLI `bootstrap-founder` slug). It lives in core so pure code can
// name the founder too.
export { FOUNDER_CODE } from "@camp404/core";
import { FOUNDER_CODE } from "@camp404/core";

/**
 * Whether the camp has completed first-time setup — i.e. a captain exists (the
 * real signal) or the latch is stamped. E2E test mode short-circuits to `true`
 * so the /setup wizard never intercepts the test store's signup/onboarding
 * flow (the test backend models no captains or bootstrap latch).
 */
export async function isCampBootstrapped(): Promise<boolean> {
  if (usesTestStore()) return true;
  const state = await getBootstrapState();
  return state.captainCount > 0 || state.bootstrappedAt !== null;
}

/** What /setup says to an account that may not found the camp. */
export const SETUP_REFUSED_MESSAGE =
  "Only the camp's founding address can set up Camp 404. Sign in with it, and confirm it if asked.";

/**
 * Whether this account may found the camp on a fresh database. Sign-up is
 * open, so "the first signed-in account" could be a stranger who beat the
 * founder to /setup. When founder addresses are set (FOUNDER_EMAILS), only one of those addresses may
 * found the camp, and only once it is verified: `primaryEmail` is already
 * null for an unverified god address (lib/session-user.ts), so a stranger
 * cannot claim the founder's address without proving they own it. With
 * GOD_EMAILS unset, anyone signed in may, which is how setup always worked.
 */
export function mayFoundCamp(user: AuthenticatedUser): boolean {
  if (founderEmails(process.env).length === 0) return true;
  return isGodEmail(user.primaryEmail);
}

export type SetupResult = { ok: true } | { ok: false; error: string };

/**
 * Elect the signed-in user as the founding captain and mint the root invite
 * code, then seed their burner-profile gate so they still complete onboarding
 * like everyone else (setup only grants the rank + the first invite code).
 * Returns `{ ok: false }` if the camp was already set up (raced / revisited).
 */
export async function runFirstTimeSetup(
  authUser: AuthenticatedUser,
): Promise<SetupResult> {
  if (usesTestStore()) return { ok: true };
  // Clamp to the same 80-char cap the profile editor enforces.
  const displayName = (
    authUser.displayName ??
    authUser.primaryEmail ??
    "captain"
  ).slice(0, 80);
  const result = await bootstrapFirstCaptain({
    authUserId: authUser.id,
    displayName,
    founderCode: FOUNDER_CODE,
  });
  if (!result.ok) return { ok: false, error: "Camp 404 is already set up." };
  // The captain + latch are already committed; a failed burner-profile seed is
  // recovered by the home page's `completedAt` fallback (which routes to
  // onboarding), so log it rather than unwinding a successful bootstrap.
  await seedBurnerProfileAction(result.userId).catch((err) => {
    console.error("Failed to seed founder burner_profile required action", err);
  });
  return { ok: true };
}

/**
 * How many real captains the camp has (erased tombstones and system actors
 * excluded) — the data source for the sole-captain deletion guard. E2E test
 * mode models no captains or latch, so report a count that cannot block (the
 * guard only fires at <= 1).
 */
export async function countActiveCaptains(): Promise<number> {
  if (usesTestStore()) return 2;
  const state = await getBootstrapState();
  return state.captainCount;
}
