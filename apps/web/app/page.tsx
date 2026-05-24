import { redirect } from "next/navigation";
import { Button } from "@camp404/ui/components/button";
import { QuadrantNav } from "@camp404/ui/components/quadrant-nav";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, getBurnerProfile, hasCampAccess } from "@/lib/users";

export default async function HomePage() {
  const user = await getAuthenticatedUser();

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
          <Button asChild size="lg">
            <a href="/signup">Sign up</a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="/auth/sign-in">Sign in</a>
          </Button>
        </div>
      </main>
    );
  }

  // Invite gate — god accounts (GOD_EMAILS) bypass; everyone else must have
  // redeemed an invite code at /signup before getting past this point.
  const campUser = await ensureCampUser(user);
  if (!hasCampAccess(campUser, user.primaryEmail)) {
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
