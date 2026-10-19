import "server-only";

import { canReviewPets, petInNotification } from "@camp404/core";
import {
  PET_ALREADY_IN,
  PET_GONE,
  PET_KEY_TAKEN,
  PET_NO_ACTOR,
  PET_NO_SUCH_MEMBER,
  PET_NOT_A_REVIEWER,
  PET_NOT_IN,
  PET_NOT_YOURS,
  PET_SENT_WITH_PHOTOS,
  type PetPhotoSide,
  type PetRow,
  type PetWriteResult,
} from "@camp404/db/pets";
import type { PetInput, PetKind, PetStatus } from "@camp404/types";
import { testStore } from "./test-store";

// The in-memory twin of @camp404/db/pets (Camp pets), for E2E_TEST_MODE. The
// same rules, sentences and results over the store's own rows: a waiting pet
// is its sender's and a reviewer's, marking in is a compare-and-set on
// `waiting` that refuses a picture another pet wears, and the owner gets the
// same in-app notice. A reviewer is a captain, read from the store at the
// write, as the database reads the rank inside each write. It starts with the four seeded cats, as the migration
// leaves them on a camp where no member's name matches (no owner). The store
// keeps no audit log and is one synchronous process, so nothing to lock.

interface PetStoreRow {
  id: string;
  ownerId: string | null;
  name: string;
  kind: PetKind;
  kindOther: string | null;
  stupidThing: string;
  status: PetStatus;
  hint: string | null;
  moduleKey: string | null;
  frontPhotoPath: string | null;
  sidePhotoPath: string | null;
  createdAt: Date;
  markedInAt: Date | null;
}

interface PetsState {
  pets: PetStoreRow[];
}

const KEY = "__camp404PetsTestStore__";

const SEEDED: readonly [string, string][] = [
  ["jinn", "Jinn"],
  ["moda", "Moda"],
  ["nipster", "Nipster"],
  ["prince", "Prince"],
];

function seeded(): PetStoreRow[] {
  const at = new Date("2026-10-09T00:00:00.000Z");
  return SEEDED.map(([key, name]) => ({
    id: crypto.randomUUID(),
    ownerId: null,
    name,
    kind: "cat",
    kindOther: null,
    stupidThing: "Still thinking of one.",
    status: "in",
    hint: null,
    moduleKey: key,
    frontPhotoPath: null,
    sidePhotoPath: null,
    createdAt: at,
    markedInAt: null,
  }));
}

function state(): PetsState {
  const g = globalThis as Record<string, unknown>;
  g[KEY] ??= { pets: seeded() } satisfies PetsState;
  return g[KEY] as PetsState;
}

/** Back to the four seeded cats (testStore.reset calls this). */
export function resetPetsStore(): void {
  state().pets = seeded();
}

function ownerNameOf(displayName: string | null): string {
  const name = displayName?.trim();
  return name && !name.includes("@") ? name : "Unnamed member";
}

function rowOf(p: PetStoreRow): PetRow {
  return {
    id: p.id,
    ownerId: p.ownerId,
    ownerName: p.ownerId
      ? ownerNameOf(testStore.findUserById(p.ownerId)?.displayName ?? null)
      : null,
    name: p.name,
    kind: p.kind,
    kindOther: p.kindOther,
    stupidThing: p.stupidThing,
    status: p.status,
    hint: p.hint,
    moduleKey: p.moduleKey,
    hasFrontPhoto: p.frontPhotoPath !== null,
    hasSidePhoto: p.sidePhotoPath !== null,
    createdAt: p.createdAt,
    markedInAt: p.markedInAt,
  };
}

const time = (d: Date | null) => d?.getTime() ?? 0;

function find(petId: string): PetStoreRow | undefined {
  return state().pets.find((p) => p.id === petId);
}

const refused = (error: string) => ({ ok: false as const, error });

/** A camp member who has not been erased, as the database reads one. */
function liveMember(userId: string) {
  const user = testStore.findUserById(userId);
  return user && !user.sanitised ? user : null;
}

/**
 * The actor, read now (lockActor's twin): null when there is no such member,
 * else whether they review pets (a captain).
 */
function actorReviews(actorId: string): boolean | null {
  const actor = liveMember(actorId);
  if (!actor) return null;
  return canReviewPets({ isCaptain: actor.rank === "captain" });
}

/** lockReviewer's twin: the refusal for a non-captain, or null to go on. */
function notAReviewer(actorId: string): ReturnType<typeof refused> | null {
  const reviews = actorReviews(actorId);
  if (reviews === null) return refused(PET_NO_ACTOR);
  return reviews ? null : refused(PET_NOT_A_REVIEWER);
}

export const petsTestStore = {
  listPets(viewer: { viewerId: string; isReviewer: boolean }): PetRow[] {
    return state()
      .pets.filter(
        (p) =>
          viewer.isReviewer ||
          p.status === "in" ||
          p.ownerId === viewer.viewerId,
      )
      .sort(
        (a, b) =>
          Number(b.status === "waiting") - Number(a.status === "waiting") ||
          time(b.markedInAt) - time(a.markedInAt) ||
          time(b.createdAt) - time(a.createdAt) ||
          a.name.localeCompare(b.name),
      )
      .map(rowOf);
  },

  listUsedPetModuleKeys(): string[] {
    return state()
      .pets.map((p) => p.moduleKey)
      .filter((k): k is string => k !== null);
  },

  getPetPhoto(
    petId: string,
    side: PetPhotoSide,
  ): { ownerId: string | null; pathname: string } | null {
    const p = find(petId);
    const pathname = p
      ? side === "front"
        ? p.frontPhotoPath
        : p.sidePhotoPath
      : null;
    return p && pathname ? { ownerId: p.ownerId, pathname } : null;
  },

  listPetOwnerChoices(): { id: string; name: string }[] {
    return testStore
      .allUsers()
      .filter((u) => !u.sanitised)
      .map((u) => ({ id: u.id, name: ownerNameOf(u.displayName) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  addPet(
    input: PetInput & {
      ownerId: string;
      frontPhotoPath: string;
      sidePhotoPath: string;
    },
  ): PetWriteResult<{ id: string }> {
    if (!liveMember(input.ownerId)) return refused(PET_NO_ACTOR);
    const id = crypto.randomUUID();
    state().pets.push({
      id,
      ownerId: input.ownerId,
      name: input.name,
      kind: input.kind,
      kindOther: input.kind === "other" ? input.kindOther : null,
      stupidThing: input.stupidThing,
      status: "waiting",
      hint: null,
      moduleKey: null,
      frontPhotoPath: input.frontPhotoPath,
      sidePhotoPath: input.sidePhotoPath,
      createdAt: new Date(),
      markedInAt: null,
    });
    return { ok: true, id };
  },

  setPetStupidThing(input: {
    actorId: string;
    petId: string;
    stupidThing: string;
  }): PetWriteResult {
    const reviewer = actorReviews(input.actorId);
    if (reviewer === null) return refused(PET_NO_ACTOR);
    const p = find(input.petId);
    if (!p) return refused(PET_GONE);
    const own = p.ownerId !== null && p.ownerId === input.actorId;
    if (!own && !reviewer) return refused(PET_NOT_YOURS);
    p.stupidThing = input.stupidThing;
    return { ok: true };
  },

  markPetIn(input: {
    actorId: string;
    petId: string;
    moduleKey: string;
    hint: string;
  }): PetWriteResult<{ ownerId: string | null }> {
    const no = notAReviewer(input.actorId);
    if (no) return no;
    const p = find(input.petId);
    if (!p) return refused(PET_GONE);
    if (p.status !== "waiting") return refused(PET_ALREADY_IN);
    if (state().pets.some((o) => o.moduleKey === input.moduleKey)) {
      return refused(PET_KEY_TAKEN);
    }
    p.status = "in";
    p.moduleKey = input.moduleKey;
    p.hint = input.hint;
    p.markedInAt = new Date();
    if (p.ownerId) {
      testStore.pushNotice(
        p.ownerId,
        petInNotification({ petId: p.id, petName: p.name, hint: input.hint }),
      );
    }
    return { ok: true, ownerId: p.ownerId };
  },

  setPetHint(input: {
    actorId: string;
    petId: string;
    hint: string;
  }): PetWriteResult {
    const no = notAReviewer(input.actorId);
    if (no) return no;
    const p = find(input.petId);
    if (!p) return refused(PET_GONE);
    if (p.status !== "in") return refused(PET_NOT_IN);
    p.hint = input.hint;
    return { ok: true };
  },

  setPetOwner(input: {
    actorId: string;
    petId: string;
    ownerId: string | null;
  }): PetWriteResult {
    const no = notAReviewer(input.actorId);
    if (no) return no;
    const p = find(input.petId);
    if (!p) return refused(PET_GONE);
    if (p.frontPhotoPath !== null || p.sidePhotoPath !== null) {
      return refused(PET_SENT_WITH_PHOTOS);
    }
    if (input.ownerId !== null && !liveMember(input.ownerId)) {
      return refused(PET_NO_SUCH_MEMBER);
    }
    p.ownerId = input.ownerId;
    return { ok: true };
  },

  /**
   * Erasure's twin: the pets the member sent in (with photos) go; a seeded
   * cat linked to them stays, linked to nobody.
   */
  deletePetsOf(userId: string): void {
    const s = state();
    s.pets = s.pets.filter(
      (p) =>
        p.ownerId !== userId ||
        (p.frontPhotoPath === null && p.sidePhotoPath === null),
    );
    for (const p of s.pets) if (p.ownerId === userId) p.ownerId = null;
  },
};
