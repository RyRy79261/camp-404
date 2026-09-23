import { redirect } from "next/navigation";
import { deriveViewerRank } from "@camp404/core";
import { getAuthenticatedUser } from "@/lib/auth";
import { isCampBootstrapped } from "@/lib/bootstrap";
import { getTeamsConfig, teamLabelMap } from "@/lib/camp-config";
import { getUpcomingEvents } from "@/lib/google-calendar";
import { buildHome } from "@/lib/home";
import { getInboxBadge } from "@/lib/inbox-badge";
import { getMyLift } from "@/lib/lifts";
import { resolveMemberState } from "@/lib/member-gate";
import { countUnreadByTeam } from "@/lib/notifications";
import { isSignInSecured } from "@/lib/sign-in-security";
import { getMyTeams, getPendingQuestionnaires } from "@/lib/users";
import { HomeView } from "@/components/home/home-view";
import { EnablePush } from "@/components/push/enable-push";
import { LandingHero } from "../landing-hero";

// Reads the sign-in session cookie on every request, so can't be
// statically prerendered.
export const dynamic = "force-dynamic";

/**
 * Home. Signed out, the landing page. Signed in, the member's OWN page (owner,
 * 2026-09-23): what they need to do, what's coming up, and the few places that
 * are theirs, built from their profile and status. The whole-camp view moved to
 * /captains/overview.
 *
 * The member ladder still applies — a fresh member goes to the invite gate or
 * the Burner Bio first — with one change: someone waiting for approval lands
 * here and is told so, rather than on a separate page. A declined applicant
 * still goes to /pending-approval, which gives the captain's reason.
 */
export default async function HomePage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return <LandingHero />;
  }

  // First-time setup: on a fresh system (no captain yet) the first signed-in
  // person becomes the founding captain, before any invite or onboarding gate.
  if (!(await isCampBootstrapped())) {
    redirect("/setup");
  }

  const state = await resolveMemberState();
  if (state.kind === "signed_out") redirect("/auth/sign-in");
  const { campUser, block } = state;
  const waiting =
    block?.reason === "approval" && campUser.approvalStatus === "pending";
  if (block && !waiting) redirect(block.href);

  const approval = waiting ? "pending" : "approved";
  const [
    memberships,
    pending,
    inbox,
    unreadByTeam,
    lift,
    secured,
    teamsConfig,
    calendar,
  ] = await Promise.all([
    waiting ? Promise.resolve([]) : getMyTeams(campUser.id),
    waiting ? Promise.resolve([]) : getPendingQuestionnaires(campUser.id),
    // The Announcements tile shows the bell's own count, for every member,
    // waiting for approval or not: both come from getInboxBadge.
    getInboxBadge(campUser.id),
    waiting
      ? Promise.resolve({} as Partial<Record<string, number>>)
      : countUnreadByTeam(campUser.id),
    waiting ? Promise.resolve(null) : getMyLift(campUser.id),
    isSignInSecured(),
    getTeamsConfig(),
    waiting ? Promise.resolve(null) : getUpcomingEvents(),
  ]);
  const labels = teamLabelMap(teamsConfig);
  const isCaptain =
    deriveViewerRank(
      campUser.rank,
      memberships.some((m) => m.isLead),
    ) === "captain";

  const home = buildHome({
    now: new Date(),
    approval,
    firstName: campUser.displayName?.trim().split(/\s+/)[0] ?? null,
    isCaptain,
    teams: memberships.map((m) => ({
      key: m.team,
      label: labels[m.team] ?? m.team,
      isLead: m.isLead,
      unread: unreadByTeam[m.team] ?? 0,
    })),
    pending,
    inbox,
    lift,
    calendar,
    secured,
  });

  return (
    <div className="flex flex-col gap-6">
      <HomeView home={home} />
      {/* Web push opt-in; renders nothing unless push is supported and the
          member has not decided yet. */}
      <EnablePush />
    </div>
  );
}
