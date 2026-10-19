import "server-only";

import { canReviewPets } from "@camp404/core";
import * as pets from "@camp404/db/pets";
import type { PetPhotoSide, PetRow, PetWriteResult } from "@camp404/db/pets";
import type { CampUser } from "./users";
import { petsTestStore } from "./test-store-pets";
import { twin } from "./twin";

// Camp pets (owner, 2026-10-09), from the database or, under E2E, the test
// store's twin (test-store-pets.ts), picked once (twin). Who reviews is
// canReviewPets (@camp404/core), which both sides call;
// lib/__tests__/pets-agreement.test.ts holds the rest equal.
//
// The reviewers are the camp's CAPTAINS (owner, 2026-10-11, moving it off the
// FOUNDER_EMAILS list: "captains can control this"). The page and the photo
// route read it from the camp user's rank on the server; the actions gate on
// captainActionGate("captain"), and every reviewer's write reads the rank
// again inside its own transaction (@camp404/db/pets, and the twin).

export type { PetPhotoSide, PetRow, PetWriteResult };

const pet = twin(pets, petsTestStore, [
  "listPets",
  "listUsedPetModuleKeys",
  "getPetPhoto",
  "listPetOwnerChoices",
  "addPet",
  "setPetStupidThing",
  "markPetIn",
  "setPetHint",
  "setPetOwner",
]);

/** Whether this camp user reviews pets: a captain. */
export function isPetReviewer(campUser: Pick<CampUser, "rank">): boolean {
  return canReviewPets({ isCaptain: campUser.rank === "captain" });
}

// --- Reads --------------------------------------------------------------------

export const listPets = pet.listPets;
export const listUsedPetModuleKeys = pet.listUsedPetModuleKeys;
export const getPetPhoto = pet.getPetPhoto;
export const listPetOwnerChoices = pet.listPetOwnerChoices;

// --- Writes -------------------------------------------------------------------

export const addPet = pet.addPet;
export const setPetStupidThing = pet.setPetStupidThing;
export const markPetIn = pet.markPetIn;
export const setPetHint = pet.setPetHint;
export const setPetOwner = pet.setPetOwner;
