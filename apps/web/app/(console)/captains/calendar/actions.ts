"use server";

import { revalidatePath } from "next/cache";
import { campDayKey } from "@camp404/core";
import { NOT_AN_EVENT_AUTHOR } from "@camp404/db/calendar-events";
import { AddCalendarEventInput } from "@camp404/types";
import { addCalendarEvent } from "@/lib/camp-calendar";
import { activeTeams, getTeamsConfig } from "@/lib/camp-config";
import { captainActionGate } from "@/lib/captain-gate";
import { runAction, type ActionResult } from "@/lib/action-result";

// Adding a camp calendar event. The gate here answers the screen; the rule
// (a lead only for a team they lead) is checked again inside the write's
// transaction, which also records the event in the audit log.

/** Put an event on the camp calendar. */
export async function addCalendarEventAction(
  input: unknown,
): Promise<ActionResult<{ eventId: string }>> {
  return runAction("addCalendarEventAction", async () => {
    const gate = await captainActionGate("team_lead", NOT_AN_EVENT_AUTHOR);
    if (!gate.ok) return gate;

    const parsed = AddCalendarEventInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error:
          parsed.error.issues[0]?.message ?? "Check the event and try again.",
      };
    }
    const event = parsed.data;
    // Today counts: the camp's day, not the server's.
    if (event.date < campDayKey(new Date())) {
      return { ok: false, error: "Pick today or a later date." };
    }

    const config = await getTeamsConfig();
    const team = event.team
      ? activeTeams(config).find((t) => t.key === event.team)
      : null;
    if (event.team && !team) {
      return {
        ok: false,
        error: "That team isn't active any more. Pick another team.",
      };
    }

    const result = await addCalendarEvent({
      actorId: gate.campUser.id,
      input: event,
      teamLabel: team?.label ?? null,
    });
    if (!result.ok) return result;
    revalidatePath("/");
    return { ok: true, data: { eventId: result.eventId } };
  });
}
