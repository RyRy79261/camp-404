// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import {
  PET_ALREADY_IN,
  PET_NOT_A_REVIEWER,
  PET_NOT_YOURS,
  PET_SENT_WITH_PHOTOS,
} from "@camp404/db/pets";
import * as schema from "@camp404/db/schema";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import { makeUser } from "../../../../../packages/db/src/__tests__/_factories";

vi.mock("next/server", () => ({ after: () => undefined }));

import { registerPetsTools } from "../tools/pets";

// Camp pets' connector tools, on real Postgres (PGlite) through the real
// handlers: the page's own writes for the same person, who may and who is
// refused in what words, the rows, notices and audit rows they leave, and
// the read cut on the server (another member's waiting pet, and photos,
// never reach a member).

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
registerPetsTools({
  registerTool: (name: string, _config: unknown, handler: Handler) => {
    tools.set(name, handler);
  },
} as unknown as McpServer);

async function call(name: string, args: unknown, as: string) {
  const result = await tools.get(name)!(args, {
    http: { authInfo: { clientId: "test", extra: { campUserId: as } } },
  });
  const text = (result.content[0] as { text: string }).text;
  return result.isError
    ? { error: text }
    : { data: JSON.parse(text) as Record<string, unknown> };
}

// eslint-disable-next-line react-hooks/rules-of-hooks -- useTestDb is the PGlite harness, not a React Hook
const h = useTestDb();

const member = () => makeUser(h.db(), { approvalStatus: "approved" });
const captain = () =>
  makeUser(h.db(), { approvalStatus: "approved", rank: "captain" });

/** A pet a member sent in, waiting, with its photos. */
async function sentIn(ownerId: string, name = "Rex") {
  const [row] = await h
    .db()
    .insert(schema.pets)
    .values({
      ownerId,
      name,
      kind: "dog",
      stupidThing: "Eats socks",
      frontPhotoPath: `pets/${ownerId}/front.jpg`,
      sidePhotoPath: `pets/${ownerId}/side.jpg`,
    })
    .returning();
  return row!;
}

async function petRow(id: string) {
  const [row] = await h
    .db()
    .select()
    .from(schema.pets)
    .where(eq(schema.pets.id, id));
  return row!;
}

async function auditRows(action: string) {
  return h
    .db()
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, action));
}

/** A picture no pet wears: each test starts from empty tables. */
async function freePicture(): Promise<string> {
  const [worn] = await h
    .db()
    .select()
    .from(schema.pets)
    .where(eq(schema.pets.moduleKey, "jinn"));
  expect(worn).toBeUndefined();
  return "jinn";
}

/** A seeded pet: in, with no photos and nobody linked. */
async function seeded() {
  const [row] = await h
    .db()
    .insert(schema.pets)
    .values({
      name: "Moda",
      kind: "cat",
      stupidThing: "Sits on keyboards",
      status: "in",
      moduleKey: "moda",
    })
    .returning();
  return row!;
}

describe("list_pets", () => {
  it("cuts another member's waiting pet and every photo on the server", async () => {
    const owner = await member();
    const other = await member();
    const boss = await captain();
    const rex = await sentIn(owner.id);

    const ids = async (as: string) =>
      ((await call("list_pets", {}, as)).data!.pets as { id: string }[]).map(
        (p) => p.id,
      );
    expect(await ids(owner.id)).toContain(rex.id);
    expect(await ids(other.id)).not.toContain(rex.id);
    expect(await ids(boss.id)).toContain(rex.id);

    const ownView = await call("list_pets", {}, owner.id);
    expect(JSON.stringify(ownView.data)).not.toContain("front.jpg");
    expect(ownView.data!.freePictures).toBeUndefined();
    const reviewView = await call("list_pets", {}, boss.id);
    expect(JSON.stringify(reviewView.data)).not.toContain("front.jpg");
    expect(
      (reviewView.data!.pets as { id: string; ownerMayChange: boolean }[]).find(
        (p) => p.id === rex.id,
      )!.ownerMayChange,
    ).toBe(false);
  });
});

describe("the stupid thing", () => {
  it("is the pet's member's to change, at the text they read", async () => {
    const owner = await member();
    const other = await member();
    const rex = await sentIn(owner.id);

    const mine = await call(
      "set_pet_stupid_thing",
      { petId: rex.id, stupidThing: "Barks at bins", expected: "Eats socks" },
      owner.id,
    );
    expect(mine.error).toBeUndefined();
    expect((await petRow(rex.id)).stupidThing).toBe("Barks at bins");
    // The member's own change is theirs: no audit row.
    expect(await auditRows("pet.line_changed")).toHaveLength(0);

    const stale = await call(
      "set_pet_stupid_thing",
      { petId: rex.id, stupidThing: "Sleeps a lot", expected: "Eats socks" },
      owner.id,
    );
    expect(stale.error).toMatch(/changed this pet first/);

    // Rex is waiting: another member cannot even see it.
    await h
      .db()
      .update(schema.pets)
      .set({ status: "in", moduleKey: "nipster" })
      .where(eq(schema.pets.id, rex.id));
    expect(
      (
        await call(
          "set_pet_stupid_thing",
          {
            petId: rex.id,
            stupidThing: "Mine now",
            expected: "Barks at bins",
          },
          other.id,
        )
      ).error,
    ).toBe(PET_NOT_YOURS);
  });
});

describe("the review", () => {
  it("is a captain's: marks in once, with a notice and an audit row", async () => {
    const owner = await member();
    const boss = await captain();
    const rex = await sentIn(owner.id);
    const picture = await freePicture();

    expect(
      (
        await call(
          "mark_pet_in",
          { petId: rex.id, picture, hint: "Look by the fire" },
          owner.id,
        )
      ).error,
    ).toContain(PET_NOT_A_REVIEWER);

    const done = await call(
      "mark_pet_in",
      { petId: rex.id, picture, hint: "Look by the fire" },
      boss.id,
    );
    expect(done.error).toBeUndefined();
    expect(await petRow(rex.id)).toMatchObject({
      status: "in",
      moduleKey: picture,
      hint: "Look by the fire",
    });
    expect(await auditRows("pet.marked_in")).toHaveLength(1);
    const notices = await h
      .db()
      .select()
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.userId, owner.id));
    expect(notices).toHaveLength(1);

    expect(
      (
        await call(
          "mark_pet_in",
          { petId: rex.id, picture, hint: "Again" },
          boss.id,
        )
      ).error,
    ).toBe(PET_ALREADY_IN);
  });

  it("changes a hint at the text read, and an owner only on a pet with no photos", async () => {
    const owner = await member();
    const boss = await captain();
    const rex = await sentIn(owner.id);
    await h
      .db()
      .update(schema.pets)
      .set({ status: "in", moduleKey: "nipster", hint: "Old hint" })
      .where(eq(schema.pets.id, rex.id));

    expect(
      (
        await call(
          "set_pet_hint",
          { petId: rex.id, hint: "New hint", expected: "Other hint" },
          boss.id,
        )
      ).error,
    ).toMatch(/changed this pet first/);
    expect(
      (
        await call(
          "set_pet_hint",
          { petId: rex.id, hint: "New hint", expected: "Old hint" },
          boss.id,
        )
      ).error,
    ).toBeUndefined();
    expect((await petRow(rex.id)).hint).toBe("New hint");
    expect(await auditRows("pet.hint_changed")).toHaveLength(1);

    expect(
      (
        await call(
          "set_pet_owner",
          { petId: rex.id, ownerId: boss.id },
          boss.id,
        )
      ).error,
    ).toBe(PET_SENT_WITH_PHOTOS);

    const moda = await seeded();
    expect(
      (
        await call(
          "set_pet_owner",
          { petId: moda.id, ownerId: owner.id },
          boss.id,
        )
      ).error,
    ).toBeUndefined();
    expect((await petRow(moda.id)).ownerId).toBe(owner.id);
    expect(await auditRows("pet.owner_set")).toHaveLength(1);
  });
});
