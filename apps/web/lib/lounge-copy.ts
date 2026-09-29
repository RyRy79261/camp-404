import { bandRange, clockText } from "@camp404/core";
import type {
  LoungeBand,
  LoungeNeed,
  LoungeOfferKind,
  LoungeOfferStatus,
} from "@camp404/types";

// The lounge screens' fixed sentences, paths and labels (#269). A plain
// module: a "use server" file may export only async functions, so the lounge
// actions and the screens that show these words share them from here. Pure,
// so the client dialogs import it too.

export const LOUNGE_PATH = "/lounge";
export const LOUNGE_PRINT_PATH = "/print/lounge";

/** What anyone who does not run the lounge is told, on the page and by the action. */
export const LOUNGE_REFUSAL =
  "Only captains and Ministry of Vibes leads can accept offers and place them in the programme.";
export const CHECK_OFFER = "Check the offer and try again.";
export const CHECK_PLACE = "Pick a day and a start time.";
export const CHECK_NOTE = "Check the music note and try again.";

export const KIND_LABELS: Record<LoungeOfferKind, string> = {
  activity: "Activity",
  dj_set: "DJ set",
  workshop: "Workshop",
  other: "Other",
};

export const STATUS_LABELS: Record<LoungeOfferStatus, string> = {
  offered: "Waiting for a decision",
  accepted: "Accepted",
  declined: "Declined",
  needs_changes: "Changes asked for",
};

export const NEED_LABELS: Record<LoungeNeed, string> = {
  space: "Space",
  sound: "Sound",
  power: "Power",
  materials: "Materials",
};

export const BAND_NAMES: Record<LoungeBand, string> = {
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  sunset: "Sunset",
  night: "Night",
  late_night: "Late night",
};

/** "Sunset, 18:00–22:00". */
export function bandLabel(band: LoungeBand): string {
  const { from, to } = bandRange(band);
  return `${BAND_NAMES[band]}, ${clockText(from)}–${clockText(to)}`;
}

/** "18:00–19:30", from a start and a length. */
export function timeRangeText(startMinute: number, minutes: number): string {
  return `${clockText(startMinute)}–${clockText(startMinute + minutes)}`;
}

/** The lengths the offer form offers, in minutes. */
export const DURATION_CHOICES = [
  30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480,
] as const;

/**
 * A host's name for paper: the first name and a surname initial (#249: "Printed
 * rosters use first names"). An address stands in for a name on an account
 * that never set one, and is never printed.
 */
export function printName(name: string): string {
  if (name.includes("@") || name === "Unnamed member") return "Camp member";
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last
    ? `${first} ${last[0]!.toUpperCase()}.`
    : (first ?? "Camp member");
}

/** The band names only, for a compact line: "Morning, Sunset". */
export function bandsText(bands: readonly LoungeBand[]): string {
  return bands.map((b) => BAND_NAMES[b]).join(", ");
}
