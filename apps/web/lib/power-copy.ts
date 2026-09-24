import type {
  FuelType,
  GeneratorOwner,
  LoadCategory,
  LoadOwner,
} from "@camp404/types";

// The power screens' fixed sentences, paths and labels (#253, #254). A plain
// module: a "use server" file may export only async functions, so the power
// actions and the screens that show these words share them from here. Pure,
// so the client dialogs import it too.

export const POWER_LOADS_PATH = "/power/loads";
export const POWER_FUEL_PATH = "/power/fuel";

/** What anyone who is not an editor is told, on the page and by the action. */
export const POWER_REFUSAL =
  "Only captains and Power & Lighting leads can change the power plan.";
export const CHECK_LOAD = "Check the load and try again.";
export const CHECK_PLAN = "Check the plan settings and try again.";
export const CHECK_GENERATOR = "Check the generator and try again.";

export const CATEGORY_LABELS: Record<LoadCategory, string> = {
  refrigeration: "Refrigeration",
  lighting_functional: "Lighting (functional)",
  lighting_decorative: "Lighting (decorative)",
  sound: "Sound",
  charging: "Charging",
  tools: "Tools",
  other: "Other",
};

export const OWNER_LABELS: Record<LoadOwner, string> = {
  camp: "Camp",
  // A member's own load names no member: the camp sees only this.
  member: "Member-owned",
  neighbour: "Neighbour",
};

/** Whose a generator is. A lent one names no member. */
export const GENERATOR_OWNER_LABELS: Record<GeneratorOwner, string> = {
  camp: "Camp",
  member_lent: "Lent by a member",
  hired: "Hired",
};

export const FUEL_LABELS: Record<FuelType, string> = {
  petrol: "Petrol",
  diesel: "Diesel",
};

/** A load's owner as the list shows it. */
export function ownerText(load: {
  owner: LoadOwner;
  neighbourCamp: string | null;
}): string {
  if (load.owner === "neighbour" && load.neighbourCamp) {
    return `Neighbour: ${load.neighbourCamp}`;
  }
  return OWNER_LABELS[load.owner];
}

/** "18:00", from a whole hour. */
export function hourText(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** A generator's daily schedule: "24 h" or "18:00–06:00". */
export function runText(fromHour: number | null, toHour: number | null) {
  if (fromHour === null || toHour === null) return "24 h";
  return `${hourText(fromHour)}–${hourText(toHour)}`;
}

/** "24 h", "6 h a day", or the windows: "18:00–02:00, 06:00–08:00". */
export function scheduleText(load: {
  schedule: "full_time" | "hours_per_day" | "windows";
  hoursPerDay: number | null;
  windows: readonly { fromHour: number; toHour: number }[] | null;
}): string {
  switch (load.schedule) {
    case "full_time":
      return "24 h";
    case "hours_per_day":
      return `${formatNumber(load.hoursPerDay ?? 0, 1)} h a day`;
    case "windows":
      return (load.windows ?? [])
        .map((w) => `${hourText(w.fromHour)}–${hourText(w.toHour)}`)
        .join(", ");
  }
}

/** "All days", "Day 3" or "Days 2–5". */
export function daysText(load: {
  fromDay: number | null;
  toDay: number | null;
}): string {
  if (load.fromDay == null || load.toDay == null) return "All days";
  if (load.fromDay === load.toDay) return `Day ${load.fromDay}`;
  return `Days ${load.fromDay}–${load.toDay}`;
}

// en-GB, not en-ZA: the load list's figures read with a decimal point
// ("10.56 kWh"), as the camp's spreadsheet always did.
const formats = new Map<string, Intl.NumberFormat>();

/** A figure to at most `digits` places, or exactly `digits` when `fixed`. */
export function formatNumber(
  value: number,
  digits: number,
  fixed = false,
): string {
  const key = `${digits}:${fixed}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.NumberFormat("en-GB", {
      maximumFractionDigits: digits,
      minimumFractionDigits: fixed ? digits : 0,
    });
    formats.set(key, format);
  }
  return format.format(Number.isFinite(value) ? value : 0);
}

/** Watts as kW, two places: "0.80 kW". */
export function kw(watts: number): string {
  return `${formatNumber(watts / 1000, 2, true)} kW`;
}

/** Watt-hours as kWh, two places: "10.56 kWh". */
export function kwh(wattHours: number): string {
  return `${formatNumber(wattHours / 1000, 2, true)} kWh`;
}

/** Watts, whole: "1,280 W". */
export function watts(value: number): string {
  return `${formatNumber(value, 0)} W`;
}

/** A percentage, to at most one place: "64%", "32.5%". */
export function pct(value: number): string {
  return `${formatNumber(value, 1)}%`;
}

/** Litres, to `digits` places: "19.73 L". */
export function litres(value: number, digits = 1): string {
  return `${formatNumber(value, digits, true)} L`;
}
