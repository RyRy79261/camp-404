import {
  cellKey,
  compareByProgramme,
  loungeOverlaps,
  outsidePreferences,
  programmeGrid,
  type LoungeDay,
} from "@camp404/core";
import type { LoungeBand, LoungeOfferKind } from "@camp404/types";
import type { LoungeProgramme } from "@camp404/db/lounge";
import { KIND_LABELS, timeRangeText } from "./lounge-copy";

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
