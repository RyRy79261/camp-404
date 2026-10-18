import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { canReviewPets, petInNotification } from "@camp404/core";
import type { PetInput, PetKind, PetStatus } from "@camp404/types";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { deliveryValues } from "./deliveries";
import { createHttpDb, withTransaction, type Tx } from "./index";
import * as schema from "./schema";

// Camp pets (owner, 2026-10-09): the data layer.
//
//  - Any approved member sends in a pet with two photos (the upload route
//    checks the photos and the approval, then calls addPet). It waits.
//  - A CAPTAIN reviews (owner, 2026-10-11; it was a FOUNDER_EMAILS list):
//    marks a waiting pet in with a picture key from the code's registry and a
//    one-line hint, edits a hint, says whose a seeded pet is, and may change
//    any pet's one stupid thing. The caller checks the rank before it calls a
//    reviewer's write, and each write reads the actor's rank AGAIN inside its
//    own transaction (lockReviewer), so a captain demoted between the check
//    and the write is refused. Each such write is audited in that transaction.
//  - Marking in is a compare-and-set on `waiting`: a second captain's click,
//    or a key another pet took first, gets a sentence, never an overwrite. It
//    writes the owner's in-app notice in the same transaction; the caller
//    sends it on with deliverAfterResponse().
//
// Who READS what is decided here, never by a screen hiding it: listPets
// returns every pet that is in, and a waiting pet only to its sender or a
// reviewer. Photo pathnames never leave this module except to the photo
// route, through getPetPhoto, which the route checks with mayReadPetPhoto.
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

export type PetWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const PET_GONE = "That pet isn't there any more. Reload the page.";
export const PET_ALREADY_IN =
  "Someone marked this pet as in first. Reload the page.";
export const PET_NOT_IN = "Only a pet that is in has a hint. Reload the page.";
export const PET_KEY_TAKEN =
  "Another pet already has that picture. Pick another one.";
export const PET_NO_SUCH_MEMBER = "That member isn't in the camp any more.";
export const PET_NOT_YOURS = "You can only change your own pet.";
export const PET_NO_ACTOR = "Your account isn't in the camp any more.";
export const PET_NOT_A_REVIEWER = "Only captains review pets.";
export const PET_SENT_WITH_PHOTOS =
  "A pet a member sent in stays theirs: its photos are only for them.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The photos a pet has: from the front and from the side. */
export type PetPhotoSide = "front" | "side";

/** A pet as Camp pets shows it. No photo pathnames. */
export interface PetRow {
  id: string;
  ownerId: string | null;
  /** The owner's name, or null for a pet nobody is linked to. */
  ownerName: string | null;
  name: string;
  kind: PetKind;
  kindOther: string | null;
  stupidThing: string;
  status: PetStatus;
  hint: string | null;
  moduleKey: string | null;
  hasFrontPhoto: boolean;
  hasSidePhoto: boolean;
  createdAt: Date;
  markedInAt: Date | null;
}

/**
 * The name a member goes by in the camp. An account that never set a name
 * carries its address there, which is never shown.
 */
function ownerNameOf(displayName: string | null): string {
  const name = displayName?.trim();
  return name && !name.includes("@") ? name : "Unnamed member";
}

const COLUMNS = {
  id: schema.pets.id,
  ownerId: schema.pets.ownerId,
  displayName: schema.users.displayName,
  name: schema.pets.name,
  kind: schema.pets.kind,
  kindOther: schema.pets.kindOther,
  stupidThing: schema.pets.stupidThing,
  status: schema.pets.status,
  hint: schema.pets.hint,
  moduleKey: schema.pets.moduleKey,
  frontPhotoPath: schema.pets.frontPhotoPath,
  sidePhotoPath: schema.pets.sidePhotoPath,
  createdAt: schema.pets.createdAt,
  markedInAt: schema.pets.markedInAt,
};

function petQuery(db: DbOrTx) {
  return db
    .select(COLUMNS)
    .from(schema.pets)
    .leftJoin(schema.users, eq(schema.users.id, schema.pets.ownerId));
}

type Selected = Awaited<ReturnType<typeof petQuery>>[number];

function rowOf(r: Selected): PetRow {
  return {
    id: r.id,
    ownerId: r.ownerId,
    ownerName: r.ownerId ? ownerNameOf(r.displayName) : null,
    name: r.name,
    kind: r.kind,
    kindOther: r.kindOther,
    stupidThing: r.stupidThing,
    status: r.status,
    hint: r.hint,
    moduleKey: r.moduleKey,
    hasFrontPhoto: r.frontPhotoPath !== null,
    hasSidePhoto: r.sidePhotoPath !== null,
    createdAt: r.createdAt,
    markedInAt: r.markedInAt,
  };
}

// --- Reads -------------------------------------------------------------------

/**
 * The pets this viewer may see: every pet that is in, and the waiting ones
 * that are theirs (all of them for a reviewer). Waiting first, then the
 * newest in.
 */
export async function listPets(viewer: {
  viewerId: string;
  isReviewer: boolean;
}): Promise<PetRow[]> {
  const db = createHttpDb();
  const visible = viewer.isReviewer
    ? undefined
    : UUID.test(viewer.viewerId)
      ? or(
          eq(schema.pets.status, "in"),
          eq(schema.pets.ownerId, viewer.viewerId),
        )
      : eq(schema.pets.status, "in");
  const rows = await petQuery(db)
    .where(visible)
    .orderBy(
      desc(sql`${schema.pets.status} = 'waiting'`),
      sql`${schema.pets.markedInAt} desc nulls last`,
      desc(schema.pets.createdAt),
      asc(schema.pets.name),
    );
  return rows.map(rowOf);
}

/** The picture keys pets already wear, for the reviewer's picker. */
export async function listUsedPetModuleKeys(): Promise<string[]> {
  const rows = await createHttpDb()
    .select({ key: schema.pets.moduleKey })
    .from(schema.pets)
    .where(sql`${schema.pets.moduleKey} is not null`);
  return rows.map((r) => r.key!);
}

/**
 * One of a pet's photos, with whose pet it is, for the photo route to check
 * (mayReadPetPhoto) before it streams anything. Null when there is none.
 */
export async function getPetPhoto(
  petId: string,
  side: PetPhotoSide,
): Promise<{ ownerId: string | null; pathname: string } | null> {
  if (!UUID.test(petId)) return null;
  const [row] = await createHttpDb()
    .select({
      ownerId: schema.pets.ownerId,
      front: schema.pets.frontPhotoPath,
      side: schema.pets.sidePhotoPath,
    })
    .from(schema.pets)
    .where(eq(schema.pets.id, petId));
  const pathname = row ? (side === "front" ? row.front : row.side) : null;
  return row && pathname ? { ownerId: row.ownerId, pathname } : null;
}

/** The members a reviewer may name as a pet's owner: everyone not erased. */
export async function listPetOwnerChoices(): Promise<
  { id: string; name: string }[]
> {
  const rows = await createHttpDb()
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.sanitised, false))
    .orderBy(asc(schema.users.displayName));
  return rows.map((r) => ({ id: r.id, name: ownerNameOf(r.displayName) }));
}

// --- Transactions ------------------------------------------------------------

class Refused extends Error {
  constructor(readonly sentence: string) {
    super(sentence);
    this.name = "Refused";
  }
}

function refuse(sentence: string): never {
  throw new Refused(sentence);
}

/** A Postgres unique violation, which drizzle nests under `.cause`. */
function isModuleKeyClash(err: unknown): boolean {
  for (let e: unknown = err; e; e = (e as { cause?: unknown }).cause) {
    const pg = e as { code?: string; constraint?: string };
    if (pg.code === "23505") {
      return !pg.constraint || pg.constraint === "pets_module_key_uniq";
    }
  }
  return false;
}

async function write<T extends object>(
  fn: (tx: Tx) => Promise<T>,
): Promise<PetWriteResult<T>> {
  try {
    const value = await withTransaction(fn);
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    if (isModuleKeyClash(error)) return { ok: false, error: PET_KEY_TAKEN };
    throw error;
  }
}

async function lockPet(tx: Tx, petId: string) {
  if (!UUID.test(petId)) refuse(PET_GONE);
  const [pet] = await tx
    .select()
    .from(schema.pets)
    .where(eq(schema.pets.id, petId))
    .for("update");
  if (!pet) refuse(PET_GONE);
  return pet;
}

/**
 * The actor is a camp member who has not been erased, read and locked.
 * Returns whether they review pets: a real (not system) captain, as the
 * database says now, never as the caller said.
 */
async function lockPetActor(tx: DbOrTx, actorId: string): Promise<boolean> {
  if (!UUID.test(actorId)) refuse(PET_NO_ACTOR);
  const [row] = await tx
    .select({ rank: schema.users.rank, isSystem: schema.users.isSystem })
    .from(schema.users)
    .where(and(eq(schema.users.id, actorId), eq(schema.users.sanitised, false)))
    .for("share");
  if (!row) refuse(PET_NO_ACTOR);
  return canReviewPets({ isCaptain: !row.isSystem && row.rank === "captain" });
}

/** The actor is a captain, read and locked in this transaction, or refused. */
async function lockReviewer(tx: DbOrTx, actorId: string): Promise<void> {
  if (!(await lockPetActor(tx, actorId))) refuse(PET_NOT_A_REVIEWER);
}

// --- The member's writes -----------------------------------------------------

/**
 * A member sends in their pet. It waits for a captain. The photos are the
 * pathnames the upload route stored in the member's own folder.
 */
export async function addPet(
  input: PetInput & {
    ownerId: string;
    frontPhotoPath: string;
    sidePhotoPath: string;
  },
): Promise<PetWriteResult<{ id: string }>> {
  return write(async (tx) => {
    await lockPetActor(tx, input.ownerId);
    const [row] = await tx
      .insert(schema.pets)
      .values({
        ownerId: input.ownerId,
        name: input.name,
        kind: input.kind,
        kindOther: input.kind === "other" ? input.kindOther : null,
        stupidThing: input.stupidThing,
        frontPhotoPath: input.frontPhotoPath,
        sidePhotoPath: input.sidePhotoPath,
      })
      .returning({ id: schema.pets.id });
    return { id: row!.id };
  });
}

/**
 * Change a pet's stupid thing: its owner, or a captain (read here, in the
 * transaction). A captain's change to someone else's pet is audited.
 */
export async function setPetStupidThing(input: {
  actorId: string;
  petId: string;
  stupidThing: string;
}): Promise<PetWriteResult> {
  return write(async (tx) => {
    const reviewer = await lockPetActor(tx, input.actorId);
    const pet = await lockPet(tx, input.petId);
    const own = pet.ownerId !== null && pet.ownerId === input.actorId;
    if (!own && !reviewer) refuse(PET_NOT_YOURS);
    await tx
      .update(schema.pets)
      .set({ stupidThing: input.stupidThing, updatedAt: new Date() })
      .where(eq(schema.pets.id, pet.id));
    if (!own) {
      await writeAuditEvent(tx, {
        actorId: input.actorId,
        action: "pet.line_changed",
        target: pet.id,
        metadata: { name: pet.name },
      });
    }
    return {};
  });
}

// --- A captain's writes (each re-reads the actor's rank: lockReviewer) ------

/**
 * Mark a waiting pet in: its picture key and the hint. A compare-and-set on
 * `waiting`, audited, and the owner's in-app notice in the same transaction.
 * The caller checks the key is one the code has a picture for.
 */
export async function markPetIn(input: {
  actorId: string;
  petId: string;
  moduleKey: string;
  hint: string;
}): Promise<PetWriteResult<{ ownerId: string | null }>> {
  return write(async (tx) => {
    await lockReviewer(tx, input.actorId);
    const pet = await lockPet(tx, input.petId);
    if (pet.status !== "waiting") refuse(PET_ALREADY_IN);
    const [taken] = await tx
      .select({ id: schema.pets.id })
      .from(schema.pets)
      .where(eq(schema.pets.moduleKey, input.moduleKey));
    if (taken) refuse(PET_KEY_TAKEN);
    const now = new Date();
    const won = await tx
      .update(schema.pets)
      .set({
        status: "in",
        moduleKey: input.moduleKey,
        hint: input.hint,
        markedInByUserId: input.actorId,
        markedInAt: now,
        updatedAt: now,
      })
      .where(and(eq(schema.pets.id, pet.id), eq(schema.pets.status, "waiting")))
      .returning({ id: schema.pets.id });
    if (won.length === 0) refuse(PET_ALREADY_IN);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "pet.marked_in",
      target: pet.id,
      metadata: { name: pet.name, moduleKey: input.moduleKey },
    });
    if (pet.ownerId) {
      await tx.insert(schema.notificationDeliveries).values(
        deliveryValues(
          petInNotification({
            petId: pet.id,
            petName: pet.name,
            hint: input.hint,
          }),
          {
            userId: pet.ownerId,
            broadcastId: null,
            channel: "in_app",
            presentation: "feed",
          },
        ),
      );
    }
    return { ownerId: pet.ownerId };
  });
}

/** Change the hint on a pet that is in. Audited. */
export async function setPetHint(input: {
  actorId: string;
  petId: string;
  hint: string;
}): Promise<PetWriteResult> {
  return write(async (tx) => {
    await lockReviewer(tx, input.actorId);
    const pet = await lockPet(tx, input.petId);
    if (pet.status !== "in") refuse(PET_NOT_IN);
    await tx
      .update(schema.pets)
      .set({ hint: input.hint, updatedAt: new Date() })
      .where(eq(schema.pets.id, pet.id));
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "pet.hint_changed",
      target: pet.id,
      metadata: { name: pet.name },
    });
    return {};
  });
}

/**
 * Say whose pet it is (or nobody's), for a pet with no photos (a seeded one).
 * A pet a member sent in is refused: its photos sit in the sender's folder and
 * only the sender and the captains may see them, so it never changes hands.
 * The member must not be erased. Audited.
 */
export async function setPetOwner(input: {
  actorId: string;
  petId: string;
  ownerId: string | null;
}): Promise<PetWriteResult> {
  return write(async (tx) => {
    await lockReviewer(tx, input.actorId);
    const pet = await lockPet(tx, input.petId);
    if (pet.frontPhotoPath !== null || pet.sidePhotoPath !== null) {
      refuse(PET_SENT_WITH_PHOTOS);
    }
    if (input.ownerId !== null) {
      if (!UUID.test(input.ownerId)) refuse(PET_NO_SUCH_MEMBER);
      const [member] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(
          and(
            eq(schema.users.id, input.ownerId),
            eq(schema.users.sanitised, false),
          ),
        )
        .for("share");
      if (!member) refuse(PET_NO_SUCH_MEMBER);
    }
    await tx
      .update(schema.pets)
      .set({ ownerId: input.ownerId, updatedAt: new Date() })
      .where(eq(schema.pets.id, pet.id));
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "pet.owner_set",
      target: pet.id,
      metadata: { name: pet.name, ownerId: input.ownerId },
    });
    return {};
  });
}
