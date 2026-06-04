import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { isCampBootstrapped, FOUNDER_CODE } from "@/lib/bootstrap";
import { SetupWizard } from "./setup-wizard";

// Reads the session on every request (and the bootstrap state), so it can't be
// statically prerendered.
export const dynamic = "force-dynamic";

/**
 * First-time setup. Reachable only on a fresh system (no captain yet) by a
 * signed-in user; it elects them the founding captain and mints the root
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

  return (
    <SetupWizard
      displayName={user.displayName ?? user.primaryEmail ?? "captain"}
      founderCode={FOUNDER_CODE}
    />
  );
}
