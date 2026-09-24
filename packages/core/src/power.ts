import {
  ViewerRank,
  type LoadCategory,
  type LoadSchedule,
} from "@camp404/types";

// Power and fuel (#253 load list and calculator, #254 generators and fuel).
// Pure: no DB, no session, no next/*. The screens call these; the database
// rows map onto the plain shapes below.
//
// WHO MAY EDIT. Clearance stays global (AGENTS.md): a lead of ANY team stands
// on the `team_lead` rung everywhere. Team identity decides only who may edit
// HERE: a captain, or a lead of Power & Lighting. Anyone in the camp may read
// the list. It fails closed on a rank this module does not know. The write re-reads the actor's rank and led
// teams inside its own transaction and passes those here; it never takes a
// team list from the caller.
//
// UNITS. Watts (W) and watt-hours (Wh) for loads, kVA for generators, litres
// for fuel. Hours are whole hours, 0 to 23, and a day is 24 hourly buckets.
// Days are day numbers on site, counted from 1; dates are only labels.

/** The team whose leads keep the power plan. */
export const POWER_TEAM = "power_and_lighting";

function isViewerRank(rank: string): rank is ViewerRank {
  return ViewerRank.safeParse(rank).success;
}

/**
 * Whether someone may change the loads, the generators or the year's plan: a
 * captain, or a lead of Power & Lighting. `ledTeams` are the team keys they
 * lead this year.
 */
export function canEditPower(
  rank: string,
  ledTeams: readonly string[],
): boolean {
  if (!isViewerRank(rank)) return false;
  if (rank === "captain") return true;
  if (rank === "team_lead") return ledTeams.includes(POWER_TEAM);
  return false;
}

// --- Shapes ----------------------------------------------------------------

/** One time window, whole hours; `toHour` below `fromHour` runs past midnight. */
export interface PowerWindow {
  fromHour: number;
  toHour: number;
}

/** One row of the load list, as far as the maths needs it. */
export interface PowerLoad {
  area: string;
  category: LoadCategory;
  quantity: number;
  /** Running draw of one item, W. */
  wattsEach: number;
  /** Start-up draw of one item, W; the category default when absent. */
  surgeWattsEach?: number | null;
  /** Share of the time it draws, 1 to 100. */
  dutyPct: number;
  schedule: LoadSchedule;
  hoursPerDay?: number | null;
  windows?: readonly PowerWindow[] | null;
  /** First and last day on site it runs; neither means every day. */
  fromDay?: number | null;
  toDay?: number | null;
}

/** A generator, from its datasheet. */
export interface Generator {
  ratedKva: number;
  maxKva: number;
  tankLitres: number;
  /** Hours a full tank lasts at 50% load. */
  runtime50Hours: number;
  /** Hours a full tank lasts at 100% load. */
  runtime100Hours: number;
}

/** The year's plan settings. */
export interface PlanSettings {
  powerFactor: number;
  daysOnSite: number;
  /** The date of day 1, YYYY-MM-DD, only for labels. */
  firstPoweredDay: string | null;
  /** The generator's daily on-window; both null is 24 hours. */
  runFromHour: number | null;
  runToHour: number | null;
  /** The comparison scenario's on-window; both null is 24 hours. */
  compareRunFromHour: number | null;
  compareRunToHour: number | null;
  /** Multiplies the litres of each running hour below half load. */
  lowLoadFactor: number;
  safetyMarginPct: number;
  canLitres: number;
  cansOwned: number;
}

// --- One load --------------------------------------------------------------

/** How much more than its running draw a motor pulls when it starts. */
const REFRIGERATION_SURGE_MULTIPLE = 3;

/** The start-up draw of one item when none is stored. */
export function defaultSurgeWatts(
  load: Pick<PowerLoad, "category" | "wattsEach">,
): number {
  return load.category === "refrigeration"
    ? load.wattsEach * REFRIGERATION_SURGE_MULTIPLE
    : load.wattsEach;
}

/** The start-up draw of one item: the stored figure, else the default. */
export function surgeWattsEach(
  load: Pick<PowerLoad, "category" | "wattsEach" | "surgeWattsEach">,
): number {
  return load.surgeWattsEach ?? defaultSurgeWatts(load);
}

/** The average draw while it runs: quantity × watts × duty cycle. */
export function loadWatts(
  load: Pick<PowerLoad, "quantity" | "wattsEach" | "dutyPct">,
): number {
  return (load.quantity * load.wattsEach * load.dutyPct) / 100;
}

/** Everything plugged in at once, at full draw (no duty cycle). */
export function connectedWatts(
  load: Pick<PowerLoad, "quantity" | "wattsEach">,
): number {
  return load.quantity * load.wattsEach;
}

/** Whether a load runs on a day on site. No day range means every day. */
export function activeOnDay(
  load: Pick<PowerLoad, "fromDay" | "toDay">,
  day: number,
): boolean {
  if (load.fromDay == null || load.toDay == null) return true;
  return load.fromDay <= day && day <= load.toDay;
}

/**
 * The hours a window covers, from the start of `fromHour` up to the start of
 * `toHour`, wrapping past midnight. Equal hours cover none.
 */
function markWindow(hours: boolean[], fromHour: number, toHour: number) {
  const length = (((toHour - fromHour) % 24) + 24) % 24;
  for (let i = 0; i < length; i++) hours[(fromHour + i) % 24] = true;
}

/** The hours of the day a windowed load covers; overlapping windows count once. */
function windowHours(windows: readonly PowerWindow[] | null | undefined) {
  const hours = new Array<boolean>(24).fill(false);
  for (const w of windows ?? []) markWindow(hours, w.fromHour, w.toHour);
  return hours;
}

/** Hours a day the load runs, from its schedule. */
export function hoursOn(
  load: Pick<PowerLoad, "schedule" | "hoursPerDay" | "windows">,
): number {
  switch (load.schedule) {
    case "full_time":
      return 24;
    case "hours_per_day":
      return load.hoursPerDay ?? 0;
    case "windows":
      return windowHours(load.windows).filter(Boolean).length;
  }
}

/** Wh the load uses on a day on site; 0 on a day it does not run. */
export function energyPerDay(load: PowerLoad, day: number): number {
  if (!activeOnDay(load, day)) return 0;
  return loadWatts(load) * hoursOn(load);
}

// --- A day -----------------------------------------------------------------

/**
 * The watts drawn in each hour of a day: full-time loads in every hour and
 * windowed loads in their hours. Hours-per-day loads have no set hours, so
 * they are NOT placed here; peakLoad and fuelForPlan add them.
 */
export function hourlyBuckets(
  loads: readonly PowerLoad[],
  day: number,
): number[] {
  const buckets = new Array<number>(24).fill(0);
  for (const load of loads) {
    if (!activeOnDay(load, day)) continue;
    const watts = loadWatts(load);
    if (load.schedule === "full_time") {
      for (let h = 0; h < 24; h++) buckets[h]! += watts;
    } else if (load.schedule === "windows") {
      const hours = windowHours(load.windows);
      for (let h = 0; h < 24; h++) if (hours[h]) buckets[h]! += watts;
    }
  }
  return buckets;
}

function hoursPerDayLoads(loads: readonly PowerLoad[], day: number) {
  return loads.filter(
    (load) => load.schedule === "hours_per_day" && activeOnDay(load, day),
  );
}

export interface PeakLoad {
  watts: number;
  /** True when hours-per-day loads were added as if all on at once. */
  assumesAllOn: boolean;
}

/**
 * The most drawn at once on a day: the busiest hourly bucket, plus every
 * hours-per-day load on top, since nobody said when those run.
 */
export function peakLoad(loads: readonly PowerLoad[], day: number): PeakLoad {
  const partial = hoursPerDayLoads(loads, day);
  const busiestHour = Math.max(...hourlyBuckets(loads, day));
  const partialWatts = partial.reduce((sum, l) => sum + loadWatts(l), 0);
  return {
    watts: busiestHour + partialWatts,
    assumesAllOn: partial.length > 0,
  };
}

/**
 * The peak plus the biggest start-up draw of any one item that runs that day:
 * motors do not all start together. Conservative, because it does not take
 * that item's running draw back off.
 */
export function surgeHeadroomWatts(
  loads: readonly PowerLoad[],
  day: number,
): number {
  let largestSurge = 0;
  for (const load of loads) {
    if (!activeOnDay(load, day)) continue;
    largestSurge = Math.max(largestSurge, surgeWattsEach(load));
  }
  return peakLoad(loads, day).watts + largestSurge;
}

// --- Electrical ------------------------------------------------------------

/** Mains, which a load runs on unless it says otherwise: 230 V AC. */
export const MAINS_VOLTS = 230;

export function amps(watts: number, volts: number): number {
  return watts / volts;
}

/** Apparent power in kVA: kW ÷ power factor. */
export function apparentKva(watts: number, powerFactor: number): number {
  return watts / 1000 / powerFactor;
}

export interface GeneratorLoadPct {
  /** kW ÷ rated kVA: the looser figure, shown for reference. */
  kwBasedPct: number;
  /** kVA ÷ rated kVA: the stricter figure, which the bands use. */
  kvaBasedPct: number;
}

/** How loaded a generator is at the peak, both ways. */
export function generatorLoadPct(
  peakWatts: number,
  powerFactor: number,
  ratedKva: number,
): GeneratorLoadPct {
  return {
    kwBasedPct: (peakWatts / 1000 / ratedKva) * 100,
    kvaBasedPct: (apparentKva(peakWatts, powerFactor) / ratedKva) * 100,
  };
}

export type LoadBand = "green" | "amber" | "red";

/**
 * Green below 70%; amber from 70% to 90%; red above 90%, or when the surge
 * is more than the generator's maximum. Takes the kVA-based percentage.
 */
export function loadBand(
  kvaPct: number,
  surgeKva: number,
  maxKva: number,
): LoadBand {
  if (kvaPct > 90 || surgeKva > maxKva) return "red";
  if (kvaPct >= 70) return "amber";
  return "green";
}

/** A LED strip on a power supply: its watts and the amps at its voltage. */
export function ledStrip(
  volts: number,
  wattsPerMetre: number,
  metres: number,
): { watts: number; amps: number } {
  const watts = wattsPerMetre * metres;
  return { watts, amps: amps(watts, volts) };
}

/** A string of bulbs: count × watts each. */
export function bulbs(count: number, wattsEach: number): number {
  return count * wattsEach;
}

// --- The whole list --------------------------------------------------------

export interface PowerBreakdownRow {
  key: string;
  /** Average running draw, W. */
  watts: number;
  /** Wh a day, averaged over the days on site. */
  whPerDay: number;
}

export interface PowerTotals {
  connectedWatts: number;
  perDay: { day: number; wh: number }[];
  busiestDayKwh: number;
  /** kWh for the whole stay. */
  burnKwh: number;
  /** The highest peak of any day, and that day. */
  peak: PeakLoad & { day: number; kva: number };
  /** The highest surge headroom of any day. */
  surge: { watts: number; kva: number };
  byArea: PowerBreakdownRow[];
  byCategory: PowerBreakdownRow[];
}

function breakdown(
  loads: readonly PowerLoad[],
  keyOf: (load: PowerLoad) => string,
  days: number[],
): PowerBreakdownRow[] {
  const rows = new Map<string, PowerBreakdownRow>();
  for (const load of loads) {
    const key = keyOf(load);
    const row = rows.get(key) ?? { key, watts: 0, whPerDay: 0 };
    row.watts += loadWatts(load);
    const wh = days.reduce((sum, day) => sum + energyPerDay(load, day), 0);
    row.whPerDay += days.length > 0 ? wh / days.length : 0;
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (a, b) => b.whPerDay - a.whPerDay || a.key.localeCompare(b.key),
  );
}

/** An area as typed, grouped without regard to case or spaces. */
function areaKey(load: PowerLoad): string {
  return load.area.trim().toLowerCase() || "other";
}

/** The result panel's figures for the load list over the days on site. */
export function powerTotals(
  loads: readonly PowerLoad[],
  daysOnSite: number,
  powerFactor: number,
): PowerTotals {
  const days = Array.from(
    { length: Math.max(0, Math.floor(daysOnSite)) },
    (_, i) => i + 1,
  );
  const perDay = days.map((day) => ({
    day,
    wh: loads.reduce((sum, load) => sum + energyPerDay(load, day), 0),
  }));

  let peak: PeakLoad & { day: number } = {
    watts: 0,
    assumesAllOn: false,
    day: 1,
  };
  let surgeWatts = 0;
  for (const day of days) {
    const dayPeak = peakLoad(loads, day);
    if (dayPeak.watts > peak.watts) peak = { ...dayPeak, day };
    surgeWatts = Math.max(surgeWatts, surgeHeadroomWatts(loads, day));
  }

  const totalWh = perDay.reduce((sum, d) => sum + d.wh, 0);
  return {
    connectedWatts: loads.reduce((sum, load) => sum + connectedWatts(load), 0),
    perDay,
    busiestDayKwh: Math.max(0, ...perDay.map((d) => d.wh)) / 1000,
    burnKwh: totalWh / 1000,
    peak: { ...peak, kva: apparentKva(peak.watts, powerFactor) },
    surge: { watts: surgeWatts, kva: apparentKva(surgeWatts, powerFactor) },
    byArea: breakdown(loads, areaKey, days),
    byCategory: breakdown(loads, (load) => load.category, days),
  };
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A day on site as people read it: its date when the plan has a first powered
 * day (a UTC round trip, so month ends and leap years come from the platform),
 * otherwise "Day N".
 */
export function dayLabel(firstPoweredDay: string | null, day: number): string {
  const match = firstPoweredDay ? ISO_DAY.exec(firstPoweredDay) : null;
  if (!match) return `Day ${day}`;
  const [, y, m, d] = match;
  const date = new Date(
    Date.UTC(Number(y), Number(m) - 1, Number(d) + day - 1),
  );
  if (Number.isNaN(date.getTime())) return `Day ${day}`;
  return date.toISOString().slice(0, 10);
}

// --- Fuel ------------------------------------------------------------------

export interface FuelLine {
  /** Litres an hour at 50% load, from the datasheet. */
  lph50: number;
  /** Litres an hour at 100% load, from the datasheet. */
  lph100: number;
  /** Extra litres an hour for each whole of rated load. */
  slope: number;
  /** Litres an hour with nothing plugged in; never below 0. */
  idle: number;
}

/**
 * The straight line through the datasheet's two points. Its intercept is the
 * idle burn, so fuel does not fall to nothing at low load: the real behaviour
 * the old method's "double it" was reaching for.
 */
export function fuelLine(gen: Generator): FuelLine {
  const lph50 = gen.tankLitres / gen.runtime50Hours;
  const lph100 = gen.tankLitres / gen.runtime100Hours;
  const slope = (lph100 - lph50) / 0.5;
  const idle = Math.max(0, lph50 - 0.5 * slope);
  return { lph50, lph100, slope, idle };
}

/**
 * Litres an hour at a load, as a fraction of rated kVA. Not clamped above 1:
 * the caller flags an overload.
 */
export function fuelPerHour(gen: Generator, loadFraction: number): number {
  const line = fuelLine(gen);
  return line.idle + line.slope * loadFraction;
}

/**
 * The hours the generator runs: the daily on-window from the start of
 * `fromHour` to the start of `toHour`, wrapping past midnight. Both null (or
 * either) is 24 hours.
 */
export function runningHours(
  fromHour: number | null,
  toHour: number | null,
): boolean[] {
  if (fromHour === null || toHour === null) {
    return new Array<boolean>(24).fill(true);
  }
  const hours = new Array<boolean>(24).fill(false);
  markWindow(hours, fromHour, toHour);
  return hours;
}

export interface FuelDay {
  day: number;
  litres: number;
  /** kWh the generator delivers that day. */
  kWh: number;
  /** Wh that falls in hours the generator is off; the estimate leaves it out. */
  unservedWh: number;
}

export interface FuelPlan {
  perDay: FuelDay[];
  burnLitres: number;
  litresWithMargin: number;
  /** How often the tank must be filled on the thirstiest day. */
  refillsPerDay: number;
  runningHoursPerDay: number;
  /** True when any running hour asks more than the rated kVA. */
  overloaded: boolean;
}

export interface FuelForPlanInput {
  loads: readonly PowerLoad[];
  generator: Generator;
  plan: Pick<
    PlanSettings,
    "powerFactor" | "daysOnSite" | "lowLoadFactor" | "safetyMarginPct"
  >;
  schedule: { fromHour: number | null; toHour: number | null };
}

/**
 * The fuel for the stay on one running schedule. Each running hour burns at
 * that hour's load: the hourly buckets, plus the hours-per-day loads' energy
 * spread evenly over the day's running hours. An hour below half load burns
 * `lowLoadFactor` times as much. Energy in hours the generator is off is
 * counted as unserved, not as fuel.
 */
export function fuelForPlan({
  loads,
  generator,
  plan,
  schedule,
}: FuelForPlanInput): FuelPlan {
  const running = runningHours(schedule.fromHour, schedule.toHour);
  const runningCount = running.filter(Boolean).length;
  const days = Array.from(
    { length: Math.max(0, Math.floor(plan.daysOnSite)) },
    (_, i) => i + 1,
  );
  let overloaded = false;

  const perDay = days.map((day): FuelDay => {
    const buckets = hourlyBuckets(loads, day);
    const partialWh = hoursPerDayLoads(loads, day).reduce(
      (sum, load) => sum + energyPerDay(load, day),
      0,
    );
    const spreadWatts = runningCount > 0 ? partialWh / runningCount : 0;
    let litres = 0;
    let wh = 0;
    let unservedWh = runningCount > 0 ? 0 : partialWh;
    for (let h = 0; h < 24; h++) {
      if (!running[h]) {
        unservedWh += buckets[h]!;
        continue;
      }
      const watts = buckets[h]! + spreadWatts;
      const fraction =
        apparentKva(watts, plan.powerFactor) / generator.ratedKva;
      if (fraction > 1) overloaded = true;
      const factor = fraction < 0.5 ? plan.lowLoadFactor : 1;
      litres += fuelPerHour(generator, fraction) * factor;
      wh += watts;
    }
    return { day, litres, kWh: wh / 1000, unservedWh };
  });

  const burnLitres = perDay.reduce((sum, d) => sum + d.litres, 0);
  const thirstiest = Math.max(0, ...perDay.map((d) => d.litres));
  return {
    perDay,
    burnLitres,
    litresWithMargin: burnLitres * (1 + plan.safetyMarginPct / 100),
    refillsPerDay: thirstiest / generator.tankLitres,
    runningHoursPerDay: runningCount,
    overloaded,
  };
}

// Floating point makes 0.07 × 100 come out as 7.000000000000001, and a plain
// ceil would buy a whole extra can for it.
const EPSILON = 1e-9;
const ceil = (value: number) => Math.ceil(value - EPSILON);

/** Cans still to buy: enough for the litres, less the cans already owned. */
export function jerryCansNeeded(
  litresWithMargin: number,
  canLitres: number,
  owned: number,
): number {
  return Math.max(0, ceil(litresWithMargin / canLitres) - owned);
}

export interface LegacyFuelInput {
  tankLitres: number;
  runtime50Hours: number;
  kvahPerDay: number;
  peakKva: number;
  days: number;
}

/**
 * The camp's old written method, kept only to show how far the new estimate
 * moved: half the 50% burn for about a quarter load, times the hours at peak
 * that would deliver the day's kVAh, times the days, doubled for low load.
 */
export function legacyFuelEstimate(input: LegacyFuelInput): number {
  const quarterLoadLph = input.tankLitres / input.runtime50Hours / 2;
  const hoursPerDay = input.kvahPerDay / input.peakKva;
  return quarterLoadLph * hoursPerDay * input.days * 2;
}
