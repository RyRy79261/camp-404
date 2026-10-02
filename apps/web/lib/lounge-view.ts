import {
  PROGRAMME_DAY_START,
  bandRange,
  cellKey,
  clockText,
  compareByProgramme,
  loungeOverlaps,
  outsidePreferences,
  programmeGrid,
  programmeMinute,
  type LoungeDay,
} from "@camp404/core";
import {
  LOUNGE_BANDS,
  LOUNGE_STEP_MINUTES,
  type LoungeBand,
  type LoungeOfferKind,
  type LoungeOfferStatus,
} from "@camp404/types";
import type { LoungeProgramme } from "@camp404/db/lounge";
import { BAND_NAMES, KIND_LABELS, timeRangeText } from "./lounge-copy";

// The lounge programme as the screens draw it (#269): each placed item with
// its offer's words and its warnings, filed into the days × bands grid, and
// the list for the AfrikaBurn event guide. Pure, so the page, the print view
// and the tests share one answer.

export interface ProgrammeItem {
  id: string;
  offerId: string;
  day: number;
  startMinute: number;
  durationMinutes: number;
  hostId: null;
  title: string;
  description: string | null;
  kind: LoungeOfferKind;
  hostName: string;
  /** The titles of the items it overlaps in the lounge. */
  clashesWith: string[];
  /**
   * Where it is outside what the host asked for; only for the people who run
   * the lounge (the host's preferences are not the camp's to read).
   */
  outside: { day: boolean; band: boolean } | null;
}

export interface ProgrammeView {
  items: ProgrammeItem[];
  /** The grid's cells, keyed by cellKey(day, band). */
  cells: Map<string, ProgrammeItem[]>;
  /** Items on a day the grid no longer has (the Burn's dates were shortened). */
  offGrid: ProgrammeItem[];
}

/**
 * The programme's items with their warnings. `preferences` is given only to
 * someone who runs the lounge; without it no item says anything about what
 * the host asked for.
 */
export function buildProgramme(
  programme: LoungeProgramme,
  days: readonly LoungeDay[],
  preferences?: ReadonlyMap<
    string,
    { preferredDays: readonly number[]; preferredBands: readonly LoungeBand[] }
  >,
): ProgrammeView {
  const offers = new Map(programme.offers.map((o) => [o.id, o]));
  const placed = programme.slots.flatMap((slot) => {
    const offer = offers.get(slot.offerId);
    return offer ? [{ slot, offer }] : [];
  });
  const overlaps = loungeOverlaps(
    placed.map(({ slot, offer }) => ({
      id: slot.id,
      day: slot.day,
      startMinute: slot.startMinute,
      durationMinutes: offer.durationMinutes,
      hostId: null,
    })),
  );
  const titleOf = new Map(
    placed.map(({ slot, offer }) => [slot.id, offer.title]),
  );
  const items: ProgrammeItem[] = placed
    .map(({ slot, offer }) => {
      const wanted = preferences?.get(offer.id);
      return {
        id: slot.id,
        offerId: offer.id,
        day: slot.day,
        startMinute: slot.startMinute,
        durationMinutes: offer.durationMinutes,
        hostId: null,
        title: offer.title,
        description: offer.description,
        kind: offer.kind,
        hostName: offer.hostName,
        clashesWith: (overlaps.get(slot.id) ?? []).map(
          (id) => titleOf.get(id) ?? "",
        ),
        outside: wanted ? outsidePreferences(wanted, slot) : null,
      };
    })
    .sort(compareByProgramme);
  const onGrid = new Set(days.map((d) => d.day));
  return {
    items,
    cells: programmeGrid(items, days),
    offGrid: items.filter((i) => !onGrid.has(i.day)),
  };
}

/** One day's items, in programme order: the printed daily programme. */
export function dayItems(view: ProgrammeView, day: number): ProgrammeItem[] {
  return view.items.filter((i) => i.day === day);
}

export { cellKey };

export interface GuideEntry {
  offerId: string;
  title: string;
  kind: LoungeOfferKind;
  hostName: string;
  description: string | null;
  recurring: boolean;
  /** "Day 2 · Thu 29 Apr, 07:00–08:00", one per placement. */
  times: string[];
  /** The same, short, for the screen: "Day 2, 3 · 07:00–08:00". */
  when: string;
}

/**
 * The accepted offers whose hosts asked for the AfrikaBurn event guide, with
 * their times on the programme, recurring ones first (the guide lists those).
 */
export function guideEntries(
  programme: LoungeProgramme,
  days: readonly LoungeDay[],
): GuideEntry[] {
  const labelOf = new Map(days.map((d) => [d.day, d.label]));
  return programme.offers
    .filter((o) => o.publicGuide)
    .map((o) => ({
      offerId: o.id,
      title: o.title,
      kind: o.kind,
      hostName: o.hostName,
      description: o.description,
      recurring: o.recurring,
      when: placedText(
        programme.slots.filter((s) => s.offerId === o.id),
        o.durationMinutes,
      ),
      times: programme.slots
        .filter((s) => s.offerId === o.id)
        .map(
          (s) =>
            `${labelOf.get(s.day) ?? `Day ${s.day}`}, ${timeRangeText(s.startMinute, o.durationMinutes)}`,
        ),
    }))
    .sort(
      (a, b) =>
        Number(b.recurring) - Number(a.recurring) ||
        a.title.localeCompare(b.title),
    );
}

/** The event guide list as plain text, to paste into the guide's submission. */
export function guideText(entries: readonly GuideEntry[]): string {
  return entries
    .map((e) =>
      [
        `${e.title} (${KIND_LABELS[e.kind]}${e.recurring ? ", recurring" : ""})`,
        e.description ?? "",
        e.times.length > 0 ? e.times.join("; ") : "Time not set yet",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

/** Whether a grid cell is open: nothing placed in it. */
export function isOpen(view: ProgrammeView, day: number, band: LoungeBand) {
  return (view.cells.get(cellKey(day, band)) ?? []).length === 0;
}

// --- The redesign's views (option A, owner 2026-10-01) -----------------------
// One day of the programme at a time, with the free time between items as
// "Nothing on" rows; the offers table's stages, filters and words; and where
// the place panel suggests putting an offer. Pure, so they are tested
// directly.

const DAY_MINUTES = 24 * 60;

/** A programme minute (0 is 06:00) back to a clock minute. */
function clockOf(programme: number): number {
  return (PROGRAMME_DAY_START + programme) % DAY_MINUTES;
}

/** One row of a day: an item, or the free time between two. */
export type DayRow =
  | { kind: "item"; item: ProgrammeItem }
  /** From and to are clock minutes; `all` is a day with nothing on at all. */
  | { kind: "gap"; from: number; to: number; all: boolean };

/**
 * One day's rows from 06:00 to 06:00: each item in programme order, and the
 * free time between them as one gap row each. Items that overlap share their
 * time; no gap is made inside it.
 */
export function dayRows(items: readonly ProgrammeItem[]): DayRow[] {
  if (items.length === 0) {
    return [
      {
        kind: "gap",
        from: PROGRAMME_DAY_START,
        to: PROGRAMME_DAY_START,
        all: true,
      },
    ];
  }
  const rows: DayRow[] = [];
  let free = 0;
  for (const item of [...items].sort(compareByProgramme)) {
    const start = programmeMinute(item.startMinute);
    if (start > free) {
      rows.push({
        kind: "gap",
        from: clockOf(free),
        to: clockOf(start),
        all: false,
      });
    }
    rows.push({ kind: "item", item });
    free = Math.max(free, start + item.durationMinutes);
  }
  if (free < DAY_MINUTES) {
    rows.push({
      kind: "gap",
      from: clockOf(free),
      to: PROGRAMME_DAY_START,
      all: false,
    });
  }
  return rows;
}

/**
 * The words of each item's ▲ on one day, for the people who run the lounge.
 * An overlap is told once, on the item that starts inside the other (the
 * approved mock-up), so a day with one clash shows one mark; a placement
 * outside what the host ticked is told on its own item.
 */
export function dayWarnings(
  items: readonly ProgrammeItem[],
): Map<string, string> {
  const ordered = [...items].sort(compareByProgramme);
  return new Map(
    ordered.map((item, i) => {
      const earlier = new Set(ordered.slice(0, i).map((x) => x.title));
      const out = item.clashesWith
        .filter((t) => earlier.has(t))
        .map((t) => `Overlaps ${t}.`);
      if (item.outside?.day) out.push("Not a day the host ticked.");
      if (item.outside?.band) out.push("Not a time the host ticked.");
      return [item.id, out.join(" ")];
    }),
  );
}

/**
 * The day the programme opens on: today during the Burn, otherwise the first
 * day with anything on, otherwise the first day.
 */
export function openingDay(
  items: readonly { day: number }[],
  days: readonly LoungeDay[],
  today: number | null,
): number {
  if (today !== null && days.some((d) => d.day === today)) return today;
  const first = days.find((d) => items.some((i) => i.day === d.day));
  return first?.day ?? days[0]?.day ?? 1;
}

/** Where an offer is in the Ministry's work: the offers table's status. */
export type OfferStage = "new" | "to_place" | "on" | "changes" | "declined";

export function offerStage(
  status: LoungeOfferStatus,
  placements: number,
): OfferStage {
  switch (status) {
    case "offered":
      return "new";
    case "accepted":
      return placements > 0 ? "on" : "to_place";
    case "needs_changes":
      return "changes";
    case "declined":
      return "declined";
  }
}

/** The offers table's filter. "To act on" is what waits on the Ministry. */
export type OfferFilter = "all" | "act" | "on" | "changes" | "declined";

export const OFFER_FILTERS: readonly { value: OfferFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "act", label: "To act on" },
  { value: "on", label: "On the programme" },
  { value: "changes", label: "Changes asked" },
  { value: "declined", label: "Declined" },
];

export function filterOf(stage: OfferStage): Exclude<OfferFilter, "all"> {
  if (stage === "new" || stage === "to_place") return "act";
  return stage;
}

export function filterCounts(
  stages: readonly OfferStage[],
): Record<OfferFilter, number> {
  const counts: Record<OfferFilter, number> = {
    all: stages.length,
    act: 0,
    on: 0,
    changes: 0,
    declined: 0,
  };
  for (const stage of stages) counts[filterOf(stage)] += 1;
  return counts;
}

/** The table's order: what waits on the Ministry first, then the rest. */
export const STAGE_ORDER: Record<OfferStage, number> = {
  new: 0,
  to_place: 1,
  on: 2,
  changes: 3,
  declined: 4,
};

/** The status chip's word for each stage: one word list everywhere. */
export const STAGE_LABELS: Record<OfferStage, string> = {
  new: "New",
  to_place: "Accepted",
  on: "On",
  changes: "Changes asked",
  declined: "Declined",
};

/** A list of numbers as words: "2", "4 or 6", "2, 3 or 4". */
function orList(values: readonly (string | number)[]): string {
  if (values.length <= 1) return values.join("");
  return `${values.slice(0, -1).join(", ")} or ${values.at(-1)}`;
}

/** What the host asked for: "Day 4 or 6" over "Afternoon". */
export function wantsText(offer: {
  preferredDays: readonly number[];
  preferredBands: readonly LoungeBand[];
}): { days: string; times: string } {
  const days = [...offer.preferredDays].sort((a, b) => a - b);
  return {
    days: days.length === 0 ? "Any day" : `Day ${orList(days)}`,
    times:
      offer.preferredBands.length === 0
        ? "Any time"
        : offer.preferredBands.map((b) => BAND_NAMES[b]).join(", "),
  };
}

/**
 * Where an offer is on the programme, short: "Day 2, 3 · 07:00", or with its
 * length "Day 2, 3 · 07:00–08:00". Placements that start at the same time
 * share one entry.
 */
export function placedText(
  slots: readonly { day: number; startMinute: number }[],
  minutes?: number,
): string {
  const byStart = new Map<number, number[]>();
  for (const s of [...slots].sort(
    (a, b) =>
      a.day - b.day ||
      programmeMinute(a.startMinute) - programmeMinute(b.startMinute),
  )) {
    byStart.set(s.startMinute, [...(byStart.get(s.startMinute) ?? []), s.day]);
  }
  return [...byStart]
    .map(
      ([start, days]) =>
        `Day ${days.join(", ")} · ${
          minutes === undefined
            ? clockText(start)
            : timeRangeText(start, minutes)
        }`,
    )
    .join("; ");
}

/** A host's first name, for "Waiting for Thandi". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** One item on the programme, as the place panel checks against it. */
export interface PlacedLite {
  id: string;
  day: number;
  startMinute: number;
  durationMinutes: number;
  title: string;
}

/** The items a new placement would overlap. */
export function clashesOf(
  candidate: { day: number; startMinute: number; durationMinutes: number },
  placed: readonly PlacedLite[],
): PlacedLite[] {
  const ids =
    loungeOverlaps([
      { ...candidate, id: "__new__", hostId: null },
      ...placed.map((p) => ({ ...p, hostId: null })),
    ]).get("__new__") ?? [];
  return placed.filter((p) => ids.includes(p.id));
}

/** Every start time in programme order, from 06:00 to 05:45. */
export const START_TIMES: readonly number[] = Array.from(
  { length: DAY_MINUTES / LOUNGE_STEP_MINUTES },
  (_, i) => clockOf(i * LOUNGE_STEP_MINUTES),
);

/**
 * Where the place panel starts: the first free start inside the host's days
 * and times, on a day the offer is not on yet. Falls back to the host's first
 * day at the start of their first time when nothing is free.
 */
export function suggestPlacement(
  offer: {
    id: string;
    durationMinutes: number;
    preferredDays: readonly number[];
    preferredBands: readonly LoungeBand[];
  },
  days: readonly number[],
  placed: readonly (PlacedLite & { offerId: string })[],
): { day: number; startMinute: number } {
  const all = [...days];
  const wanted = offer.preferredDays.filter((d) => all.includes(d));
  const own = new Set(
    placed.filter((p) => p.offerId === offer.id).map((p) => p.day),
  );
  const order = [
    ...wanted.filter((d) => !own.has(d)),
    ...all.filter((d) => !own.has(d) && !wanted.includes(d)),
  ];
  const bands =
    offer.preferredBands.length > 0 ? offer.preferredBands : LOUNGE_BANDS;
  for (const day of order) {
    for (const band of bands) {
      const { from } = bandRange(band);
      for (let step = 0; step < (4 * 60) / LOUNGE_STEP_MINUTES; step++) {
        const startMinute = (from + step * LOUNGE_STEP_MINUTES) % DAY_MINUTES;
        const clash = clashesOf(
          { day, startMinute, durationMinutes: offer.durationMinutes },
          placed,
        );
        if (clash.length === 0) return { day, startMinute };
      }
    }
  }
  return {
    day: wanted[0] ?? all[0] ?? 1,
    startMinute: bandRange(bands[0] ?? "morning").from,
  };
}

/** What is already on that day in the same band as a start: the panel's line. */
export function alreadyThen(
  day: number,
  startMinute: number,
  placed: readonly PlacedLite[],
): PlacedLite[] {
  const band = Math.floor(programmeMinute(startMinute) / (4 * 60));
  return placed
    .filter(
      (p) =>
        p.day === day &&
        Math.floor(programmeMinute(p.startMinute) / (4 * 60)) === band,
    )
    .sort(
      (a, b) => programmeMinute(a.startMinute) - programmeMinute(b.startMinute),
    );
}

/** A day as the day picker and the day's card name it. */
export interface DayHeading {
  day: number;
  /** "Mon 26" under the day's number in the picker, or null with no dates. */
  chip: string | null;
  /** "Day 3 · Wednesday 28 April", or "Day 3" with no dates. */
  title: string;
  /** The phone's shorter title: "Day 3 · 28 April". */
  shortTitle: string;
}

const CHIP = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  timeZone: "UTC",
});
const LONG = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const SHORT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function dayHeadings(days: readonly LoungeDay[]): DayHeading[] {
  return days.map((d) => {
    const at = d.date ? new Date(`${d.date}T00:00:00Z`) : null;
    return {
      day: d.day,
      chip: at ? CHIP.format(at) : null,
      title: at ? `Day ${d.day} · ${LONG.format(at)}` : `Day ${d.day}`,
      shortTitle: at ? `Day ${d.day} · ${SHORT.format(at)}` : `Day ${d.day}`,
    };
  });
}
