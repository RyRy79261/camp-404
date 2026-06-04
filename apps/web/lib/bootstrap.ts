import "server-only";

import {
  bootstrapFirstCaptain,
  getBootstrapState,
} from "@camp404/db/bootstrap";
import { isE2ETestMode } from "./test-mode";
import { seedBurnerProfileAction } from "./users";
import type { AuthenticatedUser } from "./auth";

// The fixed root invite code minted for the founding captain. Pinned so a
// fresh camp always hands out the same first code (matches the admin-CLI
// `bootstrap-founder` slug).
export const FOUNDER_CODE = "meowzit";

/**
 * Whether the camp has completed first-time setup — i.e. a captain exists (the
 * real signal) or the latch is stamped. E2E test mode short-circuits to `true`
 * so the /setup wizard never intercepts the test store's signup/onboarding
 * flow (the test backend models no captains or bootstrap latch).
 */
export async function isCampBootstrapped(): Promise<boolean> {
  if (isE2ETestMode()) return true;
  const state = await getBootstrapState();
  return state.captainCount > 0 || state.bootstrappedAt !== null;
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
  if (isE2ETestMode()) return { ok: true };
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
