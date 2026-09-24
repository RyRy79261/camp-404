import { CAMP_TIME_ZONE, campDayKey } from "@camp404/core";
import type { TaskBoardStatus } from "@camp404/types";

// What the task board shows, worked out on the server from the tasks and the
// viewer. Pure, so the rules for a card's deadline and buttons are tested
// without a page. The buttons are a courtesy: every action checks again.

export const TASK_COLUMNS: { status: TaskBoardStatus; label: string }[] = [
  { status: "open", label: "To do" },
  { status: "in_progress", label: "Doing" },
  { status: "done", label: "Done" },
];

/** The fields of a stored task the board needs. */
export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  team: string | null;
  status: TaskBoardStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  createdById: string | null;
  createdByName: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  version: number;
}

export type DueTone = "overdue" | "soon" | "later" | "done";

export interface TaskCard {
  id: string;
  title: string;
  description: string | null;
  status: TaskBoardStatus;
  team: string | null;
  teamLabel: string | null;
  assigneeId: string | null;
  /** Null: nobody is responsible yet. */
  assigneeName: string | null;
  mine: boolean;
  addedBy: string | null;
  due: { label: string; tone: DueTone } | null;
  /** The deadline as the camp day it falls on, YYYY-MM-DD, for the edit form. */
  dueDay: string | null;
  /** The version an edit opened from this card must name. */
  version: number;
  canMove: boolean;
  canRemove: boolean;
  /** Who may edit is who may remove: whoever added it, its team's lead, a captain. */
  canEdit: boolean;
}

export interface Viewer {
  id: string;
  isCaptain: boolean;
  /** The teams the viewer leads this year. */
  leadTeams: readonly string[];
}

const DAY_MS = 86_400_000;
/** A deadline this close reads as "soon". */
const SOON_DAYS = 3;

const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: CAMP_TIME_ZONE,
});

/** Whole days from one YYYY-MM-DD to another (UTC round-trip, no clock drift). */
function daysBetween(fromKey: string, toKey: string): number {
  return Math.round(
    (Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) /
      DAY_MS,
  );
}

/**
 * The instant a deadline day starts in camp time. A deadline is a day, typed as
 * YYYY-MM-DD; storing the start of that day in Johannesburg keeps its
 * `campDayKey` equal to the day that was typed. Johannesburg is UTC+2 all year
 * (South Africa has no daylight saving), so the offset is fixed.
 */
export function deadlineFromDay(day: string): Date {
  return new Date(`${day}T00:00:00+02:00`);
}

function dueOf(task: TaskRow, today: string): TaskCard["due"] {
  if (!task.dueAt) return null;
  const day = campDayKey(task.dueAt);
  const date = DAY.format(task.dueAt).replace(",", "");
  if (task.status === "done") return { label: `Was due ${date}`, tone: "done" };
  const days = daysBetween(today, day);
  if (days < 0) return { label: `Overdue · ${date}`, tone: "overdue" };
  if (days === 0) return { label: "Due today", tone: "soon" };
  if (days === 1) return { label: "Due tomorrow", tone: "soon" };
  return {
    label: `Due ${date}`,
    tone: days <= SOON_DAYS ? "soon" : "later",
  };
}

/** One task as a card, for this viewer. */
export function presentTask(
  task: TaskRow,
  input: { viewer: Viewer; now: Date; teamLabels: Record<string, string> },
): TaskCard {
  const { viewer } = input;
  const leadsTeam =
    viewer.isCaptain ||
    (task.team !== null && viewer.leadTeams.includes(task.team));
  const added = task.createdById === viewer.id;
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    team: task.team,
    teamLabel: task.team ? (input.teamLabels[task.team] ?? task.team) : null,
    assigneeId: task.assigneeId,
    assigneeName: task.assigneeId
      ? (task.assigneeName ?? "Unnamed member")
      : null,
    mine: task.assigneeId === viewer.id,
    addedBy: task.createdByName,
    due: dueOf(task, campDayKey(input.now)),
    dueDay: task.dueAt ? campDayKey(task.dueAt) : null,
    version: task.version,
    canMove: leadsTeam || added || task.assigneeId === viewer.id,
    canRemove: leadsTeam || added,
    canEdit: leadsTeam || added,
  };
}
