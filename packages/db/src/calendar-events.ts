import { lockSenderReach } from "./broadcasts";
import { writeAuditEvent } from "./audit";
import { withTransaction } from "./index";
import type * as schema from "./schema";

// Adding an event to the camp's shared Google Calendar (owner, 2026-09-23:
// "It would be nice to manage or integrate that from here"). The event lives
// in Google, not in this database; what lives here is the rule for who may add
// one and the audit row that records it.
//
// Who may add: a captain, for any team or the whole camp; a team lead, only
// for a team they lead this year. Nobody else. The rule is checked inside a
// transaction that holds the author's rank and lead flags (`lockSenderReach`,
// the announcements' rule), so a lead removed a moment ago cannot still add.
// Only then is Google called, and the audit row is written in the same
// transaction. If the audit row cannot be saved the transaction throws with
// the event already in Google; the caller undoes it (apps/web/lib/camp-calendar.ts).

type Team = (typeof schema.teamEnum.enumValues)[number];

export const NOT_AN_EVENT_AUTHOR =
  "Only captains and team leads can add calendar events.";
export const PICK_YOUR_EVENT_TEAM = "Pick a team you lead.";
export const NOT_YOUR_EVENT_TEAM =
  "You can add events only for a team you lead.";

export type AddCalendarEventResult =
  | { ok: true; eventId: string }
  | { ok: false; error: string };

/**
 * The reach rule on its own, shared with the E2E test store: `reach` is
 * `lockSenderReach`'s answer (undefined for a captain). Null when allowed.
 */
export function calendarEventRefusal(
  reach: readonly string[] | undefined,
  team: string | null,
): string | null {
  if (reach === undefined) return null;
  if (reach.length === 0) return NOT_AN_EVENT_AUTHOR;
  if (!team) return PICK_YOUR_EVENT_TEAM;
  if (!reach.includes(team)) return NOT_YOUR_EVENT_TEAM;
  return null;
}

/**
 * Add a camp calendar event, as a captain or a lead of its team, and record
 * it. `create` puts the event in Google and returns its id; it is called only
 * once the rule has passed.
 */
export async function addCampCalendarEvent(input: {
  actorId: string;
  team: Team | null;
  title: string;
  date: string;
  allDay: boolean;
  create: () => Promise<string>;
}): Promise<AddCalendarEventResult> {
  return await withTransaction(async (tx) => {
    const reach = await lockSenderReach(tx, input.actorId);
    const refusal = calendarEventRefusal(reach, input.team);
    if (refusal) return { ok: false, error: refusal };

    const eventId = await input.create();
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "calendar.event_created",
      target: `calendar_event:${eventId}`,
      metadata: {
        title: input.title,
        team: input.team,
        date: input.date,
        allDay: input.allDay,
      },
    });
    return { ok: true, eventId };
  });
}
