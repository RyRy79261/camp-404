import { campDayKey } from "@camp404/core";
import type { Team } from "@camp404/types";
import type { ShiftsView } from "@/lib/shifts";
import { SHIFTS_PATH, SHIFTS_PRINT_PATH } from "@/lib/shifts-copy";
import {
  ATTENTION_LIMIT,
  daysFrom,
  plural,
  type GlanceAttention,
  type GlanceTile,
  type TeamGlance,
} from "@/lib/team-glance";

// Sanitation and MOOP's panel on its team page (approved mock-up,
// docs/plans/2026-11-12-team-dashboards-mockup.html): the cleaning roster,
// which is this team's shifts (AGENTS.md: "cleaning is Sanitation's"). How
// many places are filled, which shifts still have places open, and when the
// first day stops taking changes (a slot takes changes only until its day
// starts: the roster is printed for site). Worked out from the Shifts page's
// own view, so the two never disagree. Counts only.
//
// "People coming with no cleaning shift" needs who is on each slot, which
// the view gives only to someone who manages this team's shifts (a captain
// or its lead), and who is coming (leads and captains): the tile is theirs.

export const CLEANING_TEAM: Team = "sanitation_and_water";

export function sanitationGlance(input: {
  now: Date;
  view: ShiftsView;
}): TeamGlance {
  const { view, now } = input;
  const today = campDayKey(now);
  const slots = view.days.flatMap((d) =>
    d.slots
      .filter((s) => s.type.team === CLEANING_TEAM && s.status === "open")
      .map((s) => ({ ...s, dayLabel: d.label })),
  );
  const places = slots.reduce((n, s) => n + s.type.places, 0);
  const filled = slots.reduce(
    (n, s) => n + Math.min(s.taken, s.type.places),
    0,
  );
  // Short shifts still taking changes, soonest first (the view's order).
  const short = slots.filter((s) => s.open && s.taken < s.type.places);
  const firstOpenDay = slots.find((s) => s.day >= today)?.day ?? null;

  // Who is coming with no cleaning shift: only with both halves in view.
  const manages = slots.length > 0 && slots.every((s) => s.people !== null);
  let notSignedUp: number | null = null;
  if (view.fairness && manages) {
    const onCleaning = new Set(
      slots.flatMap((s) => s.people!.map((p) => p.userId)),
    );
    notSignedUp = view.fairness.filter((r) => !onCleaning.has(r.userId)).length;
  }

  const tiles: GlanceTile[] = [
    {
      key: "places",
      label: "Places filled",
      value: places === 0 ? "—" : `${filled} of ${places}`,
      hint:
        places === 0
          ? "No cleaning shifts set up yet"
          : "on the cleaning roster",
      ...(places > 0 ? { progress: { value: filled, max: places } } : {}),
    },
    {
      key: "short",
      label: "Shifts with places open",
      value: String(short.length),
      hint:
        short.length === 0
          ? places === 0
            ? "Nothing to fill yet"
            : "Every shift is full"
          : "still taking sign-ups",
      ...(short.length > 0 ? { tone: "warn" as const } : {}),
    },
  ];
  if (notSignedUp !== null) {
    tiles.push({
      key: "not-signed-up",
      label: "Not signed up",
      value: String(notSignedUp),
      hint: "people coming with no cleaning shift",
    });
  }
  tiles.push({
    key: "close",
    label: "Changes close",
    value: daysFrom(now, firstOpenDay) ?? "—",
    hint: firstOpenDay
      ? "for the first day; each day closes as it starts"
      : places === 0
        ? "No cleaning days yet"
        : "Every day has started",
  });

  const shown = short.slice(
    0,
    short.length > ATTENTION_LIMIT ? ATTENTION_LIMIT - 1 : ATTENTION_LIMIT,
  );
  const link = { href: SHIFTS_PATH, label: "Shifts" };
  const attention: GlanceAttention[] = shown.map((s) => ({
    key: s.id,
    tone: s.taken === 0 ? "bad" : "warn",
    text: `${s.dayLabel}, ${s.type.name}: ${s.taken} of ${s.type.places}.`,
    link: { href: `${SHIFTS_PATH}?day=${s.day}`, label: "Shifts" },
  }));
  if (short.length > shown.length) {
    attention.push({
      key: "more",
      tone: "warn",
      text: `${plural(short.length - shown.length, "more shift", "more shifts")} with places open.`,
      link,
    });
  }

  return {
    title: "Cleaning shifts",
    tiles,
    attention,
    links: [link, { href: SHIFTS_PRINT_PATH, label: "Print the roster" }],
  };
}
