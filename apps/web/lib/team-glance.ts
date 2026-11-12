// A team's "at a glance" panel (owner, 2026-11-12: "make their dashboards
// more meaningful"; approved mock-up docs/plans/2026-11-12-team-dashboards-mockup.html).
// Each team's panel answers one question, "is this team ready?", in the same
// shape: a row of figure tiles, an optional set of bar rows (who helps on which
// day, answers so far), a short "Needs attention" list and links into the
// team's tools. A team's own function decides the figures (pure, tested); the
// shared card draws them. A panel names no member: counts only.

import { campDayKey } from "@camp404/core";

export type GlanceTone = "ok" | "warn" | "bad";

export interface GlanceTile {
  key: string;
  label: string;
  value: string;
  hint: string;
  /** A coloured square before the value. */
  tone?: GlanceTone;
  /** A bar under the hint: how far `value` is towards `max`. */
  progress?: { value: number; max: number };
}

/** One part of a stacked bar (Going, Maybe, Can't, Not answered). */
export interface GlanceSegment {
  label: string;
  count: number;
  tone: GlanceTone | "none";
}

export interface GlanceBarRow {
  key: string;
  label: string;
  /** The words at the right of the bar ("9 going", "34 of 48"). */
  value: string;
  /** A plain bar, or a stacked one. */
  progress?: { value: number; max: number };
  segments?: GlanceSegment[];
}

export interface GlanceBars {
  heading: string;
  rows: GlanceBarRow[];
  /** The stacked bar's key, once under the rows. */
  legend?: { label: string; tone: GlanceTone | "none" }[];
}

export interface GlanceAttention {
  key: string;
  tone: GlanceTone;
  text: string;
  link?: GlanceLink;
}

export interface GlanceLink {
  href: string;
  label: string;
}

export interface TeamGlance {
  title: string;
  tiles: GlanceTile[];
  bars?: GlanceBars[];
  attention: GlanceAttention[];
  links: GlanceLink[];
  /** One quiet line at the foot: who sees the rest. */
  note?: string;
}

/** "1 meal" / "2 meals". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * "in 1 day", "in 23 days", "today", "1 day ago" for a "YYYY-MM-DD" day, on the
 * camp's clock (a day starts at midnight in South Africa); null for no date.
 */
export function daysFrom(now: Date, day: string | null): string | null {
  if (!day) return null;
  const at = (key: string) =>
    Date.UTC(
      Number(key.slice(0, 4)),
      Number(key.slice(5, 7)) - 1,
      Number(key.slice(8, 10)),
    );
  const diff = Math.round((at(day) - at(campDayKey(now))) / 86_400_000);
  if (diff === 0) return "today";
  if (diff > 0) return `in ${plural(diff, "day")}`;
  return `${plural(-diff, "day")} ago`;
}

/** Most "Needs attention" lines a panel shows; the tools hold the rest. */
export const ATTENTION_LIMIT = 5;
