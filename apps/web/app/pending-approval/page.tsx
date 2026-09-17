import { redirect } from "next/navigation";
import { Clock, ShieldX } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { GateScreen } from "@/components/auth-shell";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  getBurnerProfile,
  hasCampAccess,
  isApproved,
} from "@/lib/users";
import { SignOutLink } from "@/components/auth/sign-out-link";

// Reads the Neon Auth session on every request.
export const dynamic = "force-dynamic";

// Static export — Next can't branch this on the runtime approval status, so it
// stays neutral rather than reading "pending" on the rejected branch too.
export const metadata = {
  title: "Camp access — Camp 404",
};

/**
 * The blocking screen a member sees after onboarding when they redeemed an
 * invite code that requires captain vetting. It prevents access to the rest
 * of the app: the only states out are a captain approving them (→ the app
 * unlocks on the next load) or signing out. Rejected applicants land here
 * too, with a terminal message.
 */
export default async function PendingApprovalPage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);

  // No invite at all — that's the other dead-end, not this one.
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  // Already cleared — nothing to wait for.
  if (isApproved(campUser, authUser.primaryEmail)) {
    redirect("/");
  }
  // Onboarding still owes us answers — finish that first; a captain reviews a
  // completed profile.
  const profile = await getBurnerProfile(campUser.id);
  if (!profile?.completedAt) {
    redirect("/onboarding/questionnaire");
  }

  const rejected = campUser.approvalStatus === "rejected";

  return (
    <GateScreen
      icon={rejected ? <ShieldX aria-hidden /> : <Clock aria-hidden />}
      tone={rejected ? "destructive" : "accent"}
      eyebrow="Camp access"
      title={rejected ? "Application not approved" : "Application submitted"}
      description={
        rejected ? (
          <>
            A captain has reviewed your application and it wasn&apos;t approved
            for camp access this time. If you think this is a mistake, reach out
            to whoever invited you.
          </>
        ) : (
          <>
            Thanks{campUser.displayName ? `, ${campUser.displayName}` : ""} —
            your profile is in. A captain needs to approve your access before
            you can use the rest of the app. We&apos;ll let you in as soon as
            they do; just check back here.
          </>
        )
      }
    >
      {rejected && campUser.approvalDecisionReason && (
        <p className="whitespace-pre-line rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
          <span className="font-semibold">The captain said: </span>
          {campUser.approvalDecisionReason}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild variant="outline">
          <SignOutLink />
        </Button>
      </div>
      {authUser.primaryEmail && (
        <p className="text-center text-xs text-muted-foreground">
          Signed in as{" "}
          <span className="text-foreground">{authUser.primaryEmail}</span>
        </p>
      )}
    </GateScreen>
  );
}
