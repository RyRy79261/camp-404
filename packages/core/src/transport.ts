import { ViewerRank } from "@camp404/types";

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

function isViewerRank(rank: string): rank is ViewerRank {
  return ViewerRank.safeParse(rank).success;
}

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
  if (!isViewerRank(rank)) return false;
  if (rank === "captain") return true;
  if (rank === "team_lead") return ledTeams.includes(TRANSPORT_TEAM);
  return false;
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
