import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  defaultDesktopPreferences,
  desktopFolderKey,
  desktopTeamFolderKey,
  type DesktopLayout,
} from "@camp404/types";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { sanitiseAccount } from "../account";
import {
  DesktopLayoutInvalidError,
  DesktopPreferencesInvalidError,
  getDesktopLayout,
  getDesktopPreferences,
  markWelcomeSeen,
  saveDesktopLayout,
  saveDesktopPreferences,
} from "../desktop-layouts";
import * as schema from "../schema";

// The per-member desktop layout (decision 14 B) against real Postgres: one row
// per member, replaced on each save, read back checked, and gone with an
// erased account.

const LAYOUT: DesktopLayout = {
  cells: {
    inbox: { c: 0, r: 1 },
    [desktopFolderKey("kitchen")]: { c: 2, r: 0 },
    [desktopTeamFolderKey("kitchen")]: { c: 11, r: 0 },
    "sc-1": { c: 3, r: 2 },
    "uf-1": { c: 4, r: 2 },
  },
  items: [
    { kind: "shortcut", id: "sc-1", target: "recipes" },
    { kind: "folder", id: "uf-1", name: "Daily", items: ["tasks", "inbox"] },
  ],
};

describe("desktop layouts", () => {
  const h = useTestDb();

  async function rowsFor(userId: string) {
    return h
      .db()
      .select()
      .from(schema.desktopLayouts)
      .where(eq(schema.desktopLayouts.userId, userId));
  }

  it("reads null before the member saves one", async () => {
    const member = await makeUser(h.db());
    expect(await getDesktopLayout(member.id)).toBeNull();
  });

  it("saves a layout and reads it back as saved", async () => {
    const member = await makeUser(h.db());
    await saveDesktopLayout(member.id, LAYOUT);
    expect(await getDesktopLayout(member.id)).toEqual(LAYOUT);
  });

  it("replaces the member's one row on the next save", async () => {
    const member = await makeUser(h.db());
    await saveDesktopLayout(member.id, LAYOUT);
    const moved: DesktopLayout = {
      cells: { inbox: { c: 5, r: 5 } },
      items: [],
    };
    await saveDesktopLayout(member.id, moved);
    expect(await getDesktopLayout(member.id)).toEqual(moved);
    expect(await rowsFor(member.id)).toHaveLength(1);
  });

  it("keeps each member's layout to themselves", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const other = await makeUser(db);
    await saveDesktopLayout(member.id, LAYOUT);
    expect(await getDesktopLayout(other.id)).toBeNull();
  });

  it("refuses a value that is not a layout, and writes nothing", async () => {
    const member = await makeUser(h.db());
    await expect(
      saveDesktopLayout(member.id, {
        cells: {},
        items: [{ kind: "shortcut", id: "sc-1", target: "https://evil" }],
      }),
    ).rejects.toBeInstanceOf(DesktopLayoutInvalidError);
    expect(await rowsFor(member.id)).toHaveLength(0);
  });

  it("stores the checked value: a folder name trimmed, unknown fields dropped", async () => {
    const member = await makeUser(h.db());
    await saveDesktopLayout(member.id, {
      cells: {},
      items: [
        {
          kind: "folder",
          id: "uf-1",
          name: "  Daily ",
          items: [],
          title: "Jane's ID",
        },
      ],
    });
    const [row] = await rowsFor(member.id);
    expect(row!.layout).toEqual({
      cells: {},
      items: [{ kind: "folder", id: "uf-1", name: "Daily", items: [] }],
    });
  });

  it("reads a stored value that is not a layout as null (the default)", async () => {
    const db = h.db();
    const member = await makeUser(db);
    // An older shape, or a hand edit: written past the checked writer.
    await db.insert(schema.desktopLayouts).values({
      userId: member.id,
      layout: { icons: ["inbox"] } as unknown as DesktopLayout,
    });
    expect(await getDesktopLayout(member.id)).toBeNull();
  });

  it("is deleted when the member erases their account", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const other = await makeUser(db);
    await saveDesktopLayout(member.id, LAYOUT);
    await saveDesktopLayout(other.id, LAYOUT);

    const result = await sanitiseAccount(member.id);
    expect(result.ok).toBe(true);

    expect(await rowsFor(member.id)).toHaveLength(0);
    expect(await getDesktopLayout(other.id)).toEqual(LAYOUT);
  });
});

// The member's display preferences (issues #289 and #290), on the same row.
describe("desktop preferences", () => {
  const h = useTestDb();

  async function rowsFor(userId: string) {
    return h
      .db()
      .select()
      .from(schema.desktopLayouts)
      .where(eq(schema.desktopLayouts.userId, userId));
  }

  it("reads the defaults before the member chooses anything", async () => {
    const member = await makeUser(h.db());
    expect(await getDesktopPreferences(member.id)).toEqual(
      defaultDesktopPreferences(),
    );
  });

  it("saves a choice before any layout, and the layout still reads as the default", async () => {
    const member = await makeUser(h.db());
    const saved = await saveDesktopPreferences(member.id, { theme: "calm" });
    expect(saved.theme).toBe("calm");
    expect(await getDesktopPreferences(member.id)).toMatchObject({
      theme: "calm",
      biggerText: false,
    });
    expect(await getDesktopLayout(member.id)).toEqual({ cells: {}, items: [] });
  });

  it("merges each change into the last, and a layout save keeps them", async () => {
    const member = await makeUser(h.db());
    await saveDesktopPreferences(member.id, { theme: "high-contrast" });
    await saveDesktopPreferences(member.id, { biggerText: true });
    const seenAt = new Date("2026-09-27T08:00:00.000Z");
    await markWelcomeSeen(member.id, seenAt);
    await saveDesktopLayout(member.id, LAYOUT);
    await saveDesktopPreferences(member.id, { oneClickOpen: true });
    expect(await getDesktopPreferences(member.id)).toEqual({
      theme: "high-contrast",
      biggerText: true,
      effectsOff: false,
      oneClickOpen: true,
      welcomeSeenAt: seenAt.toISOString(),
    });
    expect(await getDesktopLayout(member.id)).toEqual(LAYOUT);
    expect(await rowsFor(member.id)).toHaveLength(1);
  });

  it("refuses anything but the member's own choices, and writes nothing", async () => {
    const member = await makeUser(h.db());
    for (const bad of [
      { theme: "neon" },
      { welcomeSeenAt: "2026-09-27T08:00:00.000Z" },
      { biggerText: "yes" },
      {},
      null,
    ]) {
      await expect(
        saveDesktopPreferences(member.id, bad),
      ).rejects.toBeInstanceOf(DesktopPreferencesInvalidError);
    }
    expect(await rowsFor(member.id)).toHaveLength(0);
  });

  it("reads a bad stored field as its default, and a later change replaces a non-object", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await db.insert(schema.desktopLayouts).values({
      userId: member.id,
      layout: { cells: {}, items: [] },
      preferences: { theme: "neon", effectsOff: true } as never,
    });
    expect(await getDesktopPreferences(member.id)).toMatchObject({
      theme: "night",
      effectsOff: true,
    });
    await db
      .update(schema.desktopLayouts)
      .set({ preferences: "calm" as never })
      .where(eq(schema.desktopLayouts.userId, member.id));
    expect(await getDesktopPreferences(member.id)).toEqual(
      defaultDesktopPreferences(),
    );
    await saveDesktopPreferences(member.id, { effectsOff: true });
    const [row] = await rowsFor(member.id);
    expect(row!.preferences).toEqual({ effectsOff: true });
  });

  it("is deleted with the layout when the member erases their account", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const other = await makeUser(db);
    await saveDesktopPreferences(member.id, { theme: "calm" });
    await markWelcomeSeen(member.id);
    await saveDesktopPreferences(other.id, { theme: "calm" });

    const result = await sanitiseAccount(member.id);
    expect(result.ok).toBe(true);

    expect(await rowsFor(member.id)).toHaveLength(0);
    expect(await getDesktopPreferences(member.id)).toEqual(
      defaultDesktopPreferences(),
    );
    expect((await getDesktopPreferences(other.id)).theme).toBe("calm");
  });
});
