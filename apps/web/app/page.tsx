import { redirect } from "next/navigation";
import { ListChecks, UserRound, Users, Wrench } from "lucide-react";
import {
  ControlPanel,
  type ControlPanelLayer,
} from "@camp404/ui/components/control-panel";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, getBurnerProfile, hasCampAccess } from "@/lib/users";
import { HomeHeader } from "./home-header";
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

  const initials = initialsFrom(campUser.displayName ?? user.primaryEmail);

  // Until `users.rank` is plumbed through the helpers, every viewer sees
  // their own layer plus a visible-but-locked Team Lead / Captain peek.
  const viewerRank = "camp_member" as const;

  return (
    <ControlPanel
      layers={homeLayers}
      viewerRank={viewerRank}
      header={<HomeHeader initials={initials} />}
      centre={{ label: "TALK" }}
    />
  );
}

function initialsFrom(source: string | null): string {
  if (!source) return "?";
  const parts = source.trim().split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const homeLayers: ControlPanelLayer[] = [
  {
    rank: "camp_member",
    topLeft: {
      label: "My Teams",
      hint: "Your crews",
      href: "/members",
      icon: <Users className="h-5 w-5" />,
    },
    topRight: {
      label: "My Tasks",
      hint: "What's on you",
      href: "/meals",
      icon: <ListChecks className="h-5 w-5" />,
    },
    bottomLeft: {
      label: "My Profile",
      hint: "You & your data",
      href: "/onboarding/questionnaire",
      icon: <UserRound className="h-5 w-5" />,
    },
    bottomRight: {
      label: "Tools",
      hint: "Meals, expenses…",
      href: "/manuals",
      icon: <Wrench className="h-5 w-5" />,
    },
  },
  {
    rank: "team_lead",
    topLeft: {
      label: "Team Roster",
      hint: "Members in your team",
      icon: <Users className="h-5 w-5" />,
    },
    topRight: {
      label: "Team Tasks",
      hint: "Assign & track work",
      icon: <ListChecks className="h-5 w-5" />,
    },
    bottomLeft: {
      label: "Lead Profile",
      hint: "Your team setup",
      icon: <UserRound className="h-5 w-5" />,
    },
    bottomRight: {
      label: "Team Tools",
      hint: "Shifts, notices…",
      icon: <Wrench className="h-5 w-5" />,
    },
  },
  {
    rank: "captain",
    topLeft: {
      label: "Camp Roster",
      hint: "Every camp member",
      icon: <Users className="h-5 w-5" />,
    },
    topRight: {
      label: "Camp Tasks",
      hint: "Camp-wide work board",
      icon: <ListChecks className="h-5 w-5" />,
    },
    bottomLeft: {
      label: "Finances",
      hint: "Dues & reimbursements",
      icon: <UserRound className="h-5 w-5" />,
    },
    bottomRight: {
      label: "Camp Tools",
      hint: "Registrations, ops…",
      icon: <Wrench className="h-5 w-5" />,
    },
  },
];
