import { redirect } from "next/navigation";
import { campDayKey } from "@camp404/core";
import { captainPageGate } from "@/lib/captain-gate";
import { calendarHref } from "@/lib/calendar-month";
import { getMeetingNote } from "@/lib/meeting-notes";

export const dynamic = "force-dynamic";

// An old link to one meeting's notes (a search result, a task's "From the
// meeting", a message) opens that meeting in the Calendar, on its month. A
// note the link no longer finds lands on the list of past meetings.

export default async function MeetingNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await captainPageGate("camp_member");
  const { id } = await params;
  const note = await getMeetingNote(id);
  const today = campDayKey(new Date());
  redirect(
    note?.calendarEventId
      ? calendarHref({
          view: "month",
          month: campDayKey(note.heldAt).slice(0, 7),
          when: "upcoming",
          team: null,
          type: "all",
          event: note.calendarEventId,
          newOn: null,
        })
      : calendarHref({
          view: "list",
          month: today.slice(0, 7),
          when: "past",
          team: null,
          type: "meetings",
          event: null,
          newOn: null,
        }),
  );
}
