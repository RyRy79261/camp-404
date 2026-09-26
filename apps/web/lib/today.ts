import "server-only";

import { CAMP_TIME_ZONE, campDayKey, deriveViewerRank } from "@camp404/core";
import { getCampSettings, teamLabelMap } from "./camp-config";
import { getUpcomingEvents } from "./camp-calendar";
import { buildHome, daysBetween, type HomeModel } from "./home";
import { getInboxBadge } from "./inbox-badge";
import { getMyLift } from "./lifts";
import { isAwaitingApproval, type MemberState } from "./member-gate";
import { countUnreadByTeam } from "./notifications";
import { getProgramManifest } from "./program-manifest";
import { isSignInSecured } from "./sign-in-security";
import { listMyOpenTasks } from "./tasks";
import { getMyTeams, getPendingQuestionnaires } from "./users";

// The Today gadget's contents (owner, 2026-09-23: the member's OWN summary;
// 2026-09-26: the prototype's pop-out, on every screen): what they need to do,
// what is coming up, their tasks, and the countdown to the Burn. Built on the
// server from the member's own facts and nothing else, for the console layout
// (every screen) and for the gadget's refresh when it opens.

/** The Burn this year, for the gadget's countdown card. */
export interface TodayBurn {
  year: number;
  /** The year's name, e.g. the burn's theme; null when a captain set none. */
  name: string | null;
  /** YYYY-MM-DD, or null when a captain has not set the dates. */
  start: string | null;
  end: string | null;
  /** Whole camp days until the first day; null with no dates, 0 on the day. */
  daysTo: number | null;
  /** Which day of the Burn it is, while it runs; else null. */
  dayOf: number | null;
  /**
   * The year's run-up, from last year's Burn ending to this one starting, in
   * camp days: its length and how much of it is gone. Null without both
   * dates, or outside the run-up.
   */
  runUp: { days: number; gone: number } | null;
}

export interface TodayModel {
  home: HomeModel;
  /** Today in camp time: "Fri 25 Sept". */
  date: string;
  burn: TodayBurn | null;
  /** When the server built it (ms since the epoch). */
  builtAt: number;
}

const DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: CAMP_TIME_ZONE,
});

/**
 * Today for a member the desktop draws (a cleared member, or an applicant
 * waiting for approval), or null for anyone else. Every read is the same the
 * Home page made before the gadget moved; the request-cached ones (the
 * manifest, the settings, the lift, the inbox count) cost nothing more.
 */
export async function getTodayModel(
  state: MemberState,
  now: Date = new Date(),
): Promise<TodayModel | null> {
  if (state.kind !== "member") return null;
  const { campUser, block } = state;
  const waiting = isAwaitingApproval(campUser, block);
  if (block && !waiting) return null;

  const [
    memberships,
    pending,
    inbox,
    unreadByTeam,
    lift,
    secured,
    settings,
    calendar,
    myTasks,
    manifest,
  ] = await Promise.all([
    waiting ? Promise.resolve([]) : getMyTeams(campUser.id),
    waiting ? Promise.resolve([]) : getPendingQuestionnaires(campUser.id),
    getInboxBadge(campUser.id),
    waiting
      ? Promise.resolve({} as Partial<Record<string, number>>)
      : countUnreadByTeam(campUser.id),
    waiting ? Promise.resolve(null) : getMyLift(campUser.id),
    isSignInSecured(),
    getCampSettings(),
    waiting ? Promise.resolve(null) : getUpcomingEvents(),
    waiting
      ? Promise.resolve({ items: [], total: 0 })
      : listMyOpenTasks(campUser.id),
    getProgramManifest(),
  ]);
  const labels = teamLabelMap(settings.teams);
  const isCaptain =
    deriveViewerRank(
      campUser.rank,
      memberships.some((m) => m.isLead),
    ) === "captain";

  const home = buildHome(
    {
      now,
      approval: waiting ? "pending" : "approved",
      firstName: campUser.displayName?.trim().split(/\s+/)[0] ?? null,
      isCaptain,
      teams: memberships.map((m) => ({
        key: m.team,
        label: labels[m.team] ?? m.team,
        isLead: m.isLead,
        unread: unreadByTeam[m.team] ?? 0,
      })),
      pending,
      inbox,
      myTasks,
      lift,
      calendar,
      teamLabels: labels,
      secured,
    },
    manifest ?? undefined,
  );

  // Last year's Burn, where the run-up to this one starts.
  const current = settings.current;
  const previousEnd = current
    ? (settings.cycles
        .filter((c) => c.year < current.year && c.burnEnd)
        .sort((a, b) => b.year - a.year)[0]?.burnEnd ?? null)
    : null;
  return {
    home,
    date: DATE.format(now),
    burn: todayBurn(current, now, previousEnd),
    builtAt: now.getTime(),
  };
}

/**
 * The countdown card's facts for the camp's year, or null before a captain
 * names one: whole camp days to the first day (none on or after it), and the
 * day of the Burn while it runs, and with last year's last day
 * (`previousEnd`), how far through the run-up the camp is. Camp days through
 * the platform Date as UTC midnights (daysBetween), never hand-rolled
 * calendar maths.
 */
export function todayBurn(
  cycle: {
    year: number;
    name?: string;
    burnStart?: string;
    burnEnd?: string;
  } | null,
  now: Date,
  previousEnd: string | null = null,
): TodayBurn | null {
  if (!cycle) return null;
  const today = campDayKey(now);
  const start = cycle.burnStart ?? null;
  const end = cycle.burnEnd ?? null;
  const toStart = start ? daysBetween(today, start) : null;
  const toEnd = end ? daysBetween(today, end) : null;
  const runUpDays =
    start && previousEnd ? daysBetween(previousEnd, start) : null;
  const gone = previousEnd ? daysBetween(previousEnd, today) : null;
  const runUp =
    runUpDays !== null &&
    gone !== null &&
    runUpDays > 0 &&
    gone >= 0 &&
    gone < runUpDays
      ? { days: runUpDays, gone }
      : null;
  return {
    year: cycle.year,
    name: cycle.name ?? null,
    start,
    end,
    daysTo: toStart !== null && toStart > 0 ? toStart : null,
    dayOf:
      toStart !== null && toEnd !== null && toStart <= 0 && toEnd >= 0
        ? 1 - toStart
        : null,
    runUp,
  };
}
