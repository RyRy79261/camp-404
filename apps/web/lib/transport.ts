import "server-only";

import * as db from "@camp404/db/transport";
import type {
  LiftRequestRow,
  TrailerRow,
  TransportBoard,
  TransportCar,
  TransportResult,
  UnseatedMember,
} from "@camp404/db/transport";
import { testStore } from "./test-store";
import { twin } from "./twin";

// Transport (#270), from the database or, under E2E, the test store's twin.
// The rules live in @camp404/core (canEditTransport, canManageCar,
// canRemoveRider and canSendToAudience's `car` scope) and are checked again
// inside each write, and the seat, lift, seats and towing checks live there
// once too (seatProblem, liftRequestProblem, liftAnswerProblem,
// seatsOfferedProblem, towProblem); lib/__tests__/transport-agreement.test.ts
// holds the rest equal. A caller passes only who is acting, never a rank, a
// team list, a car to message or a list of riders.

export type {
  LiftRequestRow,
  TrailerRow,
  TransportBoard,
  TransportCar,
  TransportResult,
  UnseatedMember,
};

const transport = twin(db, testStore, [
  "getTransportBoard",
  "listLiftRequests",
  "listUnseated",
  "drivesThisYear",
  "addRider",
  "removeRider",
  "setSeatsOffered",
  "requestLift",
  "withdrawLiftRequest",
  "answerLiftRequest",
  "addTrailer",
  "updateTrailer",
  "setTrailerTow",
  "removeTrailer",
  "sendCarMessage",
]);

// --- Reads -------------------------------------------------------------------

export const getTransportBoard = transport.getTransportBoard;
export const listLiftRequests = transport.listLiftRequests;
export const listUnseated = transport.listUnseated;
export const drivesThisYear = transport.drivesThisYear;

/**
 * The lift requests a viewer may see: a transport editor every one, anyone
 * else the ones for the car they drive and their own. Filtered here on the
 * server, so a request never reaches a browser that may not read it.
 */
export function liftRequestsFor(
  requests: readonly LiftRequestRow[],
  viewer: { userId: string; canEdit: boolean },
): LiftRequestRow[] {
  if (viewer.canEdit) return [...requests];
  return requests.filter(
    (r) => r.userId === viewer.userId || r.driverUserId === viewer.userId,
  );
}

// --- Writes ------------------------------------------------------------------

export const addRider = transport.addRider;
export const removeRider = transport.removeRider;
export const setSeatsOffered = transport.setSeatsOffered;
export const requestLift = transport.requestLift;
export const withdrawLiftRequest = transport.withdrawLiftRequest;
export const answerLiftRequest = transport.answerLiftRequest;
export const addTrailer = transport.addTrailer;
export const updateTrailer = transport.updateTrailer;
export const setTrailerTow = transport.setTrailerTow;
export const removeTrailer = transport.removeTrailer;
export const sendCarMessage = transport.sendCarMessage;
