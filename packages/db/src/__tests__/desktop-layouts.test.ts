import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  desktopFolderKey,
  desktopTeamFolderKey,
  type DesktopLayout,
} from "@camp404/types";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { sanitiseAccount } from "../account";
import {
  DesktopLayoutInvalidError,
  getDesktopLayout,
  saveDesktopLayout,
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
