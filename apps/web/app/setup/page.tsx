import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  isCampBootstrapped,
  FOUNDER_CODE,
  mayFoundCamp,
  SETUP_REFUSED_MESSAGE,
} from "@/lib/bootstrap";
import { SetupRefused, SetupWizard } from "./setup-wizard";

// Reads the session on every request (and the bootstrap state), so it can't be
// statically prerendered.
export const dynamic = "force-dynamic";

export const metadata = { title: "Set up Camp 404 — Camp 404" };

/**
 * First-time setup. Reachable only on a fresh system (no captain yet) by a
 * signed-in user (a verified GOD_EMAILS address, when that is set); it elects them the founding captain and mints the root
 * invite code. Self-guards: once the camp is set up, it redirects home, so the
 * wizard can never re-run.
 */
export default async function SetupPage() {
  const user = await getAuthenticatedUser();
  // Setup needs an identity to promote — unsigned visitors go to the landing
  // page (which carries the sign-in entry point).
  if (!user) redirect("/");
  // Already set up — the wizard's job is done; never show it twice.
  if (await isCampBootstrapped()) redirect("/");
  // Sign-up is open: with GOD_EMAILS set, only a verified founding address may
  // take the captaincy. The action refuses too; this just says so up front.
  if (!mayFoundCamp(user))
    return <SetupRefused message={SETUP_REFUSED_MESSAGE} />;

  return (
    <SetupWizard
      displayName={user.displayName ?? user.primaryEmail ?? "captain"}
      founderCode={FOUNDER_CODE}
    />
  );
}
