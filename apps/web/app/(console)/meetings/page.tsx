import { redirect } from "next/navigation";
import { campDayKey } from "@camp404/core";
import { getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { calendarHref, WHOLE_CAMP } from "@/lib/calendar-month";

export const dynamic = "force-dynamic";

// The Meetings program went away (owner, 2026-10-10: "Meetings is a type of
// calendar item, it shouldn't be a separate app"). Its list lives on as the
// Calendar's list of past meetings, so an old link (a bookmark, a team
// folder's shortcut, a message) lands there, its team filter kept.

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  await captainPageGate("camp_member");
  const [{ team }, config] = await Promise.all([
    searchParams,
    getTeamsConfig(),
  ]);
  const today = campDayKey(new Date());
  redirect(
    calendarHref({
      view: "list",
      month: today.slice(0, 7),
      when: "past",
      team:
        team === WHOLE_CAMP || config.teams.some((t) => t.key === team)
          ? (team ?? null)
          : null,
      type: "meetings",
      event: null,
      newOn: null,
    }),
  );
}
