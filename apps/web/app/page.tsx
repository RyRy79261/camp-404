import { redirect } from "next/navigation";
import { Divider } from "@camp404/ui/components/divider";
import { TopChrome } from "@camp404/ui/components/top-chrome";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  ensureCampUser,
  getBurnerProfile,
  getPendingRequiredActions,
  hasCampAccess,
  isApproved,
  isTeamLead,
} from "@/lib/users";
import { nextGate } from "@/lib/required-actions";
import { deriveViewerRank, requireClearance } from "@camp404/core";
import { countUnread } from "@/lib/notifications";
import { initialsFrom } from "@/lib/initials";
import { LandingHero } from "./landing-hero";
import { RankGroupCard } from "./home/rank-group-card";
import { TILE_CATALOGUE } from "./home/tile-catalogue";
import { EnablePush } from "@/components/push/enable-push";

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

  // Generic required_actions gate — the canonical "what blocks this user"
  // mechanism. Routes to the first pending blocking action's bespoke page
  // (today: the burner profile; future questionnaires slot in via the registry).
  const gate = nextGate(await getPendingRequiredActions(campUser.id));
  if (gate) redirect(gate);

  // Belt-and-braces fallback (one release): until every member is guaranteed a
  // seeded burner_profile required action, also honour the legacy completedAt
  // check. Drop once required_actions seeding is confirmed in prod.
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
  // Kick off the unread count alongside the team-lead probe below rather than
  // serially before it.
  const unreadPromise = countUnread(campUser.id);

  // Map the stored rank (+ derived team-lead) onto the viewer clearance ladder.
  // Captains clear every group; a lead of any team clears their own + member
  // groups; everyone else clears only the member group.
  const viewerRank = deriveViewerRank(
    campUser.rank,
    await isTeamLead(campUser.id),
  );

  const unreadNotifications = await unreadPromise;

  return (
    <>
      <TopChrome
        avatarInitials={initials}
        avatarImageUrl={campUser.profileImageUrl}
        unreadCount={unreadNotifications}
      />
      {/* The root layout applies no width cap, so the surface owns its shell. */}
      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 py-5">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-section font-bold text-foreground">
            Control panel
          </h1>
          <p className="text-xs text-muted-foreground">
            Everything you can run. Captain first.
          </p>
        </div>

        {/* Per-group preview-but-locked gate, enforced server-side: a locked
            group is sent no tiles — only its head + the CaptainLock render
            (decision D3 — withhold data, don't dim a populated render). */}
        {TILE_CATALOGUE.map((group) => {
          const { cleared } = requireClearance(viewerRank, group.rank);
          return (
            <RankGroupCard
              key={group.id}
              name={group.name}
              icon={group.groupIcon}
              chipTone={group.chipTone}
              locked={!cleared}
              tiles={cleared ? group.tiles : []}
              toolCount={cleared ? group.tiles.length : undefined}
            />
          );
        })}

        <Divider />
        {/* Web push opt-in — only for authenticated members; renders nothing
            unless notifications are supported and undecided. */}
        <EnablePush />
      </main>
    </>
  );
}
