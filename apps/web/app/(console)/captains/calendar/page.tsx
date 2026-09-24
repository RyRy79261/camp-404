import { campDayKey } from "@camp404/core";
import { Team } from "@camp404/types";
import { Card, CardContent } from "@camp404/ui/components/card";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { isCalendarConnected } from "@/lib/camp-calendar";
import { activeTeams, getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { getLeadTeams } from "@/lib/users";
import { EventComposer, type EventTeamOption } from "./event-composer";

export const dynamic = "force-dynamic";

export const metadata = { title: "Add an event — Camp 404" };

// Add an event to the camp's shared Google Calendar (owner, 2026-09-23: "It
// would be nice to manage or integrate that from here"). AfrikaBurn's console
// has no calendar screen, so this copies its nearest one, the new-bulletin
// page: the heading, then the composer. Reached from Home's "Add event" tile,
// not the nav.
//
// A captain adds for the whole camp or any team; a team lead only for a team
// they lead. Anyone else sees the heading and a lock, and the server sends no
// team list. The action checks the rule again, and the write checks it once
// more inside its transaction.

export default async function AddCalendarEventPage() {
  const gate = await captainPageGate("team_lead");
  const isCaptain = gate.rank === "captain";
  const leadTeams =
    gate.cleared && !isCaptain
      ? (await getLeadTeams(gate.campUser.id)).filter(
          (t) => Team.safeParse(t).success,
        )
      : [];
  const cleared = gate.cleared && (isCaptain || leadTeams.length > 0);
  const connected = cleared && isCalendarConnected();

  const config = connected ? await getTeamsConfig() : null;
  // Only what this author may pick. The action checks it again.
  const teams: EventTeamOption[] = config
    ? activeTeams(config)
        .filter((t) => isCaptain || leadTeams.includes(t.key))
        .map((t) => ({ value: t.key, label: t.label }))
    : [];

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Camp / Calendar"
        title="Add an event"
        description={
          isCaptain
            ? "Put an event on the camp's shared Google Calendar, for the whole camp or one team. It shows on Home under Coming up."
            : "Put an event on the camp's shared Google Calendar for a team you lead. It shows on Home under Coming up."
        }
      />

      {!cleared ? (
        <CaptainLock
          title="Team leads and captains only"
          message="Adding calendar events is for team leads and captains. Your rank doesn’t have clearance for this."
        />
      ) : !connected ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            The camp calendar isn&rsquo;t connected yet. A captain can connect
            it under System status.
          </CardContent>
        </Card>
      ) : (
        <EventComposer
          teams={teams}
          canPickWholeCamp={isCaptain}
          today={campDayKey(new Date())}
        />
      )}
    </div>
  );
}
