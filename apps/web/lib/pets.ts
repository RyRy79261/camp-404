import "server-only";

import { canReviewPets } from "@camp404/core";
import * as pets from "@camp404/db/pets";
import type { PetPhotoSide, PetRow, PetWriteResult } from "@camp404/db/pets";
import { isGodEmail } from "./access-control";
import type { AuthenticatedUser } from "./auth";
import { usesTestStore } from "./test-mode";
import { petsTestStore } from "./test-store-pets";

// Camp pets (owner, 2026-10-09), from the database or, under E2E, the test
// store's twin (test-store-pets.ts). The rules live in @camp404/db/pets and
// the twin repeats them.
//
// The reviewers are the FOUNDERS: a FOUNDER_EMAILS address, and only once it
// is verified (`primaryEmail` is already null for an unverified founder
// address, lib/session-user.ts). That is known from the session, not the
// database, so it is decided here, on the server, and a reviewer's write is
// only ever called after isPetReviewer said yes.

export type { PetPhotoSide, PetRow, PetWriteResult };

const store = () => (usesTestStore() ? petsTestStore : null);

/** Whether this signed-in person reviews pets: a verified founder. */
export function isPetReviewer(authUser: AuthenticatedUser): boolean {
  return canReviewPets({ isFounder: isGodEmail(authUser.primaryEmail) });
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
