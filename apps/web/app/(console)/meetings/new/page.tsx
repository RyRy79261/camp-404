import { redirect } from "next/navigation";
import { campDayKey } from "@camp404/core";
import { captainPageGate } from "@/lib/captain-gate";
import { calendarHref } from "@/lib/calendar-month";

export const dynamic = "force-dynamic";

// A meeting is now made in the Calendar (owner, 2026-10-10: "you make events
// in the calendar app"): an old "New meeting" link opens this month's
// meetings there. Captains and team leads add one with New event.

export default async function NewMeetingPage() {
  await captainPageGate("camp_member");
  const today = campDayKey(new Date());
  redirect(
    calendarHref({
      view: "month",
      month: today.slice(0, 7),
      when: "upcoming",
      team: null,
      type: "meetings",
      event: null,
      newOn: null,
    }),
  );
}
