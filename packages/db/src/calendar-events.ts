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
// for a team they lead this year. Nobody else. The rule is checked twice, each
// time inside a short transaction that holds the author's rank and lead flags
// (`lockSenderReach`, the announcements' rule): once before Google is called,
// and again when the audit row is written. Google is called between the two,
// with no transaction open, so a slow Google (a token exchange and an insert,
// up to about ten seconds) never holds the camp settings row, the author's
// rows or a pooled connection. If the second check refuses (the author lost
// the lead role while Google was working) or the audit row cannot be saved,
// the event is taken off Google again with `undo`, so no event stays on the
// calendar without its audit row.

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
 * once the rule has passed. `undo` takes it off Google again, and must not
 * throw; it is called when the rule fails on the second check (the result is
 * that refusal) or the audit row cannot be saved (the error is thrown on).
 */
export async function addCampCalendarEvent(input: {
  actorId: string;
  team: Team | null;
  title: string;
  date: string;
  allDay: boolean;
  create: () => Promise<string>;
  undo: (eventId: string) => Promise<unknown>;
}): Promise<AddCalendarEventResult> {
  const before = await withTransaction(async (tx) =>
    calendarEventRefusal(await lockSenderReach(tx, input.actorId), input.team),
  );
  if (before) return { ok: false, error: before };

  const eventId = await input.create();

  let after: string | null;
  try {
    after = await withTransaction(async (tx) => {
      const reach = await lockSenderReach(tx, input.actorId);
      const refusal = calendarEventRefusal(reach, input.team);
      if (refusal) return refusal;
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
      return null;
    });
  } catch (error) {
    await input.undo(eventId);
    throw error;
  }
  if (after) {
    await input.undo(eventId);
    return { ok: false, error: after };
  }
  return { ok: true, eventId };
}
