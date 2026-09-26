import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { canDeliverAuthEmail } from "@camp404/auth";
import { ConfirmEmail } from "@/components/account/confirm-email";
import { AuthShell } from "@/components/auth-shell";
import {
  getAddressToConfirm,
  getAuthenticatedUserOrRedirect,
} from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
import { InviteGateForm } from "./invite-gate-form";

// Pulls the sign-in session via cookies — can't be statically prerendered.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Invite required — Camp 404",
};

/**
 * The post-auth invite gate. Sign-up is open, and Google creates an
 * identity when someone signs in (Google especially), so the invite check
 * lives here instead of before sign-up: a signed-in user with no code on
 * file lands on this screen and can't reach the questionnaire until they
 * enter a valid one. Anyone who already has access (a god account, or a code
 * already redeemed) is forwarded straight home.
 *
 * An account whose email is unconfirmed also gets the confirm-email card
 * here. It is the one screen such an account can always reach (the member
 * gate sends it here before Sign-in and security), and confirming is what
 * lets an address that already belongs to the camp in. The copy stays
 * neutral: it never says which addresses those are.
 */
export default async function SignupRequiredPage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/");
  }

  const addressToConfirm = authUser.emailVerified
    ? null
    : await getAddressToConfirm();

  return (
    <AuthShell
      os
      eyebrow="Invite required"
      icon={<KeyRound aria-hidden />}
      footer="Camp 404 is invite-only."
      aside={
        addressToConfirm ? (
          <ConfirmEmail
            email={addressToConfirm}
            deliverable={canDeliverAuthEmail(process.env)}
            callbackURL="/"
            description="Already part of the camp? Confirming your email may be all you need to get in, and it lets camp emails reach you."
          />
        ) : undefined
      }
    >
      <InviteGateForm email={authUser.primaryEmail} />
    </AuthShell>
  );
}
