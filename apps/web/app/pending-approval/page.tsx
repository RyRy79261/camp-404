import { redirect } from "next/navigation";
import { Clock, ShieldX } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { IconBadge } from "@camp404/ui/components/icon-badge";
import { AuthShell } from "@/components/auth-shell";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  getBurnerProfile,
  hasCampAccess,
  isApproved,
} from "@/lib/users";

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
    <AuthShell hideBack>
      <div className="flex flex-col items-center gap-6 text-center">
        <IconBadge size="lg" tone={rejected ? "destructive" : "accent"}>
          {rejected ? <ShieldX aria-hidden /> : <Clock aria-hidden />}
        </IconBadge>

        {rejected ? (
          <div className="flex flex-col gap-2">
            <h1 className="text-subtitle-hero font-bold text-card-foreground">
              Application not approved
            </h1>
            <p className="text-balance text-label text-muted-foreground">
              A captain has reviewed your application and it wasn&apos;t
              approved for camp access this time. If you think this is a
              mistake, reach out to whoever invited you.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <h1 className="text-subtitle-hero font-bold text-card-foreground">
              Application submitted
            </h1>
            <p className="text-balance text-label text-muted-foreground">
              Thanks{campUser.displayName ? `, ${campUser.displayName}` : ""} —
              your profile is in. A captain needs to approve your access before
              you can use the rest of the app. We&apos;ll let you in as soon as
              they do; just check back here.
            </p>
          </div>
        )}

        <Button asChild variant="outline" className="w-full">
          <a href="/auth/sign-out">Sign out</a>
        </Button>
      </div>
    </AuthShell>
  );
}
