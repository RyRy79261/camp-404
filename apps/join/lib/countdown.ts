import type { BurnPhase } from "@camp404/core";

// The taskbar's words for the countdown to the Burn. The date maths (camp
// days, the phase, the dates label) is @camp404/core's, shared with the
// console: campDayKey, burnPhase and burnDatesLabel.

/** The taskbar's words for it. */
export function countdownLabel(c: BurnPhase): string {
  switch (c.phase) {
    case "before":
      return c.days === 1
        ? "T-1 day to the Burn"
        : `T-${c.days} days to the Burn`;
    case "during":
      return `The Burn · day ${c.day}`;
    case "after":
      return "See you next Burn";
  }
}

/** The same, short enough for a phone's taskbar. */
export function countdownShort(c: BurnPhase): string {
  switch (c.phase) {
    case "before":
      return `T-${c.days}d`;
    case "during":
      return `Day ${c.day}`;
    case "after":
      return "Burnt";
  }
}
