import { redirect } from "next/navigation";
import { QuadrantNav } from "@camp404/ui/components/quadrant-nav";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, getBurnerProfile, hasCampAccess } from "@/lib/users";
import { LandingHero } from "./landing-hero";

// Reads the Neon Auth session cookie on every request, so can't be
// statically prerendered. Without this, Next 16's build step logs a
// loud DYNAMIC_SERVER_USAGE trace before correctly falling back to
// dynamic rendering — same noise we already silenced on /signup/required.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return <LandingHero />;
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
