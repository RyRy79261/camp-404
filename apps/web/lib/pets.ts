import "server-only";

import { canReviewPets } from "@camp404/core";
import * as pets from "@camp404/db/pets";
import type { PetPhotoSide, PetRow, PetWriteResult } from "@camp404/db/pets";
import type { CampUser } from "./users";
import { usesTestStore } from "./test-mode";
import { petsTestStore } from "./test-store-pets";

// Camp pets (owner, 2026-10-09), from the database or, under E2E, the test
// store's twin (test-store-pets.ts). The rules live in @camp404/db/pets and
// the twin repeats them.
//
// The reviewers are the camp's CAPTAINS (owner, 2026-10-11, moving it off the
// FOUNDER_EMAILS list: "captains can control this"). The page and the photo
// route read it from the camp user's rank on the server; the actions gate on
// captainActionGate("captain"), and every reviewer's write reads the rank
// again inside its own transaction (@camp404/db/pets, and the twin).

export type { PetPhotoSide, PetRow, PetWriteResult };

const store = () => (usesTestStore() ? petsTestStore : null);

/** Whether this camp user reviews pets: a captain. */
export function isPetReviewer(campUser: Pick<CampUser, "rank">): boolean {
  return canReviewPets({ isCaptain: campUser.rank === "captain" });
}

// --- Reads --------------------------------------------------------------------

export async function listPets(viewer: {
  viewerId: string;
  isReviewer: boolean;
}): Promise<PetRow[]> {
  return store()?.listPets(viewer) ?? pets.listPets(viewer);
}

export async function listUsedPetModuleKeys(): Promise<string[]> {
  return store()?.listUsedPetModuleKeys() ?? pets.listUsedPetModuleKeys();
}

export async function getPetPhoto(
  petId: string,
  side: PetPhotoSide,
): Promise<{ ownerId: string | null; pathname: string } | null> {
  const s = store();
  return s ? s.getPetPhoto(petId, side) : pets.getPetPhoto(petId, side);
}

export async function listPetOwnerChoices(): Promise<
  { id: string; name: string }[]
> {
  return store()?.listPetOwnerChoices() ?? pets.listPetOwnerChoices();
}

// --- Writes -------------------------------------------------------------------

export async function addPet(
  input: Parameters<typeof pets.addPet>[0],
): Promise<PetWriteResult<{ id: string }>> {
  return store()?.addPet(input) ?? pets.addPet(input);
}

export async function setPetStupidThing(
  input: Parameters<typeof pets.setPetStupidThing>[0],
): Promise<PetWriteResult> {
  return store()?.setPetStupidThing(input) ?? pets.setPetStupidThing(input);
}

export async function markPetIn(
  input: Parameters<typeof pets.markPetIn>[0],
): Promise<PetWriteResult<{ ownerId: string | null }>> {
  return store()?.markPetIn(input) ?? pets.markPetIn(input);
}

export async function setPetHint(
  input: Parameters<typeof pets.setPetHint>[0],
): Promise<PetWriteResult> {
  return store()?.setPetHint(input) ?? pets.setPetHint(input);
}

export async function setPetOwner(
  input: Parameters<typeof pets.setPetOwner>[0],
): Promise<PetWriteResult> {
  return store()?.setPetOwner(input) ?? pets.setPetOwner(input);
}
