import "server-only";

import { randomUUID } from "node:crypto";
import {
  afrikaburnDate,
  afrikaburnDateMayBeSkipped,
  ATTENDANCE_ACTION_KEY,
  ATTENDANCE_ACTION_TITLE,
  ATTENDANCE_REF_TYPE,
  attendanceAnswered,
  attendanceAskNotification,
  attendanceIsOpen,
  campDayKey,
  canAskForAttendance,
  canManageDeadlines,
  isAskedForAttendance,
  type AttendanceEntry,
} from "@camp404/core";
import {
  CANNOT_SKIP_DATE,
  DATE_SET_FIRST,
  DEADLINE_CHANGED,
  MAX_DEADLINES,
  NOT_AN_AFRIKABURN_DATE,
  PICK_THE_DATE,
  NOT_A_DEADLINE_KEEPER,
  TOO_MANY_DEADLINES,
  type DeadlineRow,
  type DeadlineWriteResult,
} from "@camp404/db/deadlines";
import {
  ATTENDANCE_CHANGED,
  ATTENDANCE_NOT_A_MEMBER,
  attendanceClosed,
  NOT_AN_ATTENDANCE_ASKER,
  type AttendanceRead,
  type LogisticsWriteResult,
} from "@camp404/db/logistics";
import { reachRank } from "@camp404/db/power";
import {
  ATTENDANCE_PHASES,
  type AttendanceAnswer,
  type AttendancePhase,
} from "@camp404/types";
import { testStore } from "./test-store";

// The in-memory twins of the logistics attendance (@camp404/db/logistics) and
// the AfrikaBurn deadlines (@camp404/db/deadlines), for E2E_TEST_MODE. The
// same rules, sentences and results over the store's own rows: a member
// answers only for themselves, until the phase starts, as a compare-and-set
// on the answer they saw; only a captain asks everyone or keeps the
// deadlines; each deadline write is a compare-and-set on its version. The
// store keeps no audit log and is one synchronous process, so there is
// nothing to lock. "Ask everyone" opens the store's shared nudge, as the
// database does. Kept apart from test-store.ts, which calls in here only to
// reset.

interface LogisticsState {
  /** `${cycle}:${phase}:${userId}` -> answer. */
  answers: Map<string, AttendanceAnswer>;
  deadlines: (DeadlineRow & { createdAt: number })[];
}

const KEY = "__camp404LogisticsTestStore__";

function state(): LogisticsState {
  const g = globalThis as Record<string, unknown>;
  g[KEY] ??= { answers: new Map(), deadlines: [] } satisfies LogisticsState;
  return g[KEY] as LogisticsState;
}

/**
 * The founding year's twin for this store's rows (setFoundingYear's
 * logistics step): answers and deadlines written before the camp had a year
 * move onto it. Nothing can hold the founding year yet, so nothing collides.
 */
export function adoptLogisticsSentinel(from: number, year: number): void {
  const s = state();
  for (const [key, answer] of [...s.answers]) {
    const [cycle, ...rest] = key.split(":");
    if (Number(cycle) !== from) continue;
    s.answers.delete(key);
    s.answers.set([year, ...rest].join(":"), answer);
  }
  for (const d of s.deadlines) if (d.cycle === from) d.cycle = year;
}

/** Clear every attendance answer and deadline (testStore.reset calls this). */
export function resetLogisticsStore(): void {
  const s = state();
  s.answers.clear();
  s.deadlines.length = 0;
}

const nameOf = (userId: string) =>
  testStore.findUserById(userId)?.displayName?.trim() || "Unnamed burner";

const isMember = (userId: string) =>
  testStore.findUserById(userId)?.approvalStatus === "approved";

function answersOf(cycle: number): AttendanceEntry[] {
  const out: AttendanceEntry[] = [];
  for (const [key, answer] of state().answers) {
    const [year, phase, userId] = key.split(":") as [
      string,
      AttendancePhase,
      string,
    ];
    if (Number(year) !== cycle || !isMember(userId)) continue;
    out.push({ phase, userId, name: nameOf(userId), answer });
  }
  return out;
}

function comingOf(cycle: number): { userId: string; name: string }[] {
  return testStore
    .allUsers()
    .filter(
      (u) =>
        u.approvalStatus === "approved" &&
        isAskedForAttendance(
          testStore.getParticipation(u.id, cycle)?.status ?? null,
        ),
    )
    .map((u) => ({ userId: u.id, name: nameOf(u.id) }));
}

function openPhases(cycle: number, today: string): Set<AttendancePhase> {
  const starts = new Map(
    testStore.listLogisticsPhases(cycle).map((r) => [r.phase, r.startDate]),
  );
  return new Set(
    ATTENDANCE_PHASES.filter((p) => attendanceIsOpen(starts.get(p), today)),
  );
}

function answeredBy(cycle: number, userId: string): Set<AttendancePhase> {
  return new Set(
    answersOf(cycle)
      .filter((e) => e.userId === userId)
      .map((e) => e.phase),
  );
}

function keeper<T extends object>(
  actorId: string,
  fn: () => T | string,
): DeadlineWriteResult<T> {
  const known = testStore.findUserById(actorId) !== null;
  if (
    !known ||
    !canManageDeadlines(reachRank(testStore.senderReach(actorId)))
  ) {
    return { ok: false, error: NOT_A_DEADLINE_KEEPER };
  }
  const result = fn();
  return typeof result === "string"
    ? { ok: false, error: result }
    : { ok: true, ...result };
}

function copy(row: DeadlineRow & { createdAt: number }): DeadlineRow {
  const { createdAt: _createdAt, ...rest } = row;
  return { ...rest };
}

function liveDeadline(
  id: string,
  expectedVersion: number,
): (DeadlineRow & { createdAt: number }) | null {
  const row = state().deadlines.find((d) => d.id === id);
  return row && row.version === expectedVersion && row.removedAt === null
    ? row
    : null;
}

/** An "Other" deadline: the only kind a title edit or a removal touches. */
function otherDeadline(
  id: string,
  expectedVersion: number,
): (DeadlineRow & { createdAt: number }) | null {
  const row = liveDeadline(id, expectedVersion);
  return row && row.kind === null ? row : null;
}

export const logisticsTestStore = {
  // --- Attendance ------------------------------------------------------------

  listAttendance(cycle: number): AttendanceRead {
    return { entries: answersOf(cycle), coming: comingOf(cycle) };
  },

  hasOpenAttendanceAsk(userId: string): boolean {
    return testStore.hasOpenNudge(userId, ATTENDANCE_ACTION_KEY);
  },

  setMyAttendance(input: {
    userId: string;
    phase: AttendancePhase;
    answer: AttendanceAnswer;
    expected: AttendanceAnswer | null;
    now?: Date;
  }): LogisticsWriteResult<{ answer: AttendanceAnswer }> {
    if (!isMember(input.userId)) {
      return { ok: false, error: ATTENDANCE_NOT_A_MEMBER };
    }
    const cycle = testStore.currentCycleNumber();
    const open = openPhases(cycle, campDayKey(input.now ?? new Date()));
    if (!open.has(input.phase)) {
      return { ok: false, error: attendanceClosed(input.phase) };
    }
    const key = `${cycle}:${input.phase}:${input.userId}`;
    const current = state().answers.get(key) ?? null;
    if (current !== input.expected) {
      return { ok: false, error: ATTENDANCE_CHANGED };
    }
    state().answers.set(key, input.answer);
    if (attendanceAnswered(answeredBy(cycle, input.userId), open)) {
      testStore.satisfyRequiredAction(input.userId, ATTENDANCE_ACTION_KEY);
      testStore.readNotices(input.userId, ATTENDANCE_REF_TYPE);
    }
    return { ok: true, answer: input.answer };
  },

  askForAttendance(input: {
    actorId: string;
    now?: Date;
  }): LogisticsWriteResult<{ asked: number; notified: number }> {
    const known = testStore.findUserById(input.actorId) !== null;
    if (
      !known ||
      !canAskForAttendance(reachRank(testStore.senderReach(input.actorId)))
    ) {
      return { ok: false, error: NOT_AN_ATTENDANCE_ASKER };
    }
    const cycle = testStore.currentCycleNumber();
    const open = openPhases(cycle, campDayKey(input.now ?? new Date()));
    const targets = comingOf(cycle).filter(
      (m) => !attendanceAnswered(answeredBy(cycle, m.userId), open),
    );
    let notified = 0;
    for (const target of targets) {
      testStore.openNudge({
        userId: target.userId,
        actionKey: ATTENDANCE_ACTION_KEY,
        title: ATTENDANCE_ACTION_TITLE,
      });
      if (testStore.hasUnreadNotice(target.userId, ATTENDANCE_REF_TYPE)) {
        continue;
      }
      testStore.pushNotice(
        target.userId,
        attendanceAskNotification({ requiredActionId: null }),
      );
      notified += 1;
    }
    return { ok: true, asked: targets.length, notified };
  },

  // --- AfrikaBurn deadlines --------------------------------------------------

  listDeadlines(
    cycle?: number,
    options: { withRemoved?: boolean } = {},
  ): DeadlineRow[] {
    const year = cycle ?? testStore.currentCycleNumber();
    return state()
      .deadlines.filter(
        (d) =>
          d.cycle === year && (options.withRemoved || d.removedAt === null),
      )
      .sort(
        (a, b) =>
          (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
          a.createdAt - b.createdAt,
      )
      .map(copy);
  },

  addDeadline(input: {
    actorId: string;
    title: string;
    dueDate: string | null;
    note: string | null;
    newEventId: string;
  }): DeadlineWriteResult<{ row: DeadlineRow }> {
    return keeper(input.actorId, () => {
      const cycle = testStore.currentCycleNumber();
      const live = state().deadlines.filter(
        (d) => d.cycle === cycle && d.removedAt === null,
      );
      if (live.length >= MAX_DEADLINES) return TOO_MANY_DEADLINES;
      const row = {
        id: randomUUID(),
        cycle,
        kind: null,
        title: input.title,
        dueDate: input.dueDate,
        note: input.note,
        done: false,
        skipped: false,
        calendarEventId: input.dueDate ? input.newEventId : null,
        calendarSyncedVersion: null,
        version: 1,
        removedAt: null,
        createdAt: Date.now() + state().deadlines.length,
      };
      state().deadlines.push(row);
      return { row: copy(row) };
    });
  },

  editDeadline(input: {
    actorId: string;
    id: string;
    title: string;
    dueDate: string | null;
    note: string | null;
    expectedVersion: number;
    newEventId: string;
    done?: boolean;
  }): DeadlineWriteResult<{ row: DeadlineRow }> {
    return keeper(input.actorId, () => {
      const row = otherDeadline(input.id, input.expectedVersion);
      if (!row) return DEADLINE_CHANGED;
      row.title = input.title;
      row.dueDate = input.dueDate;
      row.note = input.note;
      if (input.done !== undefined) row.done = input.done;
      if (input.dueDate) row.calendarEventId ??= input.newEventId;
      row.version += 1;
      return { row: copy(row) };
    });
  },

  setAfrikaburnDate(input: {
    actorId: string;
    kind: string;
    dueDate: string | null;
    note: string | null;
    skipped: boolean;
    done?: boolean;
    expectedVersion: number | null;
    newEventId: string;
  }): DeadlineWriteResult<{ row: DeadlineRow }> {
    return keeper(input.actorId, () => {
      const standard = afrikaburnDate(input.kind);
      if (!standard) return NOT_AN_AFRIKABURN_DATE;
      if (input.skipped && !afrikaburnDateMayBeSkipped(input.kind)) {
        return CANNOT_SKIP_DATE;
      }
      const dueDate = input.skipped ? null : input.dueDate;
      if (!input.skipped && !dueDate) return PICK_THE_DATE;
      const cycle = testStore.currentCycleNumber();
      const existing = state().deadlines.find(
        (d) => d.cycle === cycle && d.kind === standard.kind,
      );
      if (input.expectedVersion === null) {
        if (existing) return DATE_SET_FIRST;
        const row = {
          id: randomUUID(),
          cycle,
          kind: standard.kind,
          title: standard.name,
          dueDate,
          note: input.note,
          done: input.done ?? false,
          skipped: input.skipped,
          calendarEventId: dueDate ? input.newEventId : null,
          calendarSyncedVersion: null,
          version: 1,
          removedAt: null,
          createdAt: Date.now() + state().deadlines.length,
        };
        state().deadlines.push(row);
        return { row: copy(row) };
      }
      if (
        !existing ||
        existing.version !== input.expectedVersion ||
        existing.removedAt !== null
      ) {
        return DEADLINE_CHANGED;
      }
      existing.title = standard.name;
      existing.dueDate = dueDate;
      existing.note = input.note;
      existing.skipped = input.skipped;
      if (input.done !== undefined) existing.done = input.done;
      if (dueDate) existing.calendarEventId ??= input.newEventId;
      existing.version += 1;
      return { row: copy(existing) };
    });
  },

  setDeadlineDone(input: {
    actorId: string;
    id: string;
    done: boolean;
    expectedVersion: number;
  }): DeadlineWriteResult<{ row: DeadlineRow }> {
    return keeper(input.actorId, () => {
      const row = liveDeadline(input.id, input.expectedVersion);
      if (!row) return DEADLINE_CHANGED;
      row.done = input.done;
      row.version += 1;
      return { row: copy(row) };
    });
  },

  removeDeadline(input: {
    actorId: string;
    id: string;
    expectedVersion: number;
  }): DeadlineWriteResult<{ row: DeadlineRow }> {
    return keeper(input.actorId, () => {
      const row = otherDeadline(input.id, input.expectedVersion);
      if (!row) return DEADLINE_CHANGED;
      row.removedAt = new Date();
      row.version += 1;
      const out = copy(row);
      if (row.calendarEventId === null) {
        state().deadlines.splice(state().deadlines.indexOf(row), 1);
      }
      return { row: out };
    });
  },

  markDeadlineCalendarSynced(input: {
    id: string;
    version: number;
    removed: boolean;
  }): boolean {
    const list = state().deadlines;
    const row = list.find((d) => d.id === input.id);
    if (!row || row.version !== input.version) return false;
    if (input.removed && row.removedAt !== null) {
      list.splice(list.indexOf(row), 1);
      return true;
    }
    row.calendarSyncedVersion = input.version;
    if (input.removed) row.calendarEventId = null;
    return true;
  },
};
