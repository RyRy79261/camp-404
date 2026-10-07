import { canTotals, cansToFill, seatsLeft } from "@camp404/core";
import type { CanMaterial } from "@camp404/types";
import type { MyLift } from "@camp404/db/cars";
import type {
  LiftRequestRow,
  TrailerRow,
  TransportCar,
  UnseatedMember,
} from "@camp404/db/transport";

// The Transport page and My lift, as the owner approved them (Option A,
// 2026-10-01: "tables, one row per person, 'Seat in…' panel under the row").
// Pure: the pages read the facts on the server and build these rows here, so
// the rules for what each row says are tested without a browser. Nothing in
// here widens what a viewer may read: the pages pass only what they already
// filtered (lift requests by viewer, the unseated list to editors only).

export const nameOf = (name: string | null): string =>
  name?.trim() || "A camp member";

/** "Sipho" from "Sipho Ndlovu", for short labels on buttons. */
export function firstName(name: string | null): string {
  return nameOf(name).split(/\s+/)[0]!;
}

/** "Sipho Ndlovu's Land Rover Defender 110", or "Sipho Ndlovu's car". */
export function carOwnerLabel(car: {
  driverName: string | null;
  vehicle: string | null;
}): string {
  return `${nameOf(car.driverName)}'s ${car.vehicle ?? "car"}`;
}

/**
 * "Sipho's Land Rover" (first name and make), or "Sipho's car" when the
 * driver gave no make: short enough for a button or a table cell.
 */
export function shortCarLabel(car: {
  driverName: string | null;
  vehicleMake?: string | null;
}): string {
  return `${firstName(car.driverName)}'s ${car.vehicleMake?.trim() || "car"}`;
}

/** A driver who has said nothing about their car yet. */
export function driverFormMissing(car: TransportCar): boolean {
  return (
    car.vehicle === null &&
    car.seatsOffered === null &&
    car.departureCity === null
  );
}

// --- Needs a seat -------------------------------------------------------------

/** Their place this year, in the camp's words; null when not on the list. */
export type ThisYear = UnseatedMember["status"] | null;

export const THIS_YEAR_LABEL: Record<NonNullable<ThisYear>, string> = {
  accepted: "Accepted",
  applied: "Coming, not accepted",
  maybe: "Maybe",
};

/** `requestedAt` is when the request was made, sent back with an answer. */
export type Asked =
  | { kind: "none" }
  | { kind: "any"; requestedAt: string }
  | {
      kind: "car";
      driverUserId: string;
      label: string;
      requestedAt: string;
    };

export interface NeedsSeatRow {
  userId: string;
  name: string;
  thisYear: ThisYear;
  asked: Asked;
}

const YEAR_ORDER: Record<string, number> = {
  accepted: 0,
  applied: 1,
  maybe: 2,
};

/**
 * One row per person still without a seat: everyone the unseated list names
 * (accepted, coming or maybe, not driving, in no car) and anyone else with an
 * open lift request, merged so nobody shows twice. Accepted first, then
 * coming, then maybe, then the rest; by name inside each.
 */
export function needsSeatRows(
  unseated: readonly UnseatedMember[],
  requests: readonly LiftRequestRow[],
  cars: readonly TransportCar[],
): NeedsSeatRow[] {
  const requestOf = new Map(requests.map((r) => [r.userId, r]));
  const asked = (userId: string): Asked => {
    const r = requestOf.get(userId);
    if (!r) return { kind: "none" };
    const car = cars.find((c) => c.driverUserId === r.driverUserId);
    const requestedAt = r.createdAt.toISOString();
    return car
      ? {
          kind: "car",
          driverUserId: car.driverUserId,
          label: shortCarLabel(car),
          requestedAt,
        }
      : { kind: "any", requestedAt };
  };
  const rows: NeedsSeatRow[] = unseated.map((m) => ({
    userId: m.userId,
    name: nameOf(m.name),
    thisYear: m.status,
    asked: asked(m.userId),
  }));
  const listed = new Set(rows.map((r) => r.userId));
  for (const r of requests) {
    if (listed.has(r.userId)) continue;
    listed.add(r.userId);
    rows.push({
      userId: r.userId,
      name: nameOf(r.name),
      thisYear: null,
      asked: asked(r.userId),
    });
  }
  return rows.sort(
    (a, b) =>
      (YEAR_ORDER[a.thisYear ?? ""] ?? 3) -
        (YEAR_ORDER[b.thisYear ?? ""] ?? 3) || a.name.localeCompare(b.name),
  );
}

export interface SeatChoice {
  driverUserId: string;
  /** "Sipho Ndlovu's Land Rover Defender 110". */
  label: string;
  /** "Sipho's Land Rover", for the confirm button. */
  short: string;
  from: string | null;
  free: number;
  asked: boolean;
}

/**
 * The cars a person can be seated in: every car with a seat free that its
 * driver has counted, the one they asked for first. A full car, or one whose
 * driver hasn't said how many seats they have, is left out and named in the
 * note under the choices.
 */
export function seatChoices(
  cars: readonly TransportCar[],
  askedDriverUserId: string | null,
): { choices: SeatChoice[]; note: string | null } {
  const choices: SeatChoice[] = [];
  const full: string[] = [];
  const unknown: string[] = [];
  for (const car of cars) {
    const free = seatsLeft(car.seatsOffered, car.riders.length);
    if (free === null) {
      unknown.push(firstName(car.driverName));
      continue;
    }
    if (free <= 0) {
      full.push(shortCarLabel(car));
      continue;
    }
    choices.push({
      driverUserId: car.driverUserId,
      label: carOwnerLabel(car),
      short: shortCarLabel(car),
      from: car.departureCity,
      free,
      asked: car.driverUserId === askedDriverUserId,
    });
  }
  choices.sort((a, b) => Number(b.asked) - Number(a.asked));
  const parts: string[] = [];
  if (full.length > 0) {
    parts.push(`${listWords(full)} ${full.length === 1 ? "is" : "are"} full.`);
  }
  if (unknown.length > 0) {
    parts.push(
      `${listWords(unknown)} ${unknown.length === 1 ? "hasn't" : "haven't"} said how many seats they have.`,
    );
  }
  return { choices, note: parts.length > 0 ? parts.join(" ") : null };
}

/** "A", "A and B", "A, B and C". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// --- Cars ---------------------------------------------------------------------

export interface SeatsCell {
  /** "2 of 3 taken", "Full, 1 of 1", "Not said", "No seats". */
  text: string;
  /** The second muted line, when there is one ("1 rider"). */
  sub: string | null;
  /** 0..1 for the small bar, or null when there is no count. */
  ratio: number | null;
  muted: boolean;
}

export function seatsCell(car: {
  seatsOffered: number | null;
  riders: readonly unknown[];
}): SeatsCell {
  const taken = car.riders.length;
  if (car.seatsOffered === null) {
    return {
      text: "Not said",
      sub: taken > 0 ? `${taken} ${taken === 1 ? "rider" : "riders"}` : null,
      ratio: null,
      muted: true,
    };
  }
  if (car.seatsOffered === 0) {
    return { text: "No seats", sub: null, ratio: null, muted: true };
  }
  const ratio = Math.min(1, taken / car.seatsOffered);
  return taken >= car.seatsOffered
    ? {
        text: `Full, ${taken} of ${car.seatsOffered}`,
        sub: null,
        ratio,
        muted: false,
      }
    : {
        text: `${taken} of ${car.seatsOffered} taken`,
        sub: null,
        ratio,
        muted: false,
      };
}

/** "Tows Box trailer", "Can tow", "Can't tow", or a dash for no form. */
export function trailerCell(car: TransportCar): {
  text: string;
  muted: boolean;
} {
  if (car.trailer) return { text: `Tows ${car.trailer.name}`, muted: false };
  if (driverFormMissing(car)) return { text: "—", muted: true };
  return car.canTow
    ? { text: "Can tow", muted: false }
    : { text: "Can't tow", muted: true };
}

// --- Trailers -----------------------------------------------------------------

export interface TowChoice {
  driverUserId: string;
  label: string;
  short: string;
  from: string | null;
}

/** The cars that may tow this trailer: they can tow, and tow nothing else. */
export function towChoices(
  cars: readonly TransportCar[],
  trailer: Pick<TrailerRow, "id">,
): TowChoice[] {
  return cars
    .filter(
      (c) => c.canTow && (c.trailer === null || c.trailer.id === trailer.id),
    )
    .map((c) => ({
      driverUserId: c.driverUserId,
      label: carOwnerLabel(c),
      short: shortCarLabel(c),
      from: c.departureCity,
    }));
}

// --- The stat strip -----------------------------------------------------------

export interface StripStat {
  key: string;
  label: string;
  value: number;
  /** "of 8", when the number is a part of a whole. */
  of: number | null;
}

/**
 * Four counts in one row. "Need a seat" is built on attendance, which only
 * Transport editors read, so anyone else sees how many people ride instead.
 */
export function transportStrip(input: {
  cars: readonly TransportCar[];
  trailers: readonly TrailerRow[];
  needSeat: number | null;
}): StripStat[] {
  let offered = 0;
  let free = 0;
  let riders = 0;
  for (const car of input.cars) {
    riders += car.riders.length;
    const left = seatsLeft(car.seatsOffered, car.riders.length);
    if (car.seatsOffered !== null && left !== null) {
      offered += car.seatsOffered;
      free += left;
    }
  }
  const untowed = input.trailers.filter((t) => t.towedByUserId === null).length;
  return [
    { key: "cars", label: "Cars", value: input.cars.length, of: null },
    { key: "seats", label: "Seats free", value: free, of: offered },
    input.needSeat === null
      ? { key: "riders", label: "Riders", value: riders, of: null }
      : { key: "need", label: "Need a seat", value: input.needSeat, of: null },
    {
      key: "trailers",
      label: "Trailers with no car",
      value: untowed,
      of: input.trailers.length,
    },
  ];
}

// --- Your lift ----------------------------------------------------------------

const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * "Mon 27 Apr". The driver form stores a day as the start of that day in
 * UTC (questionnaire-submission's dayAnswer), so it is read back in UTC.
 */
export function dayLabel(date: Date | null): string | null {
  return date ? DAY.format(date).replace(",", "") : null;
}

/** A fuel can a driver fills before they leave (#255), as their card lists it. */
export interface FillCan {
  /** Its number on the can sheet. */
  number: number;
  /** "Camp", or the owner's name. */
  ownerName: string;
  sizeLitres: number;
  material: CanMaterial | null;
  note: string | null;
}

/** A car's fuel cans in the Cars list: how many, their litres. */
export interface CarFuel {
  cans: number;
  litres: number;
}

/**
 * The fuel cans each car brings, by driver, and the ones in `me`'s car, from
 * this year's can list in the sheet's order. Who fills a can is its car's
 * driver (canTotals and cansToFill in core); Power changes the list,
 * Transport only shows it.
 */
export function transportFuel<
  C extends {
    ownerUserId: string | null;
    ownerName: string | null;
    sizeLitres: number;
    material: CanMaterial | null;
    travelsWithUserId: string | null;
    note: string | null;
  },
>(
  cans: readonly C[],
  cars: readonly TransportCar[],
  me: string,
): { byCar: Map<string, CarFuel>; mine: FillCan[] } {
  const totals = canTotals(cans, cars);
  const mine = cars.some((c) => c.driverUserId === me)
    ? cansToFill(cans, me)
    : [];
  return {
    byCar: new Map(
      totals.cars.map((t) => [
        t.car.driverUserId,
        { cans: t.cans, litres: t.litres },
      ]),
    ),
    mine: mine.map((c) => ({
      number: cans.indexOf(c) + 1,
      ownerName: c.ownerUserId ? nameOf(c.ownerName) : "Camp",
      sizeLitres: c.sizeLitres,
      material: c.material,
      note: c.note,
    })),
  };
}

export interface LiftPerson {
  userId: string;
  name: string;
}

/** Someone asking to ride, with when they asked (sent back with the answer). */
export interface LiftAsker extends LiftPerson {
  requestedAt: string;
}

export type LiftPanel =
  | {
      kind: "rider";
      driverUserId: string | null;
      driverName: string;
      vehicle: string | null;
      from: string | null;
      arriving: string | null;
      ridingWith: string[];
    }
  | {
      kind: "driver";
      vehicle: string | null;
      from: string | null;
      arriving: string | null;
      seatsOffered: number | null;
      riders: LiftPerson[];
      asking: LiftAsker[];
    }
  | {
      kind: "asked";
      /** "Sipho Ndlovu's Land Rover Defender 110", or null for any car. */
      car: string | null;
      waitingFor: string;
    }
  | { kind: "none"; cars: { driverUserId: string; label: string }[] };

/**
 * The viewer's own panel: the car they ride in, the car they drive (with the
 * people asking to ride in it), their open request, or none of those.
 * `requests` are the ones the viewer may see (liftRequestsFor).
 */
export function liftPanel(input: {
  me: string;
  lift: MyLift | null;
  cars: readonly TransportCar[];
  requests: readonly LiftRequestRow[];
}): LiftPanel {
  const { me, lift, cars, requests } = input;
  if (lift?.role === "driver") {
    const car = cars.find((c) => c.driverUserId === me);
    return {
      kind: "driver",
      vehicle: lift.vehicle,
      from: lift.departureCity,
      arriving: dayLabel(lift.arrivalAt),
      seatsOffered: lift.seatsOffered,
      riders: (car?.riders ?? []).map((r) => ({
        userId: r.userId,
        name: nameOf(r.name),
      })),
      asking: requests
        .filter((r) => r.driverUserId === me)
        .map((r) => ({
          userId: r.userId,
          name: nameOf(r.name),
          requestedAt: r.createdAt.toISOString(),
        })),
    };
  }
  if (lift?.role === "rider") {
    const car = cars.find((c) => c.riders.some((r) => r.userId === me));
    return {
      kind: "rider",
      driverUserId: car?.driverUserId ?? null,
      driverName: nameOf(lift.driverName),
      vehicle: lift.vehicle,
      from: lift.departureCity,
      arriving: dayLabel(lift.arrivalAt),
      ridingWith: (car?.riders ?? [])
        .filter((r) => r.userId !== me)
        .map((r) => nameOf(r.name)),
    };
  }
  const mine = requests.find((r) => r.userId === me);
  if (mine) {
    const car = cars.find((c) => c.driverUserId === mine.driverUserId);
    return car
      ? {
          kind: "asked",
          car: carOwnerLabel(car),
          waitingFor: firstName(car.driverName),
        }
      : { kind: "asked", car: null, waitingFor: "a Transport lead" };
  }
  return {
    kind: "none",
    cars: cars
      .filter((c) => c.driverUserId !== me)
      .flatMap((c) => {
        const free = seatsLeft(c.seatsOffered, c.riders.length);
        return free !== null && free > 0
          ? [
              {
                driverUserId: c.driverUserId,
                label: `${carOwnerLabel(c)} (${free} free)`,
              },
            ]
          : [];
      }),
  };
}
