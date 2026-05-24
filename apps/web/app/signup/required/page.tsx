import { redirect } from "next/navigation";
import { Button } from "@camp404/ui/components/button";
import { AuthShell } from "@/components/auth-shell";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";

// Pulls the Neon Auth session via cookies — can't be statically prerendered.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Invite required — Camp 404",
};

/**
 * Edge-case dead-end: an authenticated user has somehow landed without
 * an invite code on their row (e.g. created their account in a window
 * where the cookie had expired). They can't enter a code here — the
 * invite code form lives ONLY on /signup, never anywhere a logged-in
 * user can reach. Their only option is to sign out and start over via
 * the invite link they were given.
 */
export default async function SignupRequiredPage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/");
  }

  return (
    <AuthShell hideBack>
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">You're not on the list — yet</h1>
          <p className="text-balance text-sm text-[color:var(--color-muted-foreground)]">
            You're signed in but the camp doesn't see an invite for{" "}
            <span className="font-medium text-[color:var(--color-foreground)]">
              {authUser.primaryEmail ?? "this account"}
            </span>
            . Sign out and start again from the invite link you were given.
          </p>
        </div>
        <Button asChild className="w-full">
          <a href="/auth/sign-out">Sign out</a>
        </Button>
      </div>
    </AuthShell>
  );
}
