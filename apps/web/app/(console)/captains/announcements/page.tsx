import { Team } from "@camp404/types";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { listAnnouncements } from "@/lib/notifications";
import { activeTeams, getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { getLeadTeams } from "@/lib/users";
import {
  AnnouncementsManager,
  type AudienceOption,
} from "./announcements-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Announcements — Camp 404" };

// The announcements composer, laid out like the AfrikaBurn console's bulletins.
// Captains post to the camp or any team; a team lead posts only to the teams
// they lead (owner's call, 2026-09-16), and sees only their own announcements. Preview-but-locked (D3):
// anyone else sees the heading + a CaptainLock instead of a redirect, and the
// server never fetches announcement data for them.

export default async function AnnouncementsPage() {
  const gate = await captainPageGate("team_lead");
  const { campUser } = gate;
  const isCaptain = gate.rank === "captain";
  const leadTeams =
    gate.cleared && !isCaptain
      ? (await getLeadTeams(campUser.id)).filter(
          (t) => Team.safeParse(t).success,
        )
      : [];
  const cleared = gate.cleared && (isCaptain || leadTeams.length > 0);

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
    <div className="flex flex-col">
      <PageHeading
        eyebrow={
          gate.cleared && !isCaptain
            ? "Team leads / Announcements"
            : "Captains / Announcements"
        }
        title="Announcements & notifications"
        description={`${
          isCaptain
            ? "Compose a message, save it as a draft, then publish it to the whole camp or one team. Everyone in it but you receives it."
            : "Compose a message for a team you lead, save it as a draft, then publish it. Everyone on the team but you receives it."
        } A full-screen announcement takes over each member's screen until they acknowledge it.`}
      />

      {cleared ? (
        <AnnouncementsManager
          announcements={announcements}
          currentUserId={campUser.id}
          audienceOptions={audienceOptions}
          teamLabels={teamLabels}
        />
      ) : (
        <CaptainLock
          title="Team leads and captains only"
          message="Announcements are for team leads and captains. Your rank doesn’t have clearance for this."
        />
      )}
    </div>
  );
}
