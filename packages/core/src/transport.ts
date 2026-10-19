import { allowsRank, captainOrLeadOf, isViewerRank, type Rule } from "./actor";

// Transport (#270): this year's cars, riders and trailers. Pure: no DB, no
// session, no next/*. The page and the writes call these; the writes pass
// what they read and locked inside their own transaction, never what a caller
// said.
//
// WHO MAY DO WHAT. Clearance stays global (AGENTS.md): a lead of ANY team
// stands on the `team_lead` rung everywhere. Team identity decides only who
// may work in the transport tool: a captain, or a lead of Transport &
// Logistics (the night brief's rule 6: "a lead OF THAT TEAM or a captain").
// Besides them, a driver manages their OWN car (who rides, how many seats),
// and a rider may take themselves out of a car. Every approved member reads
// the car list (names and cars only). Each rule fails closed on a rank this
// module does not know.
//
// Messaging a car is not here: who may address a car is `canSendToAudience`
// (audience-authz.ts, the `car` scope), the one owner of audiences.

/** The team whose leads run the transport tool. */
export const TRANSPORT_TEAM = "transport_and_logistics";

/** Who may work in the whole transport tool: a captain, or a lead of Transport & Logistics. */
export const TRANSPORT_EDITOR: Rule = captainOrLeadOf(TRANSPORT_TEAM);

/**
 * Whether someone may work in the whole transport tool: match anyone into any
 * car, answer any lift request, set any car's seats, and keep the trailers.
 * A captain, or a lead of Transport & Logistics this year. `ledTeams` are the
 * team keys they lead this year.
 */
export function canEditTransport(
  rank: string,
  ledTeams: readonly string[],
): boolean {
  return allowsRank(TRANSPORT_EDITOR, rank, ledTeams);
}

/**
 * Whether someone may manage one car: its seats, who rides in it, and the
 * requests to ride in it. The transport editors, or the car's own driver.
 * Whether that driver is driving this year is the write's check (it reads the
 * driver's profile under a lock).
 */
export function canManageCar(
  rank: string,
  ledTeams: readonly string[],
  actorId: string,
  driverUserId: string,
): boolean {
  if (!isViewerRank(rank)) return false;
  if (canEditTransport(rank, ledTeams)) return true;
  return actorId.length > 0 && actorId === driverUserId;
}

/**
 * Whether someone may take one rider out of one car: whoever manages the car,
 * or the rider themself (leaving a lift is always yours to do).
 */
export function canRemoveRider(
  rank: string,
  ledTeams: readonly string[],
  actorId: string,
  driverUserId: string,
  memberUserId: string,
): boolean {
  if (!isViewerRank(rank)) return false;
  if (canManageCar(rank, ledTeams, actorId, driverUserId)) return true;
  return actorId.length > 0 && actorId === memberUserId;
}

// --- Write checks (the db's and the store's twin) ----------------------------

export const NOT_YOUR_CAR =
  "Only the driver, a captain or a Transport & Logistics lead can change this car.";
export const NOT_DRIVING =
  "That car isn't driving this year any more. Reload the page.";
export const TRANSPORT_NOT_A_MEMBER =
  "That person isn't an approved camp member.";
export const OWN_CAR = "A driver can't ride in their own car.";
export const IS_DRIVING = "They're driving their own car this year.";
export const CAR_FULL = "That car is full: every seat offered is taken.";
export const ALREADY_SEATED = "They already have a seat in a car this year.";
export const SEATS_BELOW_RIDERS =
  "More people already ride in this car. Take someone out first.";
export const LIFT_REQUEST_GONE =
  "That lift request isn't there any more. Reload the page.";
export const LIFT_REQUEST_CHANGED =
  "They changed their lift request since you looked. Reload the page to see it.";
export const YOU_ARE_DRIVING =
  "You're driving this year, so you don't need a lift.";
export const YOU_HAVE_A_SEAT = "You already have a seat in a car this year.";
export const CANNOT_TOW = "That car can't tow a trailer.";
export const ALREADY_TOWING = "That car already tows a trailer.";

/** What seating a member in a car decides on, read under the car's lock. */
export interface SeatAsk {
  driverUserId: string;
  memberUserId: string;
  /** The driver's profile this year, when they drive; else null. */
  car: { seatsOffered: number | null } | null;
  /** An approved, real camp member. */
  memberApproved: boolean;
  /** The member drives their own car this year. */
  memberDrives: boolean;
  /** The member has a seat this year in a car whose driver still drives. */
  seated: boolean;
  /** Riders in this car this year. */
  riders: number;
}

/**
 * Why a member may not take a seat in a car, in the order the database
 * checks (seat(), and the store's twin): their own car, a car that does not
 * drive, not a member, driving themselves, seated already, the car full.
 * Null when the seat may be written.
 */
export function seatProblem(ask: SeatAsk): string | null {
  if (ask.driverUserId === ask.memberUserId) return OWN_CAR;
  if (!ask.car) return NOT_DRIVING;
  if (!ask.memberApproved) return TRANSPORT_NOT_A_MEMBER;
  if (ask.memberDrives) return IS_DRIVING;
  if (ask.seated) return ALREADY_SEATED;
  if (ask.car.seatsOffered !== null && ask.riders >= ask.car.seatsOffered) {
    return CAR_FULL;
  }
  return null;
}

/**
 * Why a car may not offer `seatsOffered` seats: it does not drive this year,
 * or more already ride in it. Null when it may.
 */
export function seatsOfferedProblem(
  drives: boolean,
  riders: number,
  seatsOffered: number,
): string | null {
  if (!drives) return NOT_DRIVING;
  return riders > seatsOffered ? SEATS_BELOW_RIDERS : null;
}

/** What a member's own lift request decides on. */
export interface LiftAsk {
  actorId: string;
  /** The car asked for; null is any car. */
  driverUserId: string | null;
  /** The asker is an approved, real camp member. */
  memberApproved: boolean;
  /** The asker drives this year. */
  drives: boolean;
  /** The asker has a seat this year. */
  seated: boolean;
  /** The car asked for drives this year (unused for "any car"). */
  carDrives: boolean;
}

/**
 * Why a member may not ask for a lift, in the database's order: not a
 * member, driving, seated already, their own car, a car that does not drive.
 */
export function liftRequestProblem(ask: LiftAsk): string | null {
  if (!ask.memberApproved) return TRANSPORT_NOT_A_MEMBER;
  if (ask.drives) return YOU_ARE_DRIVING;
  if (ask.seated) return YOU_HAVE_A_SEAT;
  if (ask.driverUserId !== null) {
    if (ask.driverUserId === ask.actorId) return OWN_CAR;
    if (!ask.carDrives) return NOT_DRIVING;
  }
  return null;
}

/** What answering a lift request decides on, read under the request's lock. */
export interface LiftAnswerAsk {
  actor: { id: string; rank: string; ledTeams: readonly string[] };
  /** The open request this year, or null. */
  request: { driverUserId: string | null; createdAt: Date } | null;
  /** When the request the answerer saw was made. */
  requestedAt: string;
  accept: boolean;
}

/**
 * Why a lift request may not be answered, in the database's order: it is
 * gone, it changed since the answerer looked, the answerer may not answer it
 * (the asked car's manager, or a transport editor for "any car"), or it is
 * accepted with no car to seat them in. Null when it may.
 */
export function liftAnswerProblem(ask: LiftAnswerAsk): string | null {
  const { actor, request } = ask;
  if (!request) return LIFT_REQUEST_GONE;
  // Both sides are read through a JS Date, so both are whole milliseconds.
  if (request.createdAt.getTime() !== new Date(ask.requestedAt).getTime()) {
    return LIFT_REQUEST_CHANGED;
  }
  const car = request.driverUserId;
  const mayAnswer =
    car !== null
      ? canManageCar(actor.rank, actor.ledTeams, actor.id, car)
      : canEditTransport(actor.rank, actor.ledTeams);
  if (!mayAnswer) return NOT_YOUR_CAR;
  if (ask.accept && car === null) return LIFT_REQUEST_GONE;
  return null;
}

/**
 * Why a car may not tow a trailer: it does not drive this year, it cannot
 * tow, or it tows another trailer this year. Null when it may.
 */
export function towProblem(
  car: { canTow: boolean } | null,
  towsAnother: boolean,
): string | null {
  if (!car) return NOT_DRIVING;
  if (!car.canTow) return CANNOT_TOW;
  return towsAnother ? ALREADY_TOWING : null;
}

// --- Counts ------------------------------------------------------------------

/** Seats still free in a car; null when the driver has not said. */
export function seatsLeft(
  seatsOffered: number | null,
  riders: number,
): number | null {
  if (seatsOffered === null) return null;
  return Math.max(0, seatsOffered - riders);
}

/** A car and a make, as people say it: "Toyota Hilux", or null. */
export function vehicleLabel(
  make: string | null,
  model: string | null,
): string | null {
  const name = [make, model]
    .map((p) => p?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  return name || null;
}

export interface TransportCount {
  seatsOffered: number | null;
  riders: number;
}

export interface TransportTotals {
  /** Cars driving this year. */
  cars: number;
  /** Seats offered across the cars that said. */
  seatsOffered: number;
  /** Riders seated. */
  seatsTaken: number;
  /** Seats still free across the cars that said. */
  seatsLeft: number;
  /** Everyone travelling in a camp car: drivers and riders. */
  travelling: number;
  /** Trailers this year, and how many have a car to tow them. */
  trailers: number;
  trailersTowed: number;
}

/**
 * The figures above the car list, and for the logistics calendar and the
 * on-site headcount (#247): cars, seats, people travelling, trailers.
 */
export function transportTotals(
  cars: readonly TransportCount[],
  trailers: readonly { towedByUserId: string | null }[],
): TransportTotals {
  let seatsOffered = 0;
  let seatsTaken = 0;
  let free = 0;
  for (const car of cars) {
    seatsTaken += car.riders;
    if (car.seatsOffered !== null) {
      seatsOffered += car.seatsOffered;
      free += seatsLeft(car.seatsOffered, car.riders) ?? 0;
    }
  }
  return {
    cars: cars.length,
    seatsOffered,
    seatsTaken,
    seatsLeft: free,
    travelling: cars.length + seatsTaken,
    trailers: trailers.length,
    trailersTowed: trailers.filter((t) => t.towedByUserId !== null).length,
  };
}
