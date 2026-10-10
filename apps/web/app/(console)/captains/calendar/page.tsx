import { redirect } from "next/navigation";
import { campDayKey } from "@camp404/core";
import { captainPageGate } from "@/lib/captain-gate";
import { calendarHref } from "@/lib/calendar-month";

export const dynamic = "force-dynamic";

// Events are added in the Calendar now (owner, 2026-10-10: "you make events
// in the calendar app"): the old Add an event page opens the Calendar's New
// event form on today. The form offers only what the person may add, and the
// write checks it again.

export default async function AddEventPage() {
  await captainPageGate("camp_member");
  const today = campDayKey(new Date());
  redirect(
    calendarHref({
      view: "month",
      month: today.slice(0, 7),
      when: "upcoming",
      team: null,
      type: "all",
      event: null,
      newOn: today,
    }),
  );
}
