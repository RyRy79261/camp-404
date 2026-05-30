import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
import { InviteGateForm } from "./invite-gate-form";

// Pulls the Neon Auth session via cookies — can't be statically prerendered.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Invite required — Camp 404",
};

/**
 * The post-auth invite gate. We can't stop Neon Auth from creating an
 * identity when someone signs in (Google especially), so the invite check
 * lives here instead of before sign-up: a signed-in user with no code on
 * file lands on this screen and can't reach the questionnaire until they
 * enter a valid one. Anyone who already has access (a god account, or a code
 * already redeemed) is forwarded straight home.
 */
export default async function SignupRequiredPage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/");
  }

  return (
    <AuthShell hideBack footer="Camp 404 is invite-only.">
      <InviteGateForm email={authUser.primaryEmail} />
    </AuthShell>
  );
}
