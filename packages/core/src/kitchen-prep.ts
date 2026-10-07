import type { MealOfTheDay, PrepTiming } from "@camp404/types";
import { canEditMealPlan } from "./recipes";

// Prep steps on the meal plan (#245; the owner approved Option A of
// design/kitchen-prep.html, 2026-10-02, and answered where they go). Pure: no
// DB, no session, no next/*.
//
// A captain or a Kitchen lead adds a prep step under a recipe on a meal: what
// to do, and when (the day before the meal, the same day, or a date before we
// leave). There is no "person responsible" field (the owner). Where it goes
// depends on its date:
//  - due before Day 1 (before we leave, or the day before Day 1's meal): a
//    task on the camp's task board for the Kitchen, with that due date;
//  - due on a day on site: a short line in the Kitchen's part of that day's
//    printed site sheet, never the task board (there is no internet on site).
// Dates are UTC round trips on YYYY-MM-DD keys, never hand-rolled maths.

/** Who may add and remove prep steps: a captain or a Kitchen lead. */
export function canAddPrepSteps(
  rank: string,
  ledTeams: readonly string[],
): boolean {
  return canEditMealPlan(rank, ledTeams);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD key moved by whole days, or null for a bad key. */
export function addDays(iso: string, days: number): string | null {
  if (!ISO_DAY.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    return null;
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const PREP_NEEDS_DAY_ONE =
  "Set the camp's dates in Logistics first, so the step has a date.";
export const PREP_DATE_NOT_BEFORE =
  "Pick a date before Day 1: on site, use the day before or the same day.";
export const PREP_BAD_DATE = "Pick the date.";

/**
 * The date a prep step is due: the meal's date less a day, the meal's date,
 * or the date picked, which must be before Day 1.
 */
export function prepDueDate(input: {
  firstDay: string | null;
  day: number;
  when: PrepTiming;
  date: string | null;
}): { ok: true; due: string } | { ok: false; error: string } {
  if (!input.firstDay || addDays(input.firstDay, 0) === null) {
    return { ok: false, error: PREP_NEEDS_DAY_ONE };
  }
  if (input.when === "before_leaving") {
    if (!input.date || addDays(input.date, 0) === null) {
      return { ok: false, error: PREP_BAD_DATE };
    }
    if (input.date >= input.firstDay) {
      return { ok: false, error: PREP_DATE_NOT_BEFORE };
    }
    return { ok: true, due: input.date };
  }
  const meal = addDays(input.firstDay, input.day - 1);
  if (!meal) return { ok: false, error: PREP_NEEDS_DAY_ONE };
  const due = input.when === "day_before" ? addDays(meal, -1) : meal;
  return due ? { ok: true, due } : { ok: false, error: PREP_BAD_DATE };
}

/** Whether a step goes on the task board: it is due before Day 1. */
export function prepGoesOnBoard(due: string, firstDay: string): boolean {
  return due < firstDay;
}

const SHORT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "2027-04-23" as "Fri 23 Apr"; the key itself if it is not a date. */
export function shortDay(iso: string): string {
  if (addDays(iso, 0) === null) return iso;
  const parts = SHORT.formatToParts(new Date(`${iso}T00:00:00Z`));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}

/** "Soak the oats" as the board's title: "Overnight oats ×60: soak the oats". */
export function prepTaskTitle(
  recipeTitle: string,
  plates: number,
  what: string,
): string {
  const words = what.trim();
  const lowered = words.charAt(0).toLowerCase() + words.slice(1);
  return `${recipeTitle.trim()} ×${plates}: ${lowered}`.slice(0, 120);
}

/** The board card's line of detail: "For Day 3 breakfast, Sat 24 Apr". */
export function prepTaskDetails(
  day: number,
  meal: MealOfTheDay,
  firstDay: string | null,
): string {
  const date = firstDay ? addDays(firstDay, day - 1) : null;
  return `For Day ${day} ${meal}${date ? `, ${shortDay(date)}` : ""}`;
}

/** A prep step, as the daily site sheet needs it. */
export interface SheetPrepStep {
  dueDate: string;
  what: string;
  recipeTitle: string;
  day: number;
  meal: MealOfTheDay;
}

/**
 * The Kitchen's prep lines on one day's site sheet: the steps due that day,
 * each a short line ("Soak the oats (Overnight oats, Day 3 breakfast)"), in
 * meal order.
 */
export function prepSheetLines(
  day: string,
  steps: readonly SheetPrepStep[],
): string[] {
  return steps
    .filter((s) => s.dueDate === day)
    .sort(
      (a, b) =>
        a.day - b.day ||
        (a.meal === b.meal ? 0 : a.meal === "breakfast" ? -1 : 1),
    )
    .map((s) => `${s.what.trim()} (${s.recipeTitle}, Day ${s.day} ${s.meal})`);
}

/**
 * How many days Day 1 moved (`to` less `from`), or null when either is not a
 * date or it did not move. When it moves, every prep step moves with it
 * (the owner, 2026-10-02: "If Day 1 changes everything needs to redate").
 */
export function dayOneShift(
  from: string | null,
  to: string | null,
): number | null {
  if (!from || !to || addDays(from, 0) === null || addDays(to, 0) === null) {
    return null;
  }
  const days = Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
  return days === 0 ? null : days;
}
