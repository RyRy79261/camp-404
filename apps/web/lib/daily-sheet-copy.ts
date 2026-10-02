// The daily site sheet's fixed words and address (#249). A plain module, so
// the console pages and the print page share them.

export const DAILY_SHEET_PRINT_PATH = "/print/daily-sheet";

/** Every day of the Burn, each a sheet and its General page. */
export const EVERY_DAY = "all";

/** The address of one day's sheets, or every day's. */
export function dailySheetHref(day: string | null): string {
  return `${DAILY_SHEET_PRINT_PATH}?day=${day ?? EVERY_DAY}`;
}

/** Who may print it: allergies are safety data (captains and team leads). */
export const DAILY_SHEET_REFUSAL =
  "Only captains and team leads can print the daily site sheet: it lists the camp's allergies.";
