"use server";

import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { runFirstTimeSetup } from "@/lib/bootstrap";

/**
 * Complete first-time setup: elect the signed-in user as the founding captain
 * and mint the root invite code. Returns normally on success or if the camp was
 * already set up (a racing request won) — the client then navigates home, where
 * the normal gates take over and the founder lands on the onboarding
 * questionnaire next. A genuine failure (e.g. a DB error) throws, so the wizard
 * can surface it inline instead of swallowing it.
 */
export async function completeSetupAction(): Promise<void> {
  const user = await getAuthenticatedUserOrRedirect();
  await runFirstTimeSetup(user);
}
