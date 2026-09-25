import { campDayKey, canWorkInTeam } from "@camp404/core";
import { Team } from "@camp404/types";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { getUpcomingEvents } from "@/lib/camp-calendar";
import { activeTeams, getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { CALENDAR_PAGE_RANGE } from "@/lib/google-calendar";
import {
  meetingEventOptions,
  WHOLE_CAMP_MEETINGS,
} from "@/lib/meeting-notes-view";
import { listTeamPeople } from "@/lib/roster";
import { listAssignableMembers } from "@/lib/tasks";
import { getMyTeams } from "@/lib/users";
import { MeetingEditor, WHOLE_CAMP } from "../meeting-editor";

export const dynamic = "force-dynamic";

export const metadata = { title: "New meeting — Camp 404" };

// Write up a meeting (#268). The page offers only the teams this writer may
// write for: the teams they are on this year, or, for a captain, every active
// team and the whole camp. Anyone else sees the heading and a lock, and the
// server sends no member list. The action checks the rule again, and the write
// once more inside its transaction.

export default async function NewMeetingPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { campUser, rank } = await captainPageGate("camp_member");
  const [config, memberships, { team: requested }] = await Promise.all([
    getTeamsConfig(),
    getMyTeams(campUser.id),
    searchParams,
  ]);
  const myTeams = memberships.map((m) => m.team);
  const isCaptain = rank === "captain";
  const teams = activeTeams(config)
    .filter((t) => Team.safeParse(t.key).success)
    .filter((t) => canWorkInTeam(rank, myTeams, t.key))
    .map((t) => ({ value: t.key, label: t.label }));

  if (teams.length === 0 && !isCaptain) {
    return (
      <div className="flex flex-col">
        <PageHeading eyebrow="Camp / Meetings" title="New meeting" />
        <CaptainLock
          title="Team members and captains only"
          message="A team's members write up its meetings. You're not on a team this year."
        />
      </div>
    );
  }

  const start =
    requested === WHOLE_CAMP_MEETINGS && isCaptain
      ? WHOLE_CAMP
      : teams.some((t) => t.value === requested)
        ? (requested as string)
        : (teams[0]?.value ?? WHOLE_CAMP);

  const [members, calendar, people] = await Promise.all([
    listAssignableMembers(),
    getUpcomingEvents(CALENDAR_PAGE_RANGE),
    Promise.all(
      teams.map(
        async (t) =>
          [
            t.value,
            (await listTeamPeople(t.value as Team)).map((p) => p.id),
          ] as const,
      ),
    ),
  ]);
  const teamLabels = Object.fromEntries(
    config.teams.map((t) => [t.key, t.label]),
  );
  const events =
    calendar.status === "ok"
      ? meetingEventOptions(
          calendar.events,
          config.teams.map((t) => ({ key: t.key, label: t.label })),
        )
      : [];

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Camp / Meetings"
        title="New meeting"
        description="The agenda, who came, what was said and decided, and who does what next. Write the agenda before the meeting and the rest after, or all of it at once."
      />
      <MeetingEditor
        mode={{
          kind: "new",
          teams,
          canPickWholeCamp: isCaptain,
          team: start,
        }}
        initial={{
          title: "",
          date: campDayKey(new Date()),
          time: "18:00",
          calendarEventId: null,
          agenda: "",
          notes: "",
          attendeeIds: [campUser.id],
          decisions: [],
          actionItems: [],
        }}
        members={members}
        teamPeople={Object.fromEntries(people)}
        teamLabels={teamLabels}
        events={events}
      />
    </div>
  );
}
