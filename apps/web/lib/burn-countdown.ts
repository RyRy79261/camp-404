import { burnPhase, campDayKey } from "@camp404/core";

// The tray's countdown to the Burn (visual-language doc 4.7), in whole camp
// days (CAMP_TIME_ZONE); the date maths is @camp404/core's burnPhase, shared
// with the join site. A plain module: the desktop draws it in the browser,
// once a minute with the clock.

/**
 * The countdown's words for `now`, or null when there is nothing to say (no
 * dates set, a bad date, or the Burn is over).
 */
export function burnCountdownLabel(
  now: Date,
  burn: { start: string; end: string } | null,
): string | null {
  if (!burn) return null;
  const phase = burnPhase(campDayKey(now), burn);
  if (phase?.phase === "before") {
    return phase.days === 1
      ? "1 day to the Burn"
      : `${phase.days} days to the Burn`;
  }
  if (phase?.phase === "during") return `The Burn, day ${phase.day}`;
  return null;
}
