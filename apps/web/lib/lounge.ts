import "server-only";

import * as db from "@camp404/db/lounge";
import type {
  LoungeOfferRow,
  LoungeProgramme,
  LoungeSettings,
  LoungeSlotRow,
  LoungeWriteResult,
  PublicLoungeOffer,
} from "@camp404/db/lounge";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// The lounge programme (#269), from the database or, under E2E, the test
// store. The rules live in @camp404/db/lounge; the store repeats them. Every
// write re-checks the actor itself (the host for their own offer; a captain
// or a Ministry of Vibes lead for the programme), so a caller passes only who
// is acting, never their rank or their teams.

export type {
  LoungeOfferRow,
  LoungeProgramme,
  LoungeSettings,
  LoungeSlotRow,
  LoungeWriteResult,
  PublicLoungeOffer,
};

type In<F extends (...args: never[]) => unknown> = Parameters<F>[0];

// --- Reads -------------------------------------------------------------------

export async function getLoungeProgramme(
  cycle?: number,
): Promise<LoungeProgramme> {
  return usesTestStore()
    ? testStore.getLoungeProgramme(cycle)
    : db.getLoungeProgramme(cycle);
}

export async function listMyLoungeOffers(
  userId: string,
  cycle?: number,
): Promise<LoungeOfferRow[]> {
  return usesTestStore()
    ? testStore.listMyLoungeOffers(userId, cycle)
    : db.listMyLoungeOffers(userId, cycle);
}

/** Every offer this year. Only for someone canRunLounge lets run the lounge. */
export async function listLoungeOffers(
  cycle?: number,
): Promise<LoungeOfferRow[]> {
  return usesTestStore()
    ? testStore.listLoungeOffers(cycle)
    : db.listLoungeOffers(cycle);
}

export async function getLoungeSettings(
  cycle?: number,
): Promise<LoungeSettings> {
  return usesTestStore()
    ? testStore.getLoungeSettings(cycle)
    : db.getLoungeSettings(cycle);
}

// --- Writes ------------------------------------------------------------------

export async function addLoungeOffer(
  input: In<typeof db.addLoungeOffer>,
): Promise<LoungeWriteResult<{ id: string }>> {
  return usesTestStore()
    ? testStore.addLoungeOffer(input)
    : db.addLoungeOffer(input);
}

export async function updateLoungeOffer(
  input: In<typeof db.updateLoungeOffer>,
): Promise<LoungeWriteResult> {
  return usesTestStore()
    ? testStore.updateLoungeOffer(input)
    : db.updateLoungeOffer(input);
}

export async function withdrawLoungeOffer(
  input: In<typeof db.withdrawLoungeOffer>,
): Promise<LoungeWriteResult> {
  return usesTestStore()
    ? testStore.withdrawLoungeOffer(input)
    : db.withdrawLoungeOffer(input);
}

export async function decideLoungeOffer(
  input: In<typeof db.decideLoungeOffer>,
): Promise<LoungeWriteResult> {
  return usesTestStore()
    ? testStore.decideLoungeOffer(input)
    : db.decideLoungeOffer(input);
}

export async function placeLoungeOffer(
  input: In<typeof db.placeLoungeOffer>,
): Promise<LoungeWriteResult<{ id: string }>> {
  return usesTestStore()
    ? testStore.placeLoungeOffer(input)
    : db.placeLoungeOffer(input);
}

export async function removeLoungeSlot(
  input: In<typeof db.removeLoungeSlot>,
): Promise<LoungeWriteResult> {
  return usesTestStore()
    ? testStore.removeLoungeSlot(input)
    : db.removeLoungeSlot(input);
}

export async function setLoungeMusicPolicy(
  input: In<typeof db.setLoungeMusicPolicy>,
): Promise<LoungeWriteResult<{ version: number }>> {
  return usesTestStore()
    ? testStore.setLoungeMusicPolicy(input)
    : db.setLoungeMusicPolicy(input);
}
