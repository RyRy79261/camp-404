import {
  attendanceIsOpen,
  campDayKey,
  type AttendancePhaseBoard,
} from "@camp404/core";
import type { AttendancePhase } from "@camp404/types";
import type { LogisticsPhaseRow } from "@camp404/db/logistics";
import {
  ATTENTION_LIMIT,
  daysFrom,
  plural,
  type GlanceAttention,
  type GlanceTile,
  type TeamGlance,
} from "@/lib/team-glance";
import { LOGISTICS_HREF, phaseCrew, shortDay } from "./transport";

// Structures' panel on its program, "The build" (approved mock-up
// 2026-11-12): this year's camp layout (its latest version and when it was
// saved), how many help on Build and Strike, when Build starts, and whether
// the neighbour page is on. Counts only: the layout's saver is not named, and
// "not answered" is the count getAttendanceView hands every viewer.

export const CAMP_LAYOUT_HREF = "/camp-layout";

export interface StructuresGlanceInput {
  layout: { version: number; savedAt: Date | null; shared: boolean };
  phases: readonly LogisticsPhaseRow[];
  attendance: {
    phases: readonly AttendancePhaseBoard[];
    notAnsweredCount: Partial<Record<AttendancePhase, number>>;
  };
  /** A captain or a Structures lead: an empty plan is theirs to start. */
  canEditLayout: boolean;
  now: Date;
}

function crewTile(
  key: "build" | "strike",
  label: string,
  input: StructuresGlanceInput,
  today: string,
): { tile: GlanceTile; notAnswered: number; open: boolean } {
  const crew = phaseCrew(
    input.attendance.phases,
    input.attendance.notAnsweredCount,
    key,
  );
  const open = attendanceIsOpen(
    input.phases.find((r) => r.phase === key)?.startDate,
    today,
  );
  const parts = [`${crew.maybe} maybe`];
  if (crew.notAnswered > 0) parts.push(`${crew.notAnswered} not answered`);
  return {
    tile: {
      key: `${key}-crew`,
      label,
      value: `${crew.going} going`,
      hint: parts.join(" · "),
      tone: open && crew.notAnswered > 0 ? "warn" : undefined,
    },
    notAnswered: crew.notAnswered,
    open,
  };
}

function buildStartsTile(
  row: LogisticsPhaseRow | undefined,
  now: Date,
  today: string,
): GlanceTile {
  const start = row?.startDate ?? null;
  if (!start) {
    return {
      key: "build-starts",
      label: "Build starts",
      value: "—",
      hint: "No Build days set yet",
    };
  }
  const end = row?.endDate ?? start;
  if (start <= today && end >= today) {
    return {
      key: "build-starts",
      label: "Build",
      value: "On now",
      hint: `until ${shortDay(end)}`,
    };
  }
  if (end < today) {
    return {
      key: "build-starts",
      label: "Build",
      value: "Done",
      hint: `ended ${shortDay(end)}`,
    };
  }
  return {
    key: "build-starts",
    label: "Build starts",
    value: daysFrom(now, start) ?? "—",
    hint: `on ${shortDay(start)}`,
  };
}

export function structuresGlance(input: StructuresGlanceInput): TeamGlance {
  const { layout, now } = input;
  const today = campDayKey(now);
  const build = crewTile("build", "Build crew", input, today);
  const strike = crewTile("strike", "Strike crew", input, today);

  const saved =
    layout.version > 0 && layout.savedAt
      ? daysFrom(now, campDayKey(layout.savedAt))
      : null;
  const layoutTile: GlanceTile =
    layout.version === 0
      ? {
          key: "layout",
          label: "Camp layout",
          value: "—",
          hint: "No plan saved this year yet",
        }
      : {
          key: "layout",
          label: "Camp layout",
          value: `Version ${layout.version}`,
          hint: saved ? `saved ${saved}` : "saved",
        };

  const attention: GlanceAttention[] = [];
  if (layout.version === 0) {
    attention.push({
      key: "layout",
      tone: "warn",
      text: "No camp layout is saved for this year yet.",
      link: {
        href: CAMP_LAYOUT_HREF,
        label: input.canEditLayout ? "Start the plan" : "Camp layout",
      },
    });
  }
  for (const [phase, crew] of [
    ["Build", build],
    ["Strike", strike],
  ] as const) {
    if (!crew.open || crew.notAnswered === 0) continue;
    attention.push({
      key: `crew-${phase}`,
      tone: "warn",
      text: `${phase}: ${plural(crew.notAnswered, "person", "people")} coming ${crew.notAnswered === 1 ? "has" : "have"} not said if they help.`,
      link: { href: LOGISTICS_HREF, label: "Logistics" },
    });
  }
  if (layout.version > 0) {
    attention.push({
      key: "neighbours",
      tone: "ok",
      text: layout.shared
        ? "The neighbour page is on."
        : "The neighbour page is off.",
      link: { href: CAMP_LAYOUT_HREF, label: "Camp layout" },
    });
  }

  return {
    title: "The build",
    tiles: [
      layoutTile,
      build.tile,
      buildStartsTile(
        input.phases.find((r) => r.phase === "build"),
        now,
        today,
      ),
      strike.tile,
    ],
    attention: attention.slice(0, ATTENTION_LIMIT),
    links: [
      { href: CAMP_LAYOUT_HREF, label: "Camp layout" },
      { href: LOGISTICS_HREF, label: "Logistics" },
    ],
  };
}
