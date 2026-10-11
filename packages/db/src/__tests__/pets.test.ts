import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { AuditAction } from "@camp404/core";
import { sanitiseAccount } from "../account";
import {
  PET_ALREADY_IN,
  PET_KEY_TAKEN,
  PET_NOT_IN,
  PET_NOT_YOURS,
  PET_SENT_WITH_PHOTOS,
  addPet,
  getPetPhoto,
  listPets,
  markPetIn,
  setPetHint,
  setPetOwner,
  setPetStupidThing,
} from "../pets";
import * as schema from "../schema";
import { makeUser } from "./_factories";
import { useTestDb } from "./_harness";

// Camp pets (owner, 2026-10-09) against real Postgres: the seed migration,
// who sees what, the founder's compare-and-set, and erasure.

const SEED = readFileSync(
  new URL("../../migrations/0112_seed_camp_pets.sql", import.meta.url),
  "utf8",
);

const h = useTestDb();

const PICKLE = {
  name: "Pickle",
  kind: "dog" as const,
  kindOther: null,
  stupidThing: "Barks at the kettle. Every time.",
};

async function q<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await h.client().query<T>(text, params)).rows;
}

async function sendPet(
  ownerId: string,
  overrides: Partial<typeof PICKLE> = {},
) {
  const r = await addPet({
    ...PICKLE,
    ...overrides,
    ownerId,
    frontPhotoPath: `pets/${ownerId}/front.webp`,
    sidePhotoPath: `pets/${ownerId}/side.webp`,
  });
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

async function auditActions(): Promise<AuditAction[]> {
  const rows = await h.db().select().from(schema.auditLog);
  return rows.map((r) => r.action as AuditAction);
}

describe("0112_seed_camp_pets", () => {
  beforeEach(async () => {
    // The harness ran every migration already; start each test bare.
    await q(`DELETE FROM pets`);
  });

  async function seeded() {
    return q<{ module_key: string; name: string; owner_id: string | null }>(
      `SELECT module_key, name, owner_id FROM pets ORDER BY module_key`,
    );
  }

  it("seeds the four cats as in, with no photos or hint, and is safe to run twice", async () => {
    await q(SEED);
    await q(SEED);
    const rows = await q<Record<string, unknown>>(
      `SELECT * FROM pets ORDER BY module_key`,
    );
    expect(rows.map((r) => r.module_key)).toEqual([
      "jinn",
      "moda",
      "nipster",
      "prince",
    ]);
    for (const r of rows) {
      expect(r.status).toBe("in");
      expect(r.kind).toBe("cat");
      expect(r.hint).toBeNull();
      expect(r.front_photo_path).toBeNull();
      expect(r.side_photo_path).toBeNull();
      expect(r.stupid_thing).toBeTruthy();
    }
  });

  it("links the owner when exactly one member goes by that first name", async () => {
    const caitlin = await makeUser(h.db(), { displayName: "caitlin Smith" });
    const cloud = await makeUser(h.db(), { displayName: "Cloud" });
    await q(SEED);
    const byKey = Object.fromEntries(
      (await seeded()).map((r) => [r.module_key, r.owner_id]),
    );
    expect(byKey.jinn).toBe(caitlin.id);
    expect(byKey.prince).toBe(cloud.id);
    // No Michael: nobody is linked.
    expect(byKey.moda).toBeNull();
    expect(byKey.nipster).toBeNull();
  });

  it("links nobody when two members share the name, and skips erased accounts", async () => {
    await makeUser(h.db(), { displayName: "Michael A" });
    await makeUser(h.db(), { displayName: "Michael B" });
    await makeUser(h.db(), { displayName: "Cloud", sanitised: true });
    const caitlin = await makeUser(h.db(), { displayName: "Caitlin" });
    await makeUser(h.db(), { displayName: "Caitlin", sanitised: true });
    await q(SEED);
    const byKey = Object.fromEntries(
      (await seeded()).map((r) => [r.module_key, r.owner_id]),
    );
    expect(byKey.moda).toBeNull();
    expect(byKey.nipster).toBeNull();
    expect(byKey.prince).toBeNull();
    expect(byKey.jinn).toBe(caitlin.id);
  });

  it("keeps a founder's later changes when it runs again", async () => {
    await q(SEED);
    await q(
      `UPDATE pets SET hint = 'Near the clock' WHERE module_key = 'jinn'`,
    );
    await q(SEED);
    const [jinn] = await q<{ hint: string }>(
      `SELECT hint FROM pets WHERE module_key = 'jinn'`,
    );
    expect(jinn!.hint).toBe("Near the clock");
  });
});

describe("pets", () => {
  beforeEach(async () => {
    await q(`DELETE FROM pets`);
  });

  it("shows a waiting pet to its sender and a reviewer only, never its photo paths", async () => {
    const owner = await makeUser(h.db());
    const other = await makeUser(h.db());
    const id = await sendPet(owner.id);

    const mine = await listPets({ viewerId: owner.id, isReviewer: false });
    expect(mine.map((p) => p.id)).toEqual([id]);
    expect(mine[0]).toMatchObject({
      status: "waiting",
      hasFrontPhoto: true,
      hasSidePhoto: true,
      ownerName: owner.displayName,
    });
    expect(JSON.stringify(mine)).not.toContain("pets/");

    expect(await listPets({ viewerId: other.id, isReviewer: false })).toEqual(
      [],
    );
    expect(
      (await listPets({ viewerId: other.id, isReviewer: true })).map(
        (p) => p.id,
      ),
    ).toEqual([id]);

    expect(await getPetPhoto(id, "side")).toEqual({
      ownerId: owner.id,
      pathname: `pets/${owner.id}/side.webp`,
    });
  });

  it("marks a pet in once: a compare-and-set, audited, with the owner's notice", async () => {
    const owner = await makeUser(h.db());
    const founder = await makeUser(h.db());
    const other = await makeUser(h.db());
    const id = await sendPet(owner.id);

    const first = await markPetIn({
      actorId: founder.id,
      petId: id,
      moduleKey: "biscuit",
      hint: "Look near the clock",
    });
    expect(first).toEqual({ ok: true, ownerId: owner.id });

    const second = await markPetIn({
      actorId: founder.id,
      petId: id,
      moduleKey: "other-key",
      hint: "Another",
    });
    expect(second).toEqual({ ok: false, error: PET_ALREADY_IN });

    const [row] = await h
      .db()
      .select()
      .from(schema.pets)
      .where(eq(schema.pets.id, id));
    expect(row).toMatchObject({
      status: "in",
      moduleKey: "biscuit",
      hint: "Look near the clock",
      markedInByUserId: founder.id,
    });
    expect(await auditActions()).toEqual(["pet.marked_in"]);

    const notices = await h
      .db()
      .select()
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.userId, owner.id));
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      kind: "pet_in",
      body: "Your pet is in. Hint: Look near the clock",
      channel: "in_app",
      refType: "pet",
      refId: id,
      emailStatus: "skipped",
    });

    // Now everyone sees it, with its hint.
    const seen = await listPets({ viewerId: other.id, isReviewer: false });
    expect(seen.map((p) => [p.id, p.hint])).toEqual([
      [id, "Look near the clock"],
    ]);
  });

  it("refuses a picture another pet already wears, and changes nothing", async () => {
    const owner = await makeUser(h.db());
    const founder = await makeUser(h.db());
    const a = await sendPet(owner.id);
    const b = await sendPet(owner.id, { name: "Biscuit" });
    await markPetIn({
      actorId: founder.id,
      petId: a,
      moduleKey: "k",
      hint: "x",
    });
    const clash = await markPetIn({
      actorId: founder.id,
      petId: b,
      moduleKey: "k",
      hint: "y",
    });
    expect(clash).toEqual({ ok: false, error: PET_KEY_TAKEN });
    const [row] = await h
      .db()
      .select()
      .from(schema.pets)
      .where(eq(schema.pets.id, b));
    expect(row!.status).toBe("waiting");
    expect(await auditActions()).toEqual(["pet.marked_in"]);
  });

  it("edits a hint only on a pet that is in, audited", async () => {
    const owner = await makeUser(h.db());
    const founder = await makeUser(h.db());
    const id = await sendPet(owner.id);
    expect(
      await setPetHint({ actorId: founder.id, petId: id, hint: "Too soon" }),
    ).toEqual({ ok: false, error: PET_NOT_IN });
    await markPetIn({
      actorId: founder.id,
      petId: id,
      moduleKey: "k",
      hint: "a",
    });
    expect(
      await setPetHint({ actorId: founder.id, petId: id, hint: "Better" }),
    ).toEqual({ ok: true });
    expect(await auditActions()).toEqual(["pet.marked_in", "pet.hint_changed"]);
  });

  it("sets a seeded pet's owner, audited, and refuses an erased member", async () => {
    const founder = await makeUser(h.db());
    const caitlin = await makeUser(h.db(), { displayName: "Caitlin" });
    const gone = await makeUser(h.db(), { sanitised: true });
    await q(SEED);
    const [jinn] = await q<{ id: string }>(
      `SELECT id FROM pets WHERE module_key = 'jinn'`,
    );
    await q(`UPDATE pets SET owner_id = NULL`);
    expect(
      await setPetOwner({
        actorId: founder.id,
        petId: jinn!.id,
        ownerId: gone.id,
      }),
    ).toMatchObject({ ok: false });
    expect(
      await setPetOwner({
        actorId: founder.id,
        petId: jinn!.id,
        ownerId: caitlin.id,
      }),
    ).toEqual({ ok: true });
    const [row] = await q<{ owner_id: string }>(
      `SELECT owner_id FROM pets WHERE id = $1`,
      [jinn!.id],
    );
    expect(row!.owner_id).toBe(caitlin.id);
    expect(await auditActions()).toEqual(["pet.owner_set"]);
  });

  it("never moves a pet a member sent in, so its photos stay with the sender", async () => {
    const founder = await makeUser(h.db());
    const sender = await makeUser(h.db());
    const other = await makeUser(h.db());
    const id = await sendPet(sender.id);
    expect(
      await setPetOwner({ actorId: founder.id, petId: id, ownerId: other.id }),
    ).toEqual({ ok: false, error: PET_SENT_WITH_PHOTOS });
    expect(
      await setPetOwner({ actorId: founder.id, petId: id, ownerId: null }),
    ).toEqual({ ok: false, error: PET_SENT_WITH_PHOTOS });
    expect(await getPetPhoto(id, "front")).toMatchObject({
      ownerId: sender.id,
    });
    expect(await auditActions()).toEqual([]);
  });

  it("lets the owner change the stupid thing, and nobody else but a reviewer", async () => {
    const owner = await makeUser(h.db());
    const other = await makeUser(h.db());
    const id = await sendPet(owner.id);
    expect(
      await setPetStupidThing({
        actorId: other.id,
        isReviewer: false,
        petId: id,
        stupidThing: "Mine now",
      }),
    ).toEqual({ ok: false, error: PET_NOT_YOURS });
    expect(
      await setPetStupidThing({
        actorId: owner.id,
        isReviewer: false,
        petId: id,
        stupidThing: "Steals bread.",
      }),
    ).toEqual({ ok: true });
    // The owner's own change is not a privileged write: no audit row.
    expect(await auditActions()).toEqual([]);
    expect(
      await setPetStupidThing({
        actorId: other.id,
        isReviewer: true,
        petId: id,
        stupidThing: "Steals all the bread.",
      }),
    ).toEqual({ ok: true });
    expect(await auditActions()).toEqual(["pet.line_changed"]);
  });

  it("erasure deletes the member's pets and leaves everyone else's", async () => {
    const owner = await makeUser(h.db());
    const other = await makeUser(h.db());
    await sendPet(owner.id);
    await sendPet(owner.id, { name: "Biscuit" });
    const kept = await sendPet(other.id);
    const result = await sanitiseAccount(owner.id);
    expect(result.ok).toBe(true);
    const left = await q<{ id: string }>(`SELECT id FROM pets`);
    expect(left.map((r) => r.id)).toEqual([kept]);
  });

  it("erasure keeps a seeded camp cat, linked to nobody", async () => {
    const caitlin = await makeUser(h.db(), { displayName: "Caitlin" });
    await q(SEED);
    const [jinn] = await q<{ id: string; owner_id: string | null }>(
      `SELECT id, owner_id FROM pets WHERE module_key = 'jinn'`,
    );
    expect(jinn!.owner_id).toBe(caitlin.id);
    await sendPet(caitlin.id);
    expect((await sanitiseAccount(caitlin.id)).ok).toBe(true);
    const left = await q<{ id: string; owner_id: string | null }>(
      `SELECT id, owner_id FROM pets WHERE owner_id IS NULL OR owner_id = $1`,
      [caitlin.id],
    );
    expect(left.map((r) => r.id)).toContain(jinn!.id);
    expect(left.every((r) => r.owner_id === null)).toBe(true);
    const [count] = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM pets WHERE front_photo_path IS NOT NULL`,
    );
    expect(count!.n).toBe(0);
  });
});
