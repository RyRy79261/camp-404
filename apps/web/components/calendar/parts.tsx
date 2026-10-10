import { cn } from "@camp404/ui/lib/utils";
import { teamColorFor } from "@/app/(console)/captains/camp-management/roster-presentation";
import type { CalendarEntry } from "@/lib/calendar-month";

// The Calendar's small shared parts, in the approved mock-up's grammar
// (camp404-night/design/calendar-meetings.html, owner 2026-10-10): plain
// elements on purpose, as the Kitchen's, because the kit's Button turns every
// label into pixel capitals and the mock-up draws these in sentence case.

/**
 * The panel's frame: its natural height above the calendar in a narrow
 * window (the window scrolls), the calendar's height beside it in a wide one
 * (the panel scrolls), the whole screen on a phone.
 */
export const PANEL_FRAME =
  "flex shrink-0 flex-col border border-border bg-card @min-[56rem]/page:order-last @min-[56rem]/page:min-h-0 @min-[56rem]/page:w-[23.75rem] max-md:fixed max-md:inset-x-0 max-md:top-0 max-md:bottom-[var(--os-phone-bar,0px)] max-md:z-50 max-md:min-h-0 max-md:border-0";

/** What fills the panel, where the panel has a height of its own. */
export const PANEL_FILL =
  "@min-[56rem]/page:min-h-0 @min-[56rem]/page:flex-1 max-md:min-h-0 max-md:flex-1";

/** What scrolls inside the panel, where the panel has a height of its own. */
export const PANEL_SCROLL = `${PANEL_FILL} @min-[56rem]/page:overflow-y-auto max-md:overflow-y-auto`;

/** The pink main action (New event, Add to the calendar). */
export const PRIMARY_BUTTON =
  "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap border border-primary bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60";

/** A quiet outlined button (Today, Edit event, Cancel). */
export const QUIET_BUTTON =
  "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap border border-[var(--color-choice-edge,var(--color-input))] bg-transparent px-3.5 text-[13px] font-semibold text-foreground hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60";

/** A small quiet button inside the panel (Edit, Copy link). */
export const SMALL_BUTTON =
  "inline-flex h-[30px] items-center justify-center gap-1.5 whitespace-nowrap border border-[var(--color-choice-edge,var(--color-input))] px-2.5 text-xs font-semibold text-foreground hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60";

/** A ghost link-button in a section's heading (Edit). */
export const GHOST_BUTTON =
  "inline-flex h-7 items-center gap-1.5 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** The pixel capitals of a panel's or a section's heading. */
export const PIXEL_HEADING =
  "font-[family-name:var(--os-font-pixel)] text-[11px] font-normal uppercase tracking-[0.15em]";

/** A small label in capitals (DECISIONS, TEAM). */
export const SMALL_CAPS =
  "text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground";

/** An event's colour: its team's, or the camp's own pink for the whole camp. */
export function entryColour(entry: Pick<CalendarEntry, "team">): string {
  return entry.team ? teamColorFor(entry.team.key) : "var(--color-primary)";
}

/**
 * The meeting mark: a page, filled once the minutes are written, an outline
 * while they are not. Decoration beside words that say it, so it is hidden
 * from assistive tech.
 */
export function MeetingMark({
  written,
  className,
}: {
  written: boolean;
  className?: string;
}) {
  return written ? (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={cn("h-3 w-3 shrink-0", className)}
      data-meeting-mark="written"
    >
      <rect x="1.5" y="1" width="9" height="10" fill="currentColor" />
      <path
        d="M3.5 4h5M3.5 6h5M3.5 8h3"
        stroke="var(--color-background)"
        strokeWidth="1.2"
      />
    </svg>
  ) : (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={cn("h-3 w-3 shrink-0", className)}
      data-meeting-mark="none"
    >
      <rect
        x="1.5"
        y="1"
        width="9"
        height="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M3.5 4h5M3.5 6h5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** "MEETING" in the pixel face, outlined in the main colour. */
export function MeetingBadge() {
  return (
    <span className="inline-flex items-center border border-primary px-2 py-0.5 font-[family-name:var(--os-font-pixel)] text-[9px] leading-4 tracking-[0.12em] text-primary">
      MEETING
    </span>
  );
}

/** The team's badge: its colour as a square, and its name. */
export function TeamBadge({ entry }: { entry: Pick<CalendarEntry, "team"> }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap border border-border px-2 py-0.5 text-[11px] font-semibold leading-4 text-foreground">
      <i
        aria-hidden
        className="block h-2 w-2 shrink-0"
        style={{ background: entryColour(entry) }}
      />
      {entry.team?.label ?? "Whole camp"}
    </span>
  );
}
