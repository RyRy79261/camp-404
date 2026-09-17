// A wait, in words a member reads: "Try again in 7 minutes." Rounded UP to a
// whole unit, so the wait is never shorter than said.

/** `seconds` as "less than a minute", "N minutes", "N hours" or "N days". */
export function humanDuration(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return "less than a minute";
  const plural = (n: number, unit: string) =>
    `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (s < 3_600) return plural(Math.ceil(s / 60), "minute");
  if (s < 86_400) return plural(Math.ceil(s / 3_600), "hour");
  return plural(Math.ceil(s / 86_400), "day");
}
