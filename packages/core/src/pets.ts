// Camp pets (owner, 2026-10-09): who sees what, and who reviews.
//
//  - The reviewers are the camp's captains (users.rank = 'captain'). The
//    owner moved it there from the FOUNDER_EMAILS list on 2026-10-11:
//    "captains can control this". The app reads the rank on the server; these
//    rules take the answer.
//  - The PHOTOS are only for a reviewer to draw the pet from: the member who
//    sent them and the reviewers see them, nobody else, ever. The gallery
//    never shows a photo of someone else's pet.
//  - A pet that is "in" is everyone's to see, with its hint; a waiting pet is
//    its sender's and the reviewers' only.
//
// Pure: no I/O. The data layer and the photo route call these.

import type { PetKind, PetStatus } from "@camp404/types";

/** The words for each kind of pet, as the form and the cards say them. */
export const PET_KIND_LABEL: Readonly<Record<PetKind, string>> = {
  cat: "Cat",
  dog: "Dog",
  other: "Something else",
};

/** What a card says a pet is: the member's own word for "Something else". */
export function petKindText(kind: PetKind, kindOther: string | null): string {
  if (kind === "other") return kindOther?.trim() || PET_KIND_LABEL.other;
  return PET_KIND_LABEL[kind];
}

/** Whether this viewer reviews pets: a captain, and nobody else. Fails closed. */
export function canReviewPets(viewer: { isCaptain: boolean }): boolean {
  return viewer.isCaptain === true;
}

/**
 * Whether a viewer may see a pet's photos: the member who sent them, or a
 * reviewer. Fails closed: a pet with no owner (one the camp seeded) shows its
 * photos to the reviewers only, and it has none.
 */
export function mayReadPetPhoto(input: {
  viewerId: string;
  ownerId: string | null;
  isCaptain: boolean;
}): boolean {
  if (canReviewPets(input)) return true;
  return input.ownerId !== null && input.ownerId === input.viewerId;
}

/**
 * Whether a viewer may see a pet at all: one that is in is everyone's; a
 * waiting one is its sender's and the reviewers'.
 */
export function maySeePet(
  pet: { status: PetStatus; ownerId: string | null },
  viewer: { viewerId: string; isCaptain: boolean },
): boolean {
  if (pet.status === "in") return true;
  return mayReadPetPhoto({ ...viewer, ownerId: pet.ownerId });
}

/**
 * The picture keys still free: the code's registry, less the ones a pet
 * already wears. In the registry's order.
 */
export function unusedPetModuleKeys(
  registry: readonly string[],
  used: Iterable<string | null>,
): string[] {
  const taken = new Set<string>();
  for (const key of used) if (key) taken.add(key);
  return registry.filter((key) => !taken.has(key));
}
