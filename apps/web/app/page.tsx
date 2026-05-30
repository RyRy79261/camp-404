import { redirect } from "next/navigation";
import { ListChecks, UserRound, Users, Wrench } from "lucide-react";
import {
  ControlPanel,
  type ControlPanelLayer,
} from "@camp404/ui/components/control-panel";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  ensureCampUser,
  getBurnerProfile,
  hasCampAccess,
  isApproved,
  isTeamLead,
} from "@/lib/users";
import { initialsFrom } from "@/lib/initials";
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
  // redeemed an invite code before getting past this point. Without one they
  // land on /signup/required to enter a code.
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

  // Captain-approval gate — a member who redeemed a vetting-required invite
  // code lands here after onboarding but is held behind the blocking
  // application screen until a captain approves (or rejects) them.
  if (!isApproved(campUser, user.primaryEmail)) {
    redirect("/pending-approval");
  }

  const initials = initialsFrom(campUser.displayName ?? user.primaryEmail);

  // Map the stored rank (+ derived team-lead) onto the control panel's three
  // layers. Captains unlock the captain layer (and Camp Management); a lead
  // of any team unlocks the team-lead layer; everyone else sees their own.
  const viewerRank: ControlPanelLayer["rank"] =
    campUser.rank === "captain"
      ? "captain"
      : (await isTeamLead(campUser.id))
        ? "team_lead"
        : "camp_member";

  return (
    <ControlPanel
      layers={homeLayers}
      viewerRank={viewerRank}
      header={
        <HomeHeader initials={initials} imageUrl={campUser.profileImageUrl} />
      }
      centre={{ label: "TALK" }}
    />
  );
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
      href: "/tools",
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
      label: "Camp Management",
      hint: "Roster & statuses",
      href: "/captains/camp-management",
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
