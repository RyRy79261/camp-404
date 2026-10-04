import { clockText, shiftTimeText } from "@camp404/core";
import type { SearchEntryRow, SearchKind } from "@camp404/db/search";
import type {
  InventoryLocation,
  RecipeStatus,
  TaskBoardStatus,
} from "@camp404/types";
import { rankLabel } from "./camp-roster";
import {
  KIND_LABEL as GUIDE_KIND_LABEL,
  WHOLE_CAMP_LABEL,
  guideCategoryLabel,
  guideChapterPath,
} from "./guide-copy";
import {
  LOCATION_LABELS,
  countText,
  inventoryItemPath,
  shortDate,
} from "./inventory-copy";
import { STATUS_LABEL as RECIPE_STATUS_LABEL } from "./recipe-labels";
import { TASK_COLUMN_LABEL } from "./task-board";
import type { SearchEntry } from "./program-search";

// The detail line and the address of each search result (#326, step 2), from
// the plain columns the database search returns. Pure, so the words are
// tested without a database. Each line says only what the page the result
// opens already shows the member: a team, a date, a status, a place.

/** Where each kind opens: the page whose rule the search copies. */
export function entryHref(
  kind: SearchKind,
  id: string,
  ref: string | null,
): string {
  const key = encodeURIComponent(id);
  switch (kind) {
    case "recipe":
      return `/kitchen/recipes/${key}`;
    case "chapter":
      return guideChapterPath(ref ?? id);
    case "meeting":
      return `/meetings/${key}`;
    case "task":
      return `/tasks?task=${key}`;
    case "inventory":
      return inventoryItemPath(id);
    case "shift":
      return `/shifts?shift=${key}`;
    case "gear":
      return `/gear?item=${key}`;
    case "lounge":
      return `/lounge?offer=${key}`;
    case "person":
      return `/captains/camp-management?member=${key}`;
    case "announcement":
      return `/announcements/${key}`;
    case "questionnaire":
      return `/captains/questionnaires/${key}`;
  }
}

const LOUNGE_STATUS: Record<string, string> = {
  offered: "Offered",
  accepted: "Accepted",
  declined: "Declined",
  needs_changes: "Changes asked",
};

const QUESTIONNAIRE_STATUS: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  unpublished: "Unpublished",
};

function audience(
  scope: string | null,
  team: string | null,
  teamOf: (k: string | null) => string | null,
): string | null {
  switch (scope) {
    case "everyone":
      return "to everyone";
    case "team":
      return team ? `to the ${teamOf(team)} team` : "to a team";
    case "team_leads":
      return "to team leads";
    case "drivers":
      return "to drivers";
    case "individual":
      return "to you";
    case "car":
      return "to your car";
    default:
      return null;
  }
}

/** The words after a result's title. */
export function entryDetail(
  row: SearchEntryRow,
  teamLabels: Record<string, string>,
): string {
  const teamOf = (key: string | null) =>
    key === null ? null : (teamLabels[key] ?? key);
  const day = (ms: number | null) =>
    ms === null ? null : shortDate(new Date(ms));
  const parts: (string | null)[] = (() => {
    switch (row.kind) {
      case "recipe":
        if (row.label === null) {
          return [row.num === null ? null : `${row.num} plates`];
        }
        return [
          row.flag ? "Your suggestion" : "Suggestion",
          RECIPE_STATUS_LABEL[row.label as RecipeStatus] ?? row.label,
        ];
      case "chapter":
        return row.label === "duty_card"
          ? [GUIDE_KIND_LABEL.duty_card, teamOf(row.team) ?? WHOLE_CAMP_LABEL]
          : [GUIDE_KIND_LABEL.chapter, guideCategoryLabel(row.extra ?? "")];
      case "meeting":
        return [day(row.at), teamOf(row.team) ?? WHOLE_CAMP_LABEL];
      case "task":
        return [
          teamOf(row.team),
          row.at === null ? null : `due ${day(row.at)}`,
          TASK_COLUMN_LABEL[row.label as TaskBoardStatus] ?? null,
        ];
      case "inventory":
        return [
          teamOf(row.team),
          row.num === null ? null : countText(row.num, row.extra),
          LOCATION_LABELS[row.label as InventoryLocation] ?? null,
        ];
      case "shift":
        return [
          teamOf(row.team),
          row.num === null || row.num2 === null
            ? null
            : shiftTimeText(row.num, row.num2),
        ];
      case "gear":
        return ["To rent", row.flag ? `tent, sleeps ${row.num ?? 1}` : null];
      case "lounge": {
        const placed =
          row.num === null || row.num2 === null
            ? null
            : `Day ${row.num} · ${clockText(row.num2)}`;
        if (row.flag)
          return [
            "Your offer",
            placed ?? LOUNGE_STATUS[row.label ?? ""] ?? null,
          ];
        return [placed ?? LOUNGE_STATUS[row.label ?? ""] ?? null];
      }
      case "person": {
        const teams = (row.extra ?? "")
          .split(",")
          .filter(Boolean)
          .map((t) => teamOf(t));
        return [
          teams.join(", ") || null,
          rankLabel(row.label === "captain" ? "captain" : "member", row.flag),
        ];
      }
      case "announcement":
        return [day(row.at), audience(row.label, row.team, teamOf)];
      case "questionnaire":
        return [QUESTIONNAIRE_STATUS[row.label ?? ""] ?? null];
    }
  })();
  return parts.filter((p): p is string => !!p).join(" · ");
}

/** A database row as the box shows it. */
export function presentEntry(
  row: SearchEntryRow,
  teamLabels: Record<string, string>,
): SearchEntry {
  return {
    kind: row.kind,
    id: row.id,
    title: row.title,
    detail: entryDetail(row, teamLabels),
    href: entryHref(row.kind, row.id, row.ref),
    ...(row.kind === "chapter" && row.label === "duty_card"
      ? { card: true }
      : {}),
    // A text hit's line, as the server cut it: never the text it came from.
    ...(row.match
      ? {
          match: {
            where: row.match.where,
            membersOnly: row.match.membersOnly,
            text: row.match.text,
            marks: row.match.marks.map(({ start, length }) => ({
              start,
              length,
            })),
          },
        }
      : {}),
  };
}
