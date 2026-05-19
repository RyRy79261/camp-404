import { redirect } from "next/navigation";
import { stackServerApp } from "@/stack";
import { QuadrantNav } from "@camp404/ui/components/quadrant-nav";
import { ensureCampUser, getBurnerProfile, hasCampAccess } from "@/lib/users";

export default async function HomePage() {
  const user = await stackServerApp.getUser();

  if (!user) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 p-6">
        <div className="text-center">
          <h1 className="text-3xl font-semibold">Camp 404</h1>
          <p className="mt-2 max-w-sm text-sm text-[color:var(--color-muted-foreground)]">
            A calm command centre for a chaotic desert.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row">
          <a
            href="/signup"
            className="rounded-md bg-[color:var(--color-primary)] px-6 py-3 text-center text-sm font-medium text-[color:var(--color-primary-foreground)]"
          >
            Sign up
          </a>
          <a
            href="/handler/sign-in"
            className="rounded-md border border-[color:var(--color-border)] px-6 py-3 text-center text-sm font-medium"
          >
            Sign in
          </a>
        </div>
      </main>
    );
  }

  // Invite gate — god accounts (GOD_EMAILS) bypass; everyone else must have
  // redeemed an invite code at /signup before getting past this point.
  const campUser = await ensureCampUser(user);
  if (!hasCampAccess(campUser, user.primaryEmail ?? null)) {
    redirect("/signup/required");
  }

  // Mandatory burner-profile questionnaire — everything else is gated until
  // it's done.
  const profile = await getBurnerProfile(campUser.id);
  if (!profile?.completedAt) {
    redirect("/onboarding/questionnaire");
  }

  return (
    <QuadrantNav
      topLeft={{ label: "Members", href: "/members" }}
      topRight={{ label: "Meals", href: "/meals" }}
      bottomLeft={{ label: "Reimbursements", href: "/reimbursements" }}
      bottomRight={{ label: "Manuals", href: "/manuals" }}
      centre={{ label: "Hold to talk" }}
    />
  );
}
