"use server";

import { runAction } from "@/lib/action-result";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { revalidateManifest } from "@/lib/manifest-revalidate";
import {
  isCampBootstrapped,
  mayFoundCamp,
  runFirstTimeSetup,
  SETUP_REFUSED_MESSAGE,
  type SetupResult,
} from "@/lib/bootstrap";

/**
 * Complete first-time setup: elect the signed-in user as the founding captain
 * and mint the root invite code.
 *
 * Returns a typed result the wizard renders:
 * - `{ ok: true }` on success. The client navigates home, where the normal
 *   gates take over and the founder lands on onboarding next.
 * - `{ ok: false }` with a sentence when the camp is already set up (someone
 *   else won the race) or when a database error was thrown (runAction logs it
 *   and returns a generic message).
 *
 * An account that is not the founding address (see `mayFoundCamp`) is
 * refused with a sentence, and nothing is written.
 *
 * The bootstrap state is read first, without a lock. After setup, every call
 * is refused before bootstrapFirstCaptain takes the camp_settings lock that
 * sends and the year rollover also wait on. Otherwise any signed-in account
 * could call this in a loop.
 */
export async function completeSetupAction(): Promise<SetupResult> {
  const user = await getAuthenticatedUserOrRedirect();
  return runAction("completeSetupAction", async () => {
    if (await isCampBootstrapped()) {
      return { ok: false, error: "Camp 404 is already set up." };
    }
    // Sign-up is open: with GOD_EMAILS set, only a verified founding address
    // may take the captaincy, so a stranger cannot race the founder.
    if (!mayFoundCamp(user)) {
      return { ok: false, error: SETUP_REFUSED_MESSAGE };
    }
    const result = await runFirstTimeSetup(user);
    // The founder is a captain now: their console redraws from a fresh
    // manifest.
    if (result.ok) revalidateManifest();
    return result;
  });
}
