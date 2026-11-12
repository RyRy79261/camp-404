import {
  attendanceIsOpen,
  campDayKey,
  seatsLeft,
  type AttendancePhaseBoard,
} from "@camp404/core";
import {
  ATTENDANCE_PHASES,
  LOGISTICS_PHASES,
  LOGISTICS_PHASE_LABELS,
  type AttendancePhase,
} from "@camp404/types";
import type { TrailerRow, TransportCar } from "@camp404/db/transport";
import type { LogisticsPhaseRow } from "@camp404/db/logistics";
import {
  ATTENTION_LIMIT,
  daysFrom,
  plural,
  type GlanceAttention,
  type GlanceBars,
  type GlanceTile,
  type TeamGlance,
} from "@/lib/team-glance";

// Transport and Logistics' panel on its program, "Getting there" (approved
// mock-up 2026-11-12): the cars' free seats, the lift requests still waiting,
// the trailers and their tows, the next phase of the camp's days, and who
// helps on which working day. Counts only. The lift requests are counted only
// for a Transport editor (the Transport page shows them to an editor alone);
// anyone else gets how many ride, as the Transport page's strip does. "Not
// answered" is the count getAttendanceView hands every viewer.

export const TRANSPORT_HREF = "/transport";
export const LOGISTICS_HREF = "/logistics";

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "13 Apr" for a "YYYY-MM-DD" day. */
export function shortDay(day: string): string {
  return DAY.format(new Date(`${day}T00:00:00Z`));
}

/** The attendance counts of one phase: Going, Maybe, Can't, Not answered. */
export interface PhaseCrew {
  going: number;
  maybe: number;
  cant: number;
  notAnswered: number;
}

export function phaseCrew(
  board: readonly AttendancePhaseBoard[],
  notAnsweredCount: Partial<Record<AttendancePhase, number>>,
  phase: AttendancePhase,
): PhaseCrew {
  const row = board.find((p) => p.phase === phase);
  return {
    going: row?.names.going.length ?? 0,
    maybe: row?.names.maybe.length ?? 0,
    cant: row?.names.cant.length ?? 0,
    notAnswered: notAnsweredCount[phase] ?? 0,
  };
}

export const CREW_LEGEND: NonNullable<GlanceBars["legend"]> = [
  { label: "Going", tone: "ok" },
  { label: "Maybe", tone: "warn" },
  { label: "Can't", tone: "bad" },
  { label: "Not answered", tone: "none" },
];

/** Where a phase stands today: on now, still to come, or over. */
export type PhaseWhen =
  | { kind: "now"; phase: LogisticsPhaseRow }
  | { kind: "next"; phase: LogisticsPhaseRow }
  | null;

/** The phase on now, else the next one with days; null when none is ahead. */
export function nextPhase(
  rows: readonly LogisticsPhaseRow[],
  today: string,
): PhaseWhen {
  const dated = LOGISTICS_PHASES.map((p) =>
    rows.find((r) => r.phase === p),
  ).filter(
    (r): r is LogisticsPhaseRow & { startDate: string } =>
      r !== undefined && r.startDate !== null,
  );
  const now = dated.find(
    (r) => r.startDate <= today && (r.endDate ?? r.startDate) >= today,
  );
  if (now) return { kind: "now", phase: now };
  const ahead = dated
    .filter((r) => r.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  return ahead ? { kind: "next", phase: ahead } : null;
}

export function nextPhaseTile(when: PhaseWhen, now: Date): GlanceTile {
  if (!when) {
    return {
      key: "next-phase",
      label: "Next phase",
      value: "—",
      hint: "No days ahead are set yet",
    };
  }
  const { phase } = when;
  const label = LOGISTICS_PHASE_LABELS[phase.phase];
  if (when.kind === "now") {
    return {
      key: "next-phase",
      label: "On now",
      value: label,
      hint: `until ${shortDay(phase.endDate ?? phase.startDate!)}`,
    };
  }
  return {
    key: "next-phase",
    label: "Next phase",
    value: label,
    hint: `${daysFrom(now, phase.startDate)}, on ${shortDay(phase.startDate!)}`,
  };
}

export interface TransportGlanceInput {
  cars: readonly TransportCar[];
  trailers: readonly TrailerRow[];
  /** Every open lift request, or null for a viewer who is not an editor. */
  openRequests: number | null;
  phases: readonly LogisticsPhaseRow[];
  attendance: {
    phases: readonly AttendancePhaseBoard[];
    notAnsweredCount: Partial<Record<AttendancePhase, number>>;
  };
  now: Date;
}

export function transportGlance(input: TransportGlanceInput): TeamGlance {
  const { cars, trailers, openRequests, now } = input;
  const today = campDayKey(now);

  let offered = 0;
  let free = 0;
  let riders = 0;
  for (const car of cars) {
    riders += car.riders.length;
    const left = seatsLeft(car.seatsOffered, car.riders.length);
    if (car.seatsOffered !== null && left !== null) {
      offered += car.seatsOffered;
      free += left;
    }
  }
  const untowed = trailers.filter((t) => t.towedByUserId === null).length;

  const tiles: GlanceTile[] = [
    cars.length === 0
      ? {
          key: "seats",
          label: "Seats free",
          value: "—",
          hint: "No cars this year yet",
        }
      : {
          key: "seats",
          label: "Seats free",
          value: String(free),
          hint: `of ${offered} offered, in ${plural(cars.length, "car")}, after riders`,
        },
    openRequests === null
      ? {
          key: "riders",
          label: "Riders",
          value: String(riders),
          hint: "in the cars so far",
        }
      : {
          key: "lifts",
          label: "Lifts asked",
          value: String(openRequests),
          hint:
            openRequests === 0
              ? "nobody is waiting"
              : "still waiting for an answer",
          tone: openRequests > 0 ? "warn" : undefined,
        },
    {
      key: "trailers",
      label: "Trailers",
      value: String(trailers.length),
      hint:
        trailers.length === 0
          ? "none this year"
          : untowed === 0
            ? "each has a car to tow it"
            : `${untowed} with no car to tow it`,
      tone: untowed > 0 ? "warn" : undefined,
    },
    nextPhaseTile(nextPhase(input.phases, today), now),
  ];

  const rows = ATTENDANCE_PHASES.map((phase) => ({
    phase,
    crew: phaseCrew(
      input.attendance.phases,
      input.attendance.notAnsweredCount,
      phase,
    ),
    open: attendanceIsOpen(
      input.phases.find((r) => r.phase === phase)?.startDate,
      today,
    ),
  }));
  const bars: GlanceBars = {
    heading: "Who helps on which day",
    rows: rows.map(({ phase, crew }) => ({
      key: phase,
      label: LOGISTICS_PHASE_LABELS[phase],
      value: `${crew.going} going`,
      segments: [
        { label: "going", count: crew.going, tone: "ok" },
        { label: "maybe", count: crew.maybe, tone: "warn" },
        { label: "can't", count: crew.cant, tone: "bad" },
        { label: "not answered", count: crew.notAnswered, tone: "none" },
      ],
    })),
    legend: CREW_LEGEND,
  };

  const attention: GlanceAttention[] = [];
  if (openRequests !== null && openRequests > 0) {
    attention.push({
      key: "lifts",
      tone: "warn",
      text:
        openRequests === 1
          ? "1 lift request is waiting for an answer."
          : `${openRequests} lift requests are waiting for an answer.`,
      link: { href: TRANSPORT_HREF, label: "Transport" },
    });
  }
  if (untowed > 0) {
    attention.push({
      key: "trailers",
      tone: "warn",
      text:
        untowed === 1
          ? "1 trailer has no car to tow it."
          : `${untowed} trailers have no car to tow them.`,
      link: { href: TRANSPORT_HREF, label: "Transport" },
    });
  }
  for (const { phase, crew, open } of rows) {
    if (!open || crew.notAnswered === 0) continue;
    attention.push({
      key: `crew-${phase}`,
      tone: "warn",
      text: `${LOGISTICS_PHASE_LABELS[phase]}: ${plural(crew.notAnswered, "person", "people")} coming ${crew.notAnswered === 1 ? "has" : "have"} not said if they help.`,
      link: { href: LOGISTICS_HREF, label: "Logistics" },
    });
  }

  return {
    title: "Getting there",
    tiles,
    bars: [bars],
    attention: attention.slice(0, ATTENTION_LIMIT),
    links: [
      { href: TRANSPORT_HREF, label: "Transport" },
      { href: LOGISTICS_HREF, label: "Logistics" },
    ],
  };
}
