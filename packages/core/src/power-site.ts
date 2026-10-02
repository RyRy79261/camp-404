import { dayLabel } from "./power";

// The fuel cans (#255; the owner's register, 2026-10-02). Pure: no DB, no
// session, no next/*.
//
// The camp takes a set number of jerry cans and never refills them at the
// burn: AfrikaBurn's Fire & Fuel keep the full ones at their depot, bring them
// to camp and take the empties back. The four ticks (Filled, At fuel depot,
// At camp, Returned) are made on paper on site, never in the app. The app
// keeps only the list the can sheet prints.
//
// WHO FILLS A CAN IS DERIVED, NEVER STORED: filling is the driver's job, so a
// can is filled by the driver of the car it travels with, before they leave
// home. A can on no car (or on a car whose driver no longer drives this year)
// is filled by nobody yet. Every screen and the sheet read it from here.

/** A can as the register needs it: its size and the car it travels with. */
export interface RegisterCan {
  sizeLitres: number;
  /** The car's driver; null is not on a car yet. */
  travelsWithUserId: string | null;
}

/** One of this year's cars, named by its driver. */
export interface RegisterCar {
  driverUserId: string;
}

/**
 * The car that fills a can: the one it travels with, when that car is one of
 * this year's. Null when the can is on no car, or on a car not driving now.
 */
export function fillingCar<C extends RegisterCar>(
  can: RegisterCan,
  cars: readonly C[],
): C | null {
  if (can.travelsWithUserId === null) return null;
  return cars.find((c) => c.driverUserId === can.travelsWithUserId) ?? null;
}

/** How many cans, and their litres. */
export interface CanCount {
  cans: number;
  litres: number;
}

export interface CanTotals<C extends RegisterCar> {
  /** Every car, in the order given, with what its driver fills (maybe none). */
  cars: (CanCount & { car: C })[];
  /** The cans on no car this year: nobody fills these yet. */
  notOnCar: CanCount;
  /** Every can on the list. */
  all: CanCount;
}

function count(cans: readonly RegisterCan[]): CanCount {
  return {
    cans: cans.length,
    litres: cans.reduce((sum, c) => sum + c.sizeLitres, 0),
  };
}

/**
 * The totals above the list: each car's cans and litres (what its driver
 * fills), the cans not on a car yet, and the whole list.
 */
export function canTotals<C extends RegisterCar>(
  cans: readonly RegisterCan[],
  cars: readonly C[],
): CanTotals<C> {
  return {
    cars: cars.map((car) => ({
      car,
      ...count(cans.filter((c) => fillingCar(c, cars) === car)),
    })),
    notOnCar: count(cans.filter((c) => fillingCar(c, cars) === null)),
    all: count(cans),
  };
}

/** The cans a driver fills before they leave: the ones in their car. */
export function cansToFill<T extends RegisterCan>(
  cans: readonly T[],
  driverUserId: string,
): T[] {
  return cans.filter((c) => c.travelsWithUserId === driverUserId);
}

/** One line of the day-by-day fuel sheet: a date, and build or strike. */
export interface FuelSheetDay {
  /** YYYY-MM-DD. */
  date: string;
  phase: "build" | "burn" | "strike" | null;
}

/**
 * The days the day-by-day fuel sheet is pre-filled with. The power plan's
 * powered days when it has a first day (the generator runs build to strike);
 * else the Burn's own dates. A day before the Burn is build, after it strike.
 * Empty when neither is known: the sheet is then blank lines.
 */
export function fuelSheetDays(input: {
  firstPoweredDay: string | null;
  daysOnSite: number;
  burnStart: string | null;
  burnEnd: string | null;
}): FuelSheetDay[] {
  const { firstPoweredDay, daysOnSite, burnStart, burnEnd } = input;
  const phase = (date: string): FuelSheetDay["phase"] => {
    if (!burnStart || !burnEnd) return null;
    if (date < burnStart) return "build";
    if (date > burnEnd) return "strike";
    return "burn";
  };
  if (firstPoweredDay && daysOnSite > 0) {
    return Array.from({ length: daysOnSite }, (_, i) => {
      const date = dayLabel(firstPoweredDay, i + 1);
      return { date, phase: phase(date) };
    });
  }
  if (burnStart && burnEnd && burnStart <= burnEnd) {
    const days: FuelSheetDay[] = [];
    // A Burn is about a week; the bound keeps a mistyped year from running on.
    for (let i = 1; i <= 31; i++) {
      const date = dayLabel(burnStart, i);
      if (date > burnEnd) break;
      days.push({ date, phase: "burn" });
    }
    return days;
  }
  return [];
}
