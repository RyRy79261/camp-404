import { redirect } from "next/navigation";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
import { InviteCodeForm } from "../invite-form";

export const metadata = {
  title: "Invite required — Camp 404",
};

/**
 * Shown when an authenticated user has a Stack account but no invite code
 * recorded on their camp user row (and isn't a god account). They can redeem
 * a code here — the same server action used at `/signup` records it on
 * their existing user row via `ensureCampUser` on the next request.
 */
export default async function SignupRequiredPage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <header className="text-center">
        <h1 className="text-2xl font-semibold">Just one thing</h1>
        <p className="mt-2 text-sm text-[color:var(--color-muted-foreground)]">
          Camp 404 sign-up is invite-only. Drop the code you were given and
          we'll continue.
        </p>
      </header>
      <InviteCodeForm next="/" cta="Unlock my account" />
    </main>
  );
}
