import type { LoungeDay } from "@camp404/core";
import { LOUNGE_BANDS } from "@camp404/types";
import type { LoungeProgramme } from "@/lib/lounge";
import { BAND_NAMES, LOUNGE_PATH } from "@/lib/lounge-copy";
import {
  buildProgramme,
  filterCounts,
  isOpen,
  type OfferStage,
} from "@/lib/lounge-view";
import {
  ATTENTION_LIMIT,
  plural,
  type GlanceAttention,
  type TeamGlance,
} from "@/lib/team-glance";

// The Ministry of Vibes' panel on its team page (approved mock-up,
// docs/plans/2026-11-12-team-dashboards-mockup.html): how full the lounge's
// days × times grid is, what waits on the Ministry, and how many DJ sets and
// activities are on. Worked out with the lounge page's own grid, so the two
// never disagree. Counts and the empty cells only: no host, no offer named.

export interface LoungeGlanceInput {
  days: readonly LoungeDay[];
  programme: LoungeProgramme;
  /** Every offer's stage this year (offerStage); only counted here. */
  stages: readonly OfferStage[];
}

const BAND_WORD = Object.fromEntries(
  LOUNGE_BANDS.map((b) => [b, BAND_NAMES[b].toLowerCase()]),
) as Record<(typeof LOUNGE_BANDS)[number], string>;

export function loungeGlance(input: LoungeGlanceInput): TeamGlance {
  const { days, programme } = input;
  const view = buildProgramme(programme, days);
  const cells = days.flatMap((d) =>
    LOUNGE_BANDS.map((band) => ({ day: d, band })),
  );
  const open = cells.filter((c) => isOpen(view, c.day.day, c.band));
  const filled = cells.length - open.length;
  const counts = filterCounts(input.stages);
  const waiting = counts.act;
  const onProgramme = new Set(programme.slots.map((s) => s.offerId));
  const placedOffers = programme.offers.filter((o) => onProgramme.has(o.id));
  const djSets = placedOffers.filter((o) => o.kind === "dj_set").length;
  const others = placedOffers.length - djSets;

  const lounge = { href: LOUNGE_PATH, label: "Lounge" };
  const attention: GlanceAttention[] = [];
  if (waiting > 0) {
    attention.push({
      key: "waiting",
      tone: "warn",
      text: `${plural(waiting, "offer is", "offers are")} waiting for a yes or a place on the grid.`,
      link: { href: `${LOUNGE_PATH}?tab=offers`, label: "Offers" },
    });
  }
  // Only when something is on: an empty grid is one sentence, not 48.
  if (filled > 0) {
    const room = ATTENTION_LIMIT - attention.length;
    const shown = open.slice(0, open.length > room ? room - 1 : room);
    for (const c of shown) {
      attention.push({
        key: `open-${c.day.day}-${c.band}`,
        tone: "warn",
        text: `${c.day.short} ${BAND_WORD[c.band]} has nothing on.`,
        link: lounge,
      });
    }
    if (open.length > shown.length) {
      attention.push({
        key: "open-more",
        tone: "warn",
        text: `${plural(open.length - shown.length, "more time", "more times")} with nothing on.`,
        link: lounge,
      });
    }
  }

  return {
    title: "The lounge",
    tiles: [
      {
        key: "slots",
        label: "Lounge times filled",
        value: `${filled} of ${cells.length}`,
        hint:
          filled === 0
            ? "Nothing on the programme yet"
            : "on the days × times grid",
        progress: { value: filled, max: cells.length },
      },
      {
        key: "waiting",
        label: "Offers waiting",
        value: String(waiting),
        hint:
          waiting === 0
            ? "Nothing waiting"
            : "for a Vibes lead to decide or place",
        ...(waiting > 0 ? { tone: "warn" as const } : {}),
      },
      {
        key: "dj",
        label: "DJ sets",
        value: String(djSets),
        hint: "on the programme",
      },
      {
        key: "activities",
        label: "Activities",
        value: String(others),
        hint: "activities and workshops on the programme",
      },
    ],
    attention,
    links: [{ href: LOUNGE_PATH, label: "Lounge programme" }],
  };
}
