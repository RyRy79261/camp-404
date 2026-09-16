import { redirect } from "next/navigation";
import { deriveViewerRank, requireClearance } from "@camp404/core";
import { Team } from "@camp404/types";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { listAnnouncements } from "@/lib/notifications";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { activeTeams, getTeamsConfig } from "@/lib/camp-config";
import {
  ensureCampUser,
  getLeadTeams,
  hasCampAccess,
  isApproved,
  isTeamLead,
} from "@/lib/users";
import {
  AnnouncementsManager,
  type AudienceOption,
} from "./announcements-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Announcements — Camp 404" };

// The announcements composer (board S18). Captains post to the camp or any
// team; a team lead posts only to the teams they lead (owner's call,
// 2026-09-16), and sees only their own announcements. Preview-but-locked (D3):
// anyone else sees the chrome + a CaptainLock instead of a redirect, and the
// server never fetches announcement data for them.

export default async function AnnouncementsPage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  if (!isApproved(campUser, authUser.primaryEmail)) {
    redirect("/pending-approval");
  }
  // The bar is `team_lead`, so the real lead flag is required here.
  const isCaptain = campUser.rank === "captain";
  const viewerRank = deriveViewerRank(
    campUser.rank,
    isCaptain ? false : await isTeamLead(campUser.id),
  );
  const leadTeams = isCaptain
    ? []
    : (await getLeadTeams(campUser.id)).filter(
        (t) => Team.safeParse(t).success,
      );
  const cleared =
    requireClearance(viewerRank, "team_lead").cleared &&
    (isCaptain || leadTeams.length > 0);

  // Withhold the data server-side when locked — never fetch what we won't send.
  const config = cleared ? await getTeamsConfig() : null;
  const teams = config ? activeTeams(config) : [];
  const teamLabels = Object.fromEntries(teams.map((t) => [t.key, t.label]));
  const announcements = cleared
    ? await listAnnouncements(isCaptain ? {} : { senderId: campUser.id })
    : [];
  // Only what this sender may pick. The actions check it again.
  const audienceOptions: AudienceOption[] = isCaptain
    ? [
        { value: "everyone", label: "Everyone in camp" },
        ...teams.map((t) => ({ value: `team:${t.key}`, label: t.label })),
      ]
    : leadTeams.map((key) => ({
        value: `team:${key}`,
        label: teamLabels[key] ?? key,
      }));

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      {isCaptain ? (
        <GhostBack href="/captains/tools" className="-ml-2 mb-4">
          Camp tools
        </GhostBack>
      ) : (
        <GhostBack href="/" className="-ml-2 mb-4">
          Home
        </GhostBack>
      )}
      <header className="mb-6">
        <h1 className="text-2xl font-bold">
          Announcements &amp; notifications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isCaptain
            ? "Compose a message, save it as a draft, then publish it to the whole camp or one team. Everyone in it but you receives it."
            : "Compose a message for a team you lead, save it as a draft, then publish it. Everyone on the team but you receives it."}{" "}
          A full-screen announcement takes over each member&apos;s screen until
          they acknowledge it.
        </p>
      </header>

      {cleared ? (
        <AnnouncementsManager
          announcements={announcements}
          currentUserId={campUser.id}
          audienceOptions={audienceOptions}
          teamLabels={teamLabels}
        />
      ) : (
        <CaptainLock />
      )}
    </main>
  );
}
