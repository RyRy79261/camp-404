import { notFound, redirect } from "next/navigation";
import { programPage } from "@/lib/program-page";
import { getMeetingNote } from "@/lib/meeting-notes";

export const dynamic = "force-dynamic";

// An old link to edit a meeting's notes opens its minutes in the Calendar.

export default async function EditMeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await programPage("calendar");
  const { id } = await params;
  const note = await getMeetingNote(id);
  if (!note?.calendarEventId) notFound();
  redirect(`/calendar/${encodeURIComponent(note.calendarEventId)}/minutes`);
}
