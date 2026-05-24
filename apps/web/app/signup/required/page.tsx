import { redirect } from "next/navigation";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
import { AuthShell } from "@/components/auth-shell";
import { InviteCodeForm } from "../invite-form";

// Pulls the Neon Auth session via cookies — can't be statically prerendered.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Invite required — Camp 404",
};

/**
 * Shown when an authenticated user has a Neon Auth account but no invite
 * code recorded on their camp user row (and isn't a god account). They
 * can redeem a code here — the same server action used at `/signup`
 * records it on their existing user row via `ensureCampUser` on the next
 * request.
 */
export default async function SignupRequiredPage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/");
  }

  return (
    <AuthShell hideBack>
      <InviteCodeForm
        next="/"
        cta="Unlock my account"
        title="Just one thing"
        subtitle="Camp 404 sign-up is invite-only. Drop the code you were given and we'll continue."
      />
    </AuthShell>
  );
}
