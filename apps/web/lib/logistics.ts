import "server-only";

import {
  LOGISTICS_TEAM,
  logisticsCalendarStep,
  logisticsEventTitle,
  nextCampDay,
} from "@camp404/core";
import * as db from "@camp404/db/logistics";
import type {
  LogisticsPhaseRow,
  LogisticsWriteResult,
} from "@camp404/db/logistics";
import {
  LOGISTICS_PHASE_HINTS,
  TEAM_DEFAULT_LABELS,
  type ClearLogisticsPhaseInput,
  type SetLogisticsPhaseInput,
} from "@camp404/types";
import { getTeamsConfig } from "./camp-config";
import {
  calendarConfig,
  deleteCalendarEvent,
  forgetCalendarCache,
  newCalendarEventId,
  putCalendarEvent,
  TEAM_PROPERTY,
  type CalendarEventBody,
} from "./google-calendar";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// The logistics calendar (#247): the year's pack, travel, build, burn, strike
// and unpack days, from the database or, under E2E, the test store; and each
// phase mirrored onto the camp's shared Google Calendar (owner, 2026-09-28:
// the calendar stays on Google).
//
// THE ORDER. The phase is saved first (the rule, the compare-and-set and the
// audit row, in one transaction that also claims the phase's Google event
// id). Then, with no transaction open, the calendar is made to match: the
// event is put under that id (an update, or a create when Google has none),
// or, for a phase whose days were cleared, deleted. A save is never lost to a
// Google failure: the page says the phase is not on the calendar yet, and
// saving again puts it there. Re-saving never makes a second event, because
// the id never changes.
//
// Under E2E the store's own event list stands in for Google, so the same
// steps run and the Calendar page shows the phases.

export type { LogisticsPhaseRow, LogisticsWriteResult };

/** How the camp calendar stands after a save. */
export type LogisticsCalendarOutcome =
  /** The camp calendar matches the phase. */
  | "synced"
  /** There is no camp calendar to write to: the days are in the app only. */
  | "not_connected"
  /** Google did not take the change; saving again retries. */
  | "failed";

/** Whether there is a camp calendar to write the phases to. */
export function isLogisticsCalendarConnected(): boolean {
  return usesTestStore() || calendarConfig(process.env) !== null;
}

export async function listLogisticsPhases(): Promise<LogisticsPhaseRow[]> {
  return usesTestStore()
    ? testStore.listLogisticsPhases()
    : db.listLogisticsPhases();
}

/** The Transport and Logistics team's name as the camp calls it now. */
async function logisticsTeamLabel(): Promise<string> {
  const config = await getTeamsConfig();
  return (
    config.teams.find((t) => t.key === LOGISTICS_TEAM)?.label ??
    TEAM_DEFAULT_LABELS[LOGISTICS_TEAM]
  );
}

/**
 * The Google event for a phase with days: all day, from the first day to the
 * last (Google's end date is the day after), titled "Transport and Logistics
 * Team - Build", with the team's key as the private property the app reads.
 */
export function logisticsEventBody(
  row: LogisticsPhaseRow & { startDate: string; endDate: string },
  teamLabel: string,
): CalendarEventBody {
  const description = [
    LOGISTICS_PHASE_HINTS[row.phase],
    row.note,
    "Set in the Camp 404 app, under Logistics. Change it there.",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    summary: logisticsEventTitle(teamLabel, row.phase),
    description,
    ...(row.place ? { location: row.place } : {}),
    start: { date: row.startDate },
    end: { date: nextCampDay(row.endDate) },
    extendedProperties: {
      private: { [TEAM_PROPERTY]: LOGISTICS_TEAM, camp404Logistics: row.phase },
    },
  };
}

/** How many times a sync follows a newer save before it gives up. */
const MAX_SYNC_ROUNDS = 3;

/** The phase as it stands now, from the same source as the write. */
async function currentPhase(
  row: LogisticsPhaseRow,
): Promise<LogisticsPhaseRow | undefined> {
  const rows = usesTestStore()
    ? testStore.listLogisticsPhases(row.cycle)
    : await db.listLogisticsPhases(row.cycle);
  return rows.find((r) => r.phase === row.phase);
}

/**
 * Make the camp calendar match a phase as saved. Never throws.
 *
 * Google is written with no lock held, so two saves close together can reach
 * Google in the wrong order. The mark is a compare-and-set on the version:
 * when it misses, a newer save has landed, and what this step just wrote may
 * be stale. So it reads the phase again and makes Google match that instead,
 * first taking off an event it put under an id the phase no longer holds.
 * Whichever step finishes last therefore leaves Google matching the newest
 * save.
 */
async function syncToCalendar(
  row: LogisticsPhaseRow,
  actorId: string,
  round = 1,
): Promise<LogisticsCalendarOutcome> {
  if (!isLogisticsCalendarConnected()) return "not_connected";
  const step = logisticsCalendarStep(row);
  const eventId = row.calendarEventId;
  const mark = (removed: boolean) =>
    usesTestStore()
      ? testStore.markLogisticsCalendarSynced({
          cycle: row.cycle,
          phase: row.phase,
          version: row.version,
          removed,
        })
      : db.markLogisticsCalendarSynced({
          cycle: row.cycle,
          phase: row.phase,
          version: row.version,
          removed,
        });
  const remove = async (id: string) =>
    usesTestStore()
      ? testStore.deleteCalendarEvent(id)
      : await deleteCalendarEvent(process.env, id);
  try {
    let marked = true;
    if (step === "put" && eventId && row.startDate && row.endDate) {
      const teamLabel = await logisticsTeamLabel();
      const body = logisticsEventBody(
        { ...row, startDate: row.startDate, endDate: row.endDate },
        teamLabel,
      );
      if (usesTestStore()) {
        testStore.putCalendarEvent({
          id: eventId,
          title: body.summary,
          date: row.startDate,
          location: row.place,
          teamTag: LOGISTICS_TEAM,
          actorId,
        });
      } else {
        await putCalendarEvent(process.env, eventId, body);
      }
      marked = await mark(false);
    } else if (step === "remove" && eventId) {
      if (!(await remove(eventId))) return "failed";
      marked = await mark(true);
    }
    forgetCalendarCache();
    if (marked) return "synced";

    // A newer save landed while this step was at Google.
    const latest = await currentPhase(row);
    if (
      step === "put" &&
      eventId &&
      latest?.calendarEventId !== eventId &&
      !(await remove(eventId))
    ) {
      return "failed";
    }
    if (!latest || round >= MAX_SYNC_ROUNDS) return "failed";
    return await syncToCalendar(latest, actorId, round + 1);
  } catch {
    // putCalendarEvent has logged the HTTP status, and nothing secret.
    return "failed";
  }
}

/**
 * Set one phase's days as `actorId`, if they may, then put it on the camp
 * calendar. The rule is checked inside the write.
 */
export async function saveLogisticsPhase(
  actorId: string,
  input: SetLogisticsPhaseInput,
): Promise<LogisticsWriteResult<{ calendar: LogisticsCalendarOutcome }>> {
  const args = { ...input, actorId, newEventId: newCalendarEventId() };
  const saved = usesTestStore()
    ? testStore.setLogisticsPhase(args)
    : await db.setLogisticsPhase(args);
  if (!saved.ok) return saved;
  return { ok: true, calendar: await syncToCalendar(saved.row, actorId) };
}

/**
 * Clear one phase's days as `actorId`, if they may, then take its event off
 * the camp calendar.
 */
export async function clearLogisticsPhase(
  actorId: string,
  input: ClearLogisticsPhaseInput,
): Promise<LogisticsWriteResult<{ calendar: LogisticsCalendarOutcome }>> {
  const args = { ...input, actorId };
  const cleared = usesTestStore()
    ? testStore.clearLogisticsPhase(args)
    : await db.clearLogisticsPhase(args);
  if (!cleared.ok) return cleared;
  return { ok: true, calendar: await syncToCalendar(cleared.row, actorId) };
}
