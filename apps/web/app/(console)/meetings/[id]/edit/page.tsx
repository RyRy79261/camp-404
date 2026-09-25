import { notFound } from "next/navigation";
import { campDayKey, canWorkInTeam, meetingTimeKey } from "@camp404/core";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { getUpcomingEvents } from "@/lib/camp-calendar";
import { getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { CALENDAR_PAGE_RANGE } from "@/lib/google-calendar";
import { getMeetingNote } from "@/lib/meeting-notes";
import { meetingEventOptions } from "@/lib/meeting-notes-view";
import { listTeamPeople } from "@/lib/roster";
import { listAssignableMembers } from "@/lib/tasks";
import { getMyTeams } from "@/lib/users";
import { MeetingEditor, WHOLE_CAMP } from "../../meeting-editor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Edit meeting — Camp 404" };

// Change a meeting note (#268): its team's members this year and captains.
// Anyone else sees the heading and a lock, and the server sends no member
// list. The write checks the rule again inside its transaction, and saves only
// over the version this page opened.

export default async function EditMeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { campUser, rank } = await captainPageGate("camp_member");
  const { id } = await params;
  const [note, memberships] = await Promise.all([
    getMeetingNote(id),
    getMyTeams(campUser.id),
  ]);
  if (!note) notFound();

  if (
    !canWorkInTeam(
      rank,
      memberships.map((m) => m.team),
      note.team,
    )
  ) {
    return (
      <div className="flex flex-col">
        <PageHeading eyebrow="Camp / Meetings" title={note.title} />
        <CaptainLock
          title={note.team ? "The team's members only" : "Captains only"}
          message={
            note.team
              ? "A team's members and captains edit its meeting notes. You can read this one."
              : "Captains edit whole-camp meeting notes. You can read this one."
          }
        />
      </div>
    );
  }

  const [config, members, calendar, people] = await Promise.all([
    getTeamsConfig(),
    listAssignableMembers(),
    getUpcomingEvents(CALENDAR_PAGE_RANGE),
    note.team ? listTeamPeople(note.team) : Promise.resolve([]),
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
        title={`Edit ${note.title}`}
        description="Action items already on the task board keep their words here; change them on the board."
      />
      <MeetingEditor
        mode={{
          kind: "edit",
          noteId: note.id,
          version: note.version,
          team: note.team ?? WHOLE_CAMP,
        }}
        initial={{
          title: note.title,
          date: campDayKey(note.heldAt),
          time: meetingTimeKey(note.heldAt),
          calendarEventId: note.calendarEventId,
          agenda: note.agenda,
          notes: note.notes,
          attendeeIds: note.attendees.map((a) => a.id),
          decisions: note.decisions.map((d) => d.text),
          actionItems: note.actionItems.map((i) => ({
            id: i.id,
            text: i.text,
            assigneeId: i.assigneeId,
            due: i.dueOn ?? "",
            onBoard: i.task !== null,
          })),
        }}
        members={members}
        teamPeople={note.team ? { [note.team]: people.map((p) => p.id) } : {}}
        teamLabels={teamLabels}
        events={events}
      />
    </div>
  );
}
