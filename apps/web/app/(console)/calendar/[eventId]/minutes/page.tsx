import { notFound } from "next/navigation";
import { canWorkInTeam } from "@camp404/core";
import { CALENDAR_EVENT_ID, Team } from "@camp404/types";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { MinutesEditor } from "@/components/calendar/minutes-editor";
import { getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { calendarHref, entryWhen } from "@/lib/calendar-month";
import { findCalendarEntry } from "@/lib/calendar-page";
import { listTeamPeople } from "@/lib/roster";
import { listAssignableMembers } from "@/lib/tasks";
import { getMyTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Minutes — Camp 404" };

// A meeting's agenda and minutes (#268; owner, 2026-10-10: a meeting is an
// event on the calendar). Its team's members this year and captains write
// them; a whole-camp meeting's are captains'. Anyone else sees the heading
// and a lock, and the server sends no member list. An event made in Google
// that is not a meeting yet becomes one with its first minutes. The write
// checks the rule again inside its transaction, and saves only over the
// version this page opened.

export default async function MinutesPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { campUser, rank } = await captainPageGate("camp_member");
  const { eventId } = await params;
  // The param is already decoded; an id that is not an event's is no page.
  if (!CALENDAR_EVENT_ID.test(eventId)) notFound();
  const config = await getTeamsConfig();
  const teams = config.teams.map((t) => ({ key: t.key, label: t.label }));
  const [found, memberships] = await Promise.all([
    findCalendarEntry(eventId, teams),
    getMyTeams(campUser.id),
  ]);
  if (!found) notFound();
  const { entry, note } = found;
  // Only a meeting has minutes, or an event made in Google that becomes one.
  if (entry.kind !== "meeting" && entry.source !== "google") notFound();

  const teamKey = entry.team?.key ?? null;
  const teamLabel = entry.team?.label ?? "Whole camp";
  const title =
    entry.kind === "meeting" ? entry.title : `${entry.title}: minutes`;
  if (
    !canWorkInTeam(
      rank,
      memberships.map((m) => m.team),
      teamKey,
    )
  ) {
    return (
      <div className="flex flex-col">
        <PageHeading eyebrow="Camp / Calendar" title={title} />
        <CaptainLock
          title={teamKey ? "The team's members only" : "Captains only"}
          message={
            teamKey
              ? "A team's members and captains write its meetings' minutes. You can read them on the Calendar."
              : "Captains write whole-camp meetings' minutes. You can read them on the Calendar."
          }
        />
      </div>
    );
  }

  const [members, people] = await Promise.all([
    listAssignableMembers(),
    teamKey && Team.safeParse(teamKey).success
      ? listTeamPeople(teamKey as Team)
      : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Camp / Calendar"
        title={title}
        description={`${teamLabel} · ${entryWhen(entry)}`}
      />
      <MinutesEditor
        target={{
          eventId: entry.id,
          version: note?.version ?? null,
          team: teamKey,
          teamLabel,
          returnHref: calendarHref({
            view: "month",
            month: entry.startDay.slice(0, 7),
            when: "upcoming",
            team: null,
            type: "all",
            event: entry.id,
            newOn: null,
          }),
        }}
        initial={{
          agenda: note?.agenda ?? "",
          notes: note?.notes ?? "",
          // Nobody is ticked for the writer: ticking who came is minutes,
          // and an agenda written before the meeting is not.
          attendeeIds: note?.attendees.map((a) => a.id) ?? [],
          decisions: note?.decisions.map((d) => d.text) ?? [],
          actionItems:
            note?.actionItems.map((i) => ({
              id: i.id,
              text: i.text,
              assigneeId: i.assigneeId,
              due: i.dueOn ?? "",
              onBoard: i.task !== null,
            })) ?? [],
        }}
        members={members}
        teamPeople={people.map((p) => p.id)}
        formerAttendees={
          note?.attendees.filter((a) => !members.some((m) => m.id === a.id)) ??
          []
        }
      />
    </div>
  );
}
