import type { MealOfTheDay } from "@camp404/types";

// The Kitchen's shared words and class lists, in the approved mock-ups'
// grammar (design/approved-{kmp,rp,kmenu,ks}.html, owner 2026-10-01). A plain
// module, so the server's member menu and the client's editors both read it
// (kit.tsx holds the client parts).

/** A small pixel label in capitals, the mock-ups' column and field labels. */
export const PIXEL_LABEL =
  "font-[family-name:var(--os-font-pixel)] text-[10px] leading-3 uppercase tracking-[0.15em] text-muted-foreground font-normal";

/** A form label in small capitals (the mock-ups' "FILTER", "SEARCH"). */
export const FIELD_LABEL =
  "text-[11px] leading-4 font-semibold uppercase tracking-[0.08em] text-muted-foreground";

/** A quiet outlined button (Copy, Tick all, Done, Add snack). */
export const QUIET_BUTTON =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap border border-input bg-secondary px-3 text-[13px] font-semibold text-foreground hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60";

/** The pink action on a row (Add to dinner). */
export const PINK_BUTTON =
  "inline-flex h-8 w-28 items-center justify-center whitespace-nowrap border border-primary bg-primary px-3 text-[13px] font-semibold text-primary-foreground hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60";

/** "1 h 10", "45 min": a recipe's time, as the picker shows it. */
export function formatCookTime(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** "Day 3 · Sat 24 Apr" into its day ("Day 3") and its date ("Sat 24 Apr"). */
export function splitDayLabel(label: string): {
  day: string;
  date: string | null;
} {
  const [day, date] = label.split(" · ");
  return { day: day ?? label, date: date ?? null };
}

/** "Day 1, dinner": how the menu's controls and lists name a meal. */
export function mealName(day: number, meal: MealOfTheDay): string {
  return `Day ${day}, ${meal}`;
}
