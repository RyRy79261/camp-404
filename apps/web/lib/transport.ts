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
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// Transport (#270), from the database or, under E2E, the test store. The rules
// live in @camp404/core (canEditTransport, canManageCar, canRemoveRider and
// canSendToAudience's `car` scope) and are checked again inside each write;
// the store repeats them. A caller passes only who is acting, never a rank, a
// team list, a car to message or a list of riders.

export type {
  LiftRequestRow,
  TrailerRow,
  TransportBoard,
  TransportCar,
  TransportResult,
  UnseatedMember,
};

type In<F extends (...args: never[]) => unknown> = Parameters<F>[0];

// --- Reads -------------------------------------------------------------------

export async function getTransportBoard(): Promise<TransportBoard> {
  return usesTestStore()
    ? testStore.getTransportBoard()
    : db.getTransportBoard();
}

export async function listLiftRequests(): Promise<LiftRequestRow[]> {
  return usesTestStore() ? testStore.listLiftRequests() : db.listLiftRequests();
}

export async function listUnseated(): Promise<UnseatedMember[]> {
  return usesTestStore() ? testStore.listUnseated() : db.listUnseated();
}

export async function drivesThisYear(userId: string): Promise<boolean> {
  return usesTestStore()
    ? testStore.drivesThisYear(userId)
    : db.drivesThisYear(userId);
}

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

export async function addRider(
  input: In<typeof db.addRider>,
): Promise<TransportResult> {
  return usesTestStore() ? testStore.addRider(input) : db.addRider(input);
}

export async function removeRider(
  input: In<typeof db.removeRider>,
): Promise<TransportResult> {
  return usesTestStore() ? testStore.removeRider(input) : db.removeRider(input);
}

export async function setSeatsOffered(
  input: In<typeof db.setSeatsOffered>,
): Promise<TransportResult> {
  return usesTestStore()
    ? testStore.setSeatsOffered(input)
    : db.setSeatsOffered(input);
}

export async function requestLift(
  input: In<typeof db.requestLift>,
): Promise<TransportResult> {
  return usesTestStore() ? testStore.requestLift(input) : db.requestLift(input);
}

export async function withdrawLiftRequest(
  input: In<typeof db.withdrawLiftRequest>,
): Promise<TransportResult> {
  return usesTestStore()
    ? testStore.withdrawLiftRequest(input)
    : db.withdrawLiftRequest(input);
}

export async function answerLiftRequest(
  input: In<typeof db.answerLiftRequest>,
): Promise<TransportResult> {
  return usesTestStore()
    ? testStore.answerLiftRequest(input)
    : db.answerLiftRequest(input);
}

export async function addTrailer(
  input: In<typeof db.addTrailer>,
): Promise<TransportResult<{ id: string }>> {
  return usesTestStore() ? testStore.addTrailer(input) : db.addTrailer(input);
}

export async function updateTrailer(
  input: In<typeof db.updateTrailer>,
): Promise<TransportResult> {
  return usesTestStore()
    ? testStore.updateTrailer(input)
    : db.updateTrailer(input);
}

export async function setTrailerTow(
  input: In<typeof db.setTrailerTow>,
): Promise<TransportResult> {
  return usesTestStore()
    ? testStore.setTrailerTow(input)
    : db.setTrailerTow(input);
}

export async function removeTrailer(
  input: In<typeof db.removeTrailer>,
): Promise<TransportResult> {
  return usesTestStore()
    ? testStore.removeTrailer(input)
    : db.removeTrailer(input);
}

export async function sendCarMessage(
  input: In<typeof db.sendCarMessage>,
): Promise<TransportResult<{ broadcastId: string; recipientCount: number }>> {
  return usesTestStore()
    ? testStore.sendCarMessage(input)
    : db.sendCarMessage(input);
}
