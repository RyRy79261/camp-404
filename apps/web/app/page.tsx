import { redirect } from "next/navigation";
import { Divider } from "@camp404/ui/components/divider";
import { TopChrome } from "@camp404/ui/components/top-chrome";
import { getAuthenticatedUser } from "@/lib/auth";
import { isCampBootstrapped } from "@/lib/bootstrap";
import {
  ensureCampUser,
  getPendingQuestionnaires,
  isTeamLead,
} from "@/lib/users";
import { memberBlock } from "@/lib/member-gate";
import { deriveViewerRank, requireClearance } from "@camp404/core";
import { countUnread } from "@/lib/notifications";
import { initialsFrom } from "@/lib/initials";
import { LandingHero } from "./landing-hero";
import { HomeClient } from "./home/home-client";
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

  // First-time setup — on a fresh system (no captain yet) the first signed-in
  // person is routed to the setup wizard to become the founding captain,
  // before any invite/onboarding gating. This is the universal bootstrap path
  // (god accounts included), so a fresh deploy never needs hand-run SQL.
  if (!(await isCampBootstrapped())) {
    redirect("/setup");
  }

  // The member ladder every member page shares (lib/member-gate): an invite
  // (god accounts bypass), any blocking questionnaire, a finished burner
  // profile, then captain approval. Each rung redirects to the page that
  // clears it.
  const campUser = await ensureCampUser(user);
  const block = await memberBlock(campUser, user.primaryEmail);
  if (block) redirect(block.href);

  const initials = initialsFrom(campUser.displayName ?? user.primaryEmail);
  // Kick off the unread count alongside the team-lead probe below rather than
  // serially before it. The bell also counts every questionnaire still waiting
  // on this member: reading the inbox clears the unread count, but not these,
  // which stay until the form is finished.
  const unreadPromise = Promise.all([
    countUnread(campUser.id),
    getPendingQuestionnaires(campUser.id),
  ]).then(([unread, pending]) => unread + pending.length);

  // Map the stored rank (+ derived team-lead) onto the viewer clearance ladder.
  // Captains clear every group; a lead of any team clears their own + member
  // groups; everyone else clears only the member group.
  const viewerRank = deriveViewerRank(
    campUser.rank,
    await isTeamLead(campUser.id),
  );

  const unreadNotifications = await unreadPromise;

  // Per-group preview-but-locked gate, enforced server-side: the locked group
  // ids are computed here (the security decision, D3) and passed to the client
  // island, which renders those groups' CaptainLock with no tiles. The static
  // tile catalogue itself is non-sensitive; the real data gate is each
  // destination route.
  const lockedGroupIds = TILE_CATALOGUE.filter(
    (group) => !requireClearance(viewerRank, group.rank).cleared,
  ).map((group) => group.id);

  return (
    <>
      <TopChrome
        avatarInitials={initials}
        avatarImageUrl={campUser.profileImageUrl}
        unreadCount={unreadNotifications}
      />
      {/* The root layout applies no width cap, so the surface owns its shell. */}
      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 py-5">
        <HomeClient lockedGroupIds={lockedGroupIds} />

        <Divider />
        {/* Web push opt-in — only for authenticated members; renders nothing
            unless notifications are supported and undecided. */}
        <EnablePush />
      </main>
    </>
  );
}
