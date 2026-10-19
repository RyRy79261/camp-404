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
import { testStore } from "./test-store";
import { twin } from "./twin";

// The lounge programme (#269), from the database or, under E2E, the test
// store's twin. The offer checks live once in @camp404/core
// (loungeEditProblem, loungeDecisionProblem, loungePlaceProblem);
// lib/__tests__/lounge-agreement.test.ts holds the rest equal. Every
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

const lounge = twin(db, testStore, [
  "getLoungeProgramme",
  "listMyLoungeOffers",
  "listLoungeOffers",
  "getLoungeSettings",
  "addLoungeOffer",
  "updateLoungeOffer",
  "withdrawLoungeOffer",
  "decideLoungeOffer",
  "placeLoungeOffer",
  "removeLoungeSlot",
  "setLoungeMusicPolicy",
]);

// --- Reads -------------------------------------------------------------------

export const getLoungeProgramme = lounge.getLoungeProgramme;
export const listMyLoungeOffers = lounge.listMyLoungeOffers;
/** Every offer this year. Only for someone canRunLounge lets run the lounge. */
export const listLoungeOffers = lounge.listLoungeOffers;
export const getLoungeSettings = lounge.getLoungeSettings;

// --- Writes ------------------------------------------------------------------

export const addLoungeOffer = lounge.addLoungeOffer;
export const updateLoungeOffer = lounge.updateLoungeOffer;
export const withdrawLoungeOffer = lounge.withdrawLoungeOffer;
export const decideLoungeOffer = lounge.decideLoungeOffer;
export const placeLoungeOffer = lounge.placeLoungeOffer;
export const removeLoungeSlot = lounge.removeLoungeSlot;
export const setLoungeMusicPolicy = lounge.setLoungeMusicPolicy;
