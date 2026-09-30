import { and, asc, eq, sql } from "drizzle-orm";
import { canEditLogistics } from "@camp404/core";
import type { LogisticsPhase } from "@camp404/types";
import { writeAuditEvent } from "./audit";
import { lockSenderReach } from "./broadcasts";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction, type Tx } from "./index";
import { reachRank } from "./power";
import * as schema from "./schema";

// The logistics calendar (#247): the year's pack, travel, build, burn, strike
// and unpack days. The data layer.
//
//  - Every member reads the days.
//  - Only a captain or a Transport and Logistics lead writes
//    (canEditLogistics). Every write re-reads the actor's rank and the teams
//    they lead this year INSIDE its own transaction (lockSenderReach), so a
//    demotion that committed first is seen and one that comes later waits. A
//    caller passes only who is acting, never a rank or a team list.
//  - Every write is a compare-and-set on `version`: a lost race says so in a
//    sentence, never overwrites. Each is audited in the same transaction: the
//    days go onto the camp's shared Google Calendar, which is camp config.
//  - The camp calendar is Google's (owner, 2026-09-28). A phase claims ONE
//    Google event id the first time it gets days, inside the write, before
//    Google is called: the caller then puts the event under that id, so a
//    re-save, a retry or two editors at once can never make a second event.
//    Google is called after the transaction, never inside it.
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

export type LogisticsWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_A_LOGISTICS_EDITOR =
  "Only captains and Transport and Logistics leads can change the logistics days.";
export const PHASE_CHANGED =
  "Someone changed these days first. Reload the page.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One phase of one year, as the page and the calendar step read it. */
export interface LogisticsPhaseRow {
  cycle: number;
  phase: LogisticsPhase;
  startDate: string | null;
  endDate: string | null;
  place: string | null;
  note: string | null;
  calendarEventId: string | null;
  calendarSyncedVersion: number | null;
  version: number;
  updatedAt: Date;
}

const COLUMNS = {
  cycle: schema.logisticsPhases.cycle,
  phase: schema.logisticsPhases.phase,
  startDate: schema.logisticsPhases.startDate,
  endDate: schema.logisticsPhases.endDate,
  place: schema.logisticsPhases.place,
  note: schema.logisticsPhases.note,
  calendarEventId: schema.logisticsPhases.calendarEventId,
  calendarSyncedVersion: schema.logisticsPhases.calendarSyncedVersion,
  version: schema.logisticsPhases.version,
  updatedAt: schema.logisticsPhases.updatedAt,
};

// --- Transactions ------------------------------------------------------------

class Refused extends Error {
  constructor(readonly sentence: string) {
    super(sentence);
    this.name = "Refused";
  }
}

function refuse(sentence: string): never {
  throw new Refused(sentence);
}

async function write<T extends object>(
  fn: (tx: Tx) => Promise<T>,
): Promise<LogisticsWriteResult<T>> {
  try {
    const value = await withTransaction(fn);
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}

async function assertLogisticsEditor(tx: Tx, actorId: string): Promise<void> {
  if (!UUID.test(actorId)) refuse(NOT_A_LOGISTICS_EDITOR);
  const reach = await lockSenderReach(tx, actorId);
  if (!canEditLogistics(reachRank(reach), reach ?? [])) {
    refuse(NOT_A_LOGISTICS_EDITOR);
  }
}

// --- Reads -------------------------------------------------------------------

/** This year's phases that have a row, in the camp's order. */
export async function listLogisticsPhases(
  cycle?: number,
): Promise<LogisticsPhaseRow[]> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  // The enum's own order is the camp's order.
  return db
    .select(COLUMNS)
    .from(schema.logisticsPhases)
    .where(eq(schema.logisticsPhases.cycle, year))
    .orderBy(asc(schema.logisticsPhases.phase));
}

// --- Writes ------------------------------------------------------------------

/**
 * Set one phase's days for this year, as a captain or a Transport and
 * Logistics lead. `newEventId` is the Google event id to claim if the phase
 * has none yet; a phase that has one keeps it. Returns the row as saved, for
 * the calendar step.
 */
export async function setLogisticsPhase(input: {
  actorId: string;
  phase: LogisticsPhase;
  startDate: string;
  endDate: string;
  place: string | null;
  note: string | null;
  expectedVersion: number;
  newEventId: string;
}): Promise<LogisticsWriteResult<{ row: LogisticsPhaseRow }>> {
  return write(async (tx) => {
    await assertLogisticsEditor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    const now = new Date();
    const fields = {
      startDate: input.startDate,
      endDate: input.endDate,
      place: input.place,
      note: input.note,
      updatedByUserId: input.actorId,
      updatedAt: now,
    };
    let row: LogisticsPhaseRow | undefined;
    if (input.expectedVersion === 0) {
      [row] = await tx
        .insert(schema.logisticsPhases)
        .values({
          ...fields,
          cycle,
          phase: input.phase,
          calendarEventId: input.newEventId,
          version: 1,
        })
        .onConflictDoNothing({
          target: [schema.logisticsPhases.cycle, schema.logisticsPhases.phase],
        })
        .returning(COLUMNS);
    } else {
      [row] = await tx
        .update(schema.logisticsPhases)
        .set({
          ...fields,
          // Keep the event already claimed; claim one only when there is none.
          calendarEventId: sql`coalesce(${schema.logisticsPhases.calendarEventId}, ${input.newEventId})`,
          version: sql`${schema.logisticsPhases.version} + 1`,
        })
        .where(
          and(
            eq(schema.logisticsPhases.cycle, cycle),
            eq(schema.logisticsPhases.phase, input.phase),
            eq(schema.logisticsPhases.version, input.expectedVersion),
          ),
        )
        .returning(COLUMNS);
    }
    if (!row) refuse(PHASE_CHANGED);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "logistics.phase_set",
      target: `logistics_phase:${cycle}:${input.phase}`,
      metadata: {
        cycle,
        phase: input.phase,
        startDate: input.startDate,
        endDate: input.endDate,
      },
    });
    return { row };
  });
}

/**
 * Clear one phase's days (and its place and note) for this year. The row
 * keeps its Google event id until the caller has taken the event off the
 * calendar (markLogisticsCalendarSynced), so a failed delete is not lost.
 */
export async function clearLogisticsPhase(input: {
  actorId: string;
  phase: LogisticsPhase;
  expectedVersion: number;
}): Promise<LogisticsWriteResult<{ row: LogisticsPhaseRow }>> {
  return write(async (tx) => {
    await assertLogisticsEditor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    const [row] = await tx
      .update(schema.logisticsPhases)
      .set({
        startDate: null,
        endDate: null,
        place: null,
        note: null,
        updatedByUserId: input.actorId,
        updatedAt: new Date(),
        version: sql`${schema.logisticsPhases.version} + 1`,
      })
      .where(
        and(
          eq(schema.logisticsPhases.cycle, cycle),
          eq(schema.logisticsPhases.phase, input.phase),
          eq(schema.logisticsPhases.version, input.expectedVersion),
        ),
      )
      .returning(COLUMNS);
    if (!row) refuse(PHASE_CHANGED);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "logistics.phase_cleared",
      target: `logistics_phase:${cycle}:${input.phase}`,
      metadata: { cycle, phase: input.phase },
    });
    return { row };
  });
}

/**
 * Record that the camp calendar now matches `version` of a phase: its event
 * is there with those days, or (`removed`) it is gone and the phase lets go
 * of its id. A compare-and-set on the version, so a step that finished after
 * a newer save never marks the newer one as done. True when it was marked.
 */
export async function markLogisticsCalendarSynced(input: {
  cycle: number;
  phase: LogisticsPhase;
  version: number;
  removed: boolean;
}): Promise<boolean> {
  const rows = await createHttpDb()
    .update(schema.logisticsPhases)
    .set({
      calendarSyncedVersion: input.version,
      ...(input.removed ? { calendarEventId: null } : {}),
    })
    .where(
      and(
        eq(schema.logisticsPhases.cycle, input.cycle),
        eq(schema.logisticsPhases.phase, input.phase),
        eq(schema.logisticsPhases.version, input.version),
      ),
    )
    .returning({ version: schema.logisticsPhases.version });
  return rows.length > 0;
}
