import "server-only";

import { randomUUID } from "node:crypto";
import {
  campEventRefusal,
  hasMinutes,
  MEETING_HAS_MINUTES,
  type CampEventKind,
} from "@camp404/core";
import {
  campEventStart,
  EVENT_CHANGED,
  EVENT_GONE,
  type CampEventFields,
  type CampEventRow,
  type CampEventWriteResult,
} from "@camp404/db/camp-events";
import type { Team } from "@camp404/types";
import { testStore } from "./test-store";

// The in-memory twins of the Calendar's own events and meetings
// (@camp404/db/camp-events), for E2E_TEST_MODE. The same rules, sentences and
// results over the store's own rows: a captain, or a lead of the event's team
// (before and after a change), makes, changes and removes one; a whole-camp
// event is a captain's; each change is a compare-and-set on the version; a
// meeting's note is made and kept in step with it; a meeting with minutes is
// never removed. The store keeps no audit log and is one synchronous process,
// so there is nothing to lock. Kept apart from test-store.ts, which calls in
// here only to reset.

const KEY = "__camp404CampEventsTestStore__";

function rows(): CampEventRow[] {
  const g = globalThis as Record<string, unknown>;
  g[KEY] ??= [] as CampEventRow[];
  return g[KEY] as CampEventRow[];
}

export function resetCampEventsStore(): void {
  rows().length = 0;
}

const copy = (row: CampEventRow): CampEventRow => ({ ...row });

function refusal(actorId: string, team: Team | null): string | null {
  return campEventRefusal(testStore.senderReach(actorId), team);
}

export const campEventsTestStore = {
  listCampEvents(input: {
    from: string;
    to: string;
    withRemoved?: boolean;
  }): CampEventRow[] {
    return rows()
      .filter(
        (r) =>
          r.startDate <= input.to &&
          r.endDate >= input.from &&
          (input.withRemoved || r.removedAt === null),
      )
      .sort(
        (a, b) =>
          a.startDate.localeCompare(b.startDate) ||
          (a.startTime ?? "").localeCompare(b.startTime ?? ""),
      )
      .map(copy);
  },

  getCampEvent(calendarEventId: string): CampEventRow | null {
    const row = rows().find(
      (r) => r.calendarEventId === calendarEventId && r.removedAt === null,
    );
    return row ? copy(row) : null;
  },

  getCampEventRow(id: string): CampEventRow | null {
    const row = rows().find((r) => r.id === id);
    return row ? copy(row) : null;
  },

  listCampEventsToSync(): CampEventRow[] {
    return rows()
      .filter((r) => r.calendarSyncedVersion !== r.version)
      .map(copy);
  },

  createCampEvent(
    input: CampEventFields & {
      actorId: string;
      kind: CampEventKind;
      agenda: string;
      newEventId: string;
    },
  ): CampEventWriteResult<{ row: CampEventRow; noteId: string | null }> {
    const refused = refusal(input.actorId, input.team);
    if (refused) return { ok: false, error: refused };
    const now = new Date();
    const row: CampEventRow = {
      id: randomUUID(),
      cycle: testStore.currentCycleNumber(),
      kind: input.kind,
      team: input.team,
      title: input.title,
      allDay: input.allDay,
      startDate: input.startDate,
      endDate: input.allDay ? input.endDate : input.startDate,
      startTime: input.allDay ? null : input.startTime,
      endTime: input.allDay ? null : input.endTime,
      place: input.place,
      description: input.description,
      calendarEventId: input.newEventId,
      calendarSyncedVersion: null,
      version: 1,
      removedAt: null,
      createdByUserId: input.actorId,
      updatedAt: now,
    };
    rows().push(row);
    const noteId =
      input.kind === "meeting"
        ? testStore.meetingNoteForEvent.add({
            calendarEventId: row.calendarEventId,
            team: row.team,
            title: row.title,
            heldAt: campEventStart(row),
            agenda: input.agenda,
            actorId: input.actorId,
          })
        : null;
    return { ok: true, row: copy(row), noteId };
  },

  editCampEvent(
    input: CampEventFields & {
      actorId: string;
      calendarEventId: string;
      expectedVersion: number;
    },
  ): CampEventWriteResult<{ row: CampEventRow }> {
    const row = rows().find(
      (r) => r.calendarEventId === input.calendarEventId && !r.removedAt,
    );
    if (!row) return { ok: false, error: EVENT_GONE };
    const refused =
      refusal(input.actorId, row.team) ??
      (input.team !== row.team ? refusal(input.actorId, input.team) : null);
    if (refused) return { ok: false, error: refused };
    if (row.version !== input.expectedVersion) {
      return { ok: false, error: EVENT_CHANGED };
    }
    Object.assign(row, {
      team: input.team,
      title: input.title,
      allDay: input.allDay,
      startDate: input.startDate,
      endDate: input.allDay ? input.endDate : input.startDate,
      startTime: input.allDay ? null : input.startTime,
      endTime: input.allDay ? null : input.endTime,
      place: input.place,
      description: input.description,
      version: row.version + 1,
      updatedAt: new Date(),
    });
    if (row.kind === "meeting") {
      testStore.meetingNoteForEvent.follow(row.calendarEventId, {
        team: row.team,
        title: row.title,
        heldAt: campEventStart(row),
      });
    }
    return { ok: true, row: copy(row) };
  },

  removeCampEvent(input: {
    actorId: string;
    calendarEventId: string;
    expectedVersion: number;
  }): CampEventWriteResult<{ row: CampEventRow }> {
    const row = rows().find(
      (r) => r.calendarEventId === input.calendarEventId && !r.removedAt,
    );
    if (!row) return { ok: false, error: EVENT_GONE };
    const refused = refusal(input.actorId, row.team);
    if (refused) return { ok: false, error: refused };
    if (row.version !== input.expectedVersion) {
      return { ok: false, error: EVENT_CHANGED };
    }
    const minutes = testStore.meetingNoteForEvent.minutes(row.calendarEventId);
    if (minutes && hasMinutes(minutes)) {
      return { ok: false, error: MEETING_HAS_MINUTES };
    }
    testStore.meetingNoteForEvent.drop(row.calendarEventId);
    Object.assign(row, {
      removedAt: new Date(),
      version: row.version + 1,
      updatedAt: new Date(),
    });
    return { ok: true, row: copy(row) };
  },

  markCampEventCalendarSynced(input: {
    id: string;
    version: number;
    removed: boolean;
  }): boolean {
    const list = rows();
    const at = list.findIndex(
      (r) => r.id === input.id && r.version === input.version,
    );
    if (at === -1) return false;
    if (input.removed) {
      if (!list[at]!.removedAt) return false;
      list.splice(at, 1);
      return true;
    }
    list[at]!.calendarSyncedVersion = input.version;
    return true;
  },
};
