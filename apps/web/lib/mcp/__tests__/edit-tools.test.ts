// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { SHIFT_TYPE_CHANGED } from "@camp404/core";
import type { Team } from "@camp404/types";
import type { CampConfig } from "@camp404/db/camp-config";
import { ITEM_CHANGED, NOT_AN_INVENTORY_EDITOR } from "@camp404/db/inventory";
import { SOURCE_CHANGED } from "@camp404/db/recipes";
import * as schema from "@camp404/db/schema";
import { assignTeam, setLead } from "@camp404/db/team-memberships";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import { makeUser } from "../../../../../packages/db/src/__tests__/_factories";
import { SHIFTS_ACTION_REFUSAL } from "../../shifts-copy";
import { registerCampMcpTools } from "../server";

// The connector's edit tools (owner, 2026-10-26: the import's follow-up fixes
// had no tool), against real Postgres (PGlite) through the real handlers.
// Each is the website's own write for the same person: who may, who is
// refused and in what words, the rows the page's write leaves behind (its
// history or audit row), and the compare-and-set on what the caller read.

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
registerCampMcpTools({
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

/** The camp's year: 2026, so year-scoped rows have a cycle to land on. */
async function campYear(year = 2026) {
  const cycles: CampConfig["cycles"] = [
    { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
  ];
  await h
    .db()
    .insert(schema.campSettings)
    .values({ id: true })
    .onConflictDoNothing({ target: schema.campSettings.id });
  const [row] = await h
    .db()
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  await h
    .db()
    .update(schema.campSettings)
    .set({ config: { ...row!.config, cycles } })
    .where(eq(schema.campSettings.id, true));
}

const member = () => makeUser(h.db(), { approvalStatus: "approved" });
const captain = () =>
  makeUser(h.db(), { approvalStatus: "approved", rank: "captain" });

async function leadOf(team: Team) {
  const user = await member();
  await assignTeam({ userId: user.id, team });
  await setLead({ userId: user.id, team, isLead: true });
  return user;
}

async function auditRows(action: string) {
  return h
    .db()
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, action));
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// --- Inventory ---------------------------------------------------------------

const STOVE = {
  name: "Two-burner stove",
  team: "kitchen",
  category: "kitchen",
  condition: "good",
  quantity: 2,
  location: "storage_unit",
  storageLocation: "Shelf 1",
  details: "Blue, with a lid",
  requiresMaintenance: false,
};

async function itemRow(id: string) {
  const [row] = await h
    .db()
    .select()
    .from(schema.inventoryItems)
    .where(eq(schema.inventoryItems.id, id));
  return row!;
}

describe("update_inventory_item", () => {
  it("changes only the fields given, on the version read, logged as the page's Edit", async () => {
    await campYear();
    const lead = await leadOf("kitchen");
    const added = await call("add_inventory_item", STOVE, lead.id);
    const itemId = added.data!.id as string;

    const { data, error } = await call(
      "update_inventory_item",
      { itemId, expectedVersion: 1, quantity: 3, storageLocation: "Shelf 4" },
      lead.id,
    );
    expect(error).toBeUndefined();
    expect(data).toMatchObject({ id: itemId, version: 2 });
    expect(await itemRow(itemId)).toMatchObject({
      name: "Two-burner stove",
      details: "Blue, with a lid",
      quantity: 3,
      storageLocation: "Shelf 4",
      version: 2,
    });
    const log = await h
      .db()
      .select()
      .from(schema.inventoryUpdates)
      .where(eq(schema.inventoryUpdates.itemId, itemId));
    expect(log.map((r) => r.note).sort()).toEqual(["Added", "Edited"]);
    expect(log.find((r) => r.note === "Edited")).toMatchObject({
      status: "approved",
      proposedByUserId: lead.id,
    });

    // null clears a field that may be blank.
    const cleared = await call(
      "update_inventory_item",
      { itemId, expectedVersion: 2, details: null },
      lead.id,
    );
    expect(cleared.error).toBeUndefined();
    expect((await itemRow(itemId)).details).toBeNull();
  });

  it("refuses a member at the gate, and a lead of another team or a move to one in the write", async () => {
    await campYear();
    const lead = await leadOf("kitchen");
    const plain = await member();
    const structures = await leadOf("structures");
    const added = await call("add_inventory_item", STOVE, lead.id);
    const itemId = added.data!.id as string;

    const asMember = await call(
      "update_inventory_item",
      { itemId, expectedVersion: 1, quantity: 9 },
      plain.id,
    );
    expect(asMember.error).toMatch(
      /^Only a captain or a lead of the item's team can add or change gear\./,
    );
    expect(asMember.error).toMatch(
      /On the website: https?:\/\/\S+\/inventory$/,
    );

    const asOtherLead = await call(
      "update_inventory_item",
      { itemId, expectedVersion: 1, quantity: 9 },
      structures.id,
    );
    expect(asOtherLead.error).toMatch(
      new RegExp(`^${escape(NOT_AN_INVENTORY_EDITOR)} On the website: `),
    );
    const moved = await call(
      "update_inventory_item",
      { itemId, expectedVersion: 1, team: "structures" },
      lead.id,
    );
    expect(moved.error).toMatch(
      new RegExp(`^${escape(NOT_AN_INVENTORY_EDITOR)}`),
    );
    expect(await itemRow(itemId)).toMatchObject({
      quantity: 2,
      team: "kitchen",
      version: 1,
    });
  });

  it("lets a captain change any team's gear, and refuses a version someone moved past", async () => {
    await campYear();
    const lead = await leadOf("kitchen");
    const boss = await captain();
    const added = await call("add_inventory_item", STOVE, lead.id);
    const itemId = added.data!.id as string;
    expect(
      (
        await call(
          "update_inventory_item",
          { itemId, expectedVersion: 1, quantity: 5 },
          boss.id,
        )
      ).error,
    ).toBeUndefined();

    const stale = await call(
      "update_inventory_item",
      { itemId, expectedVersion: 1, quantity: 1 },
      lead.id,
    );
    expect(stale.error).toBe(ITEM_CHANGED);
    expect(await itemRow(itemId)).toMatchObject({ quantity: 5, version: 2 });
  });
});

// --- Recipes -----------------------------------------------------------------

async function suggested(by: string) {
  const { data } = await call(
    "submit_recipe",
    { text: "Dal\nLentils, salt. Simmer.", aiConsent: false },
    by,
  );
  return data!.id as string;
}

describe("retype_recipe_text", () => {
  it("retypes a suggestion as the recipe page does: next source version, audited, nothing sent to Claude", async () => {
    await campYear();
    const plain = await member();
    const lead = await leadOf("kitchen");
    const id = await suggested(plain.id);

    const read = await call("get_recipe", { recipeId: id }, lead.id);
    const before = read.data!.sourceVersion as number;
    expect(typeof before).toBe("number");
    // A member who may not retype is not given the version.
    const own = await call("get_recipe", { recipeId: id }, plain.id);
    expect(own.data!.sourceVersion).toBeUndefined();

    const { data, error } = await call(
      "retype_recipe_text",
      {
        recipeId: id,
        expectedSourceVersion: before,
        sections: {
          ingredients: "Red lentils 300 g\nSalt",
          steps: "Simmer 20 minutes.",
        },
      },
      lead.id,
    );
    expect(error).toBeUndefined();
    expect(data).toMatchObject({ id, sourceVersion: before + 1 });

    const [recipe] = await h
      .db()
      .select()
      .from(schema.recipes)
      .where(eq(schema.recipes.id, id));
    expect(recipe).toMatchObject({
      status: "suggested",
      title: "Dal",
      textAuthorId: lead.id,
    });
    expect(recipe!.rawText).toContain("Red lentils 300 g");
    const sources = await h
      .db()
      .select()
      .from(schema.recipeSources)
      .where(eq(schema.recipeSources.recipeId, id));
    expect(Math.max(...sources.map((s) => s.version))).toBe(before + 1);
    expect(sources.find((s) => s.version === before + 1)?.authorId).toBe(
      lead.id,
    );
    expect(await auditRows("recipe.text_retyped")).toEqual([
      expect.objectContaining({ actorId: lead.id, target: id }),
    ]);
    expect(await h.db().select().from(schema.recipeProofreadRuns)).toEqual([]);
  });

  it("refuses a member and a lead of another team at the gate, writing nothing", async () => {
    await campYear();
    const plain = await member();
    const structures = await leadOf("structures");
    const id = await suggested(plain.id);
    for (const as of [plain.id, structures.id]) {
      const { error } = await call(
        "retype_recipe_text",
        { recipeId: id, expectedSourceVersion: 1, text: "Mine now." },
        as,
      );
      expect(error).toMatch(/^Only a captain or a Kitchen lead can do this\./);
    }
    expect(await auditRows("recipe.text_retyped")).toEqual([]);
  });

  it("refuses a retype over a source someone changed since it was read", async () => {
    await campYear();
    const plain = await member();
    const lead = await leadOf("kitchen");
    const boss = await captain();
    const id = await suggested(plain.id);
    const read = await call("get_recipe", { recipeId: id }, lead.id);
    const before = read.data!.sourceVersion as number;

    expect(
      (
        await call(
          "retype_recipe_text",
          { recipeId: id, expectedSourceVersion: before, text: "Dal, v2." },
          boss.id,
        )
      ).error,
    ).toBeUndefined();
    const stale = await call(
      "retype_recipe_text",
      { recipeId: id, expectedSourceVersion: before, text: "Dal, lost." },
      lead.id,
    );
    expect(stale.error).toBe(SOURCE_CHANGED);
    const [recipe] = await h
      .db()
      .select({ rawText: schema.recipes.rawText })
      .from(schema.recipes)
      .where(eq(schema.recipes.id, id));
    expect(recipe!.rawText).toBe("Dal, v2.");
    expect(await auditRows("recipe.text_retyped")).toHaveLength(1);
  });
});

// --- Shifts ------------------------------------------------------------------

const DISHES = {
  team: "kitchen",
  name: "Dishes",
  startMinute: 18 * 60,
  durationMinutes: 90,
  places: 3,
  note: "Gloves in the blue box",
};

async function shiftRow(id: string) {
  const [row] = await h
    .db()
    .select()
    .from(schema.shiftTypes)
    .where(eq(schema.shiftTypes.id, id));
  return row!;
}

describe("create_shift_type and update_shift_type", () => {
  it("adds a shift for a lead's own team and changes only what is given, audited as the page's", async () => {
    await campYear();
    const lead = await leadOf("kitchen");
    const made = await call("create_shift_type", DISHES, lead.id);
    expect(made.error).toBeUndefined();
    const id = made.data!.id as string;
    expect(made.data).toMatchObject({ shift: "Dishes", version: 1 });
    expect(await auditRows("shifts.type_added")).toEqual([
      expect.objectContaining({ actorId: lead.id, target: `shift_type:${id}` }),
    ]);

    const listed = await call("list_shifts", {}, lead.id);
    expect(listed.data!.shiftTypes).toEqual([
      expect.objectContaining({ id, version: 1, youMayChange: true }),
    ]);

    const changed = await call(
      "update_shift_type",
      { id, expectedVersion: 1, places: 5 },
      lead.id,
    );
    expect(changed.error).toBeUndefined();
    expect(await shiftRow(id)).toMatchObject({
      name: "Dishes",
      startMinute: 18 * 60,
      durationMinutes: 90,
      places: 5,
      note: "Gloves in the blue box",
      version: 2,
    });
    expect(await auditRows("shifts.type_changed")).toEqual([
      expect.objectContaining({ actorId: lead.id, target: `shift_type:${id}` }),
    ]);
  });

  it("refuses a member at the gate and a lead of another team, writing nothing", async () => {
    await campYear();
    const lead = await leadOf("kitchen");
    const plain = await member();
    const structures = await leadOf("structures");

    const asMember = await call("create_shift_type", DISHES, plain.id);
    expect(asMember.error).toMatch(
      new RegExp(
        `^${escape(SHIFTS_ACTION_REFUSAL)} On the website: \\S+/shifts$`,
      ),
    );
    const asOtherLead = await call("create_shift_type", DISHES, structures.id);
    expect(asOtherLead.error).toMatch(
      new RegExp(`^${escape(SHIFTS_ACTION_REFUSAL)}`),
    );
    expect(await h.db().select().from(schema.shiftTypes)).toEqual([]);

    const made = await call("create_shift_type", DISHES, lead.id);
    const id = made.data!.id as string;
    const changeOther = await call(
      "update_shift_type",
      { id, expectedVersion: 1, places: 1 },
      structures.id,
    );
    expect(changeOther.error).toMatch(
      new RegExp(`^${escape(SHIFTS_ACTION_REFUSAL)}`),
    );
    const moveAway = await call(
      "update_shift_type",
      { id, expectedVersion: 1, team: "structures" },
      lead.id,
    );
    expect(moveAway.error).toMatch(
      new RegExp(`^${escape(SHIFTS_ACTION_REFUSAL)}`),
    );
    expect(await shiftRow(id)).toMatchObject({
      team: "kitchen",
      places: 3,
      version: 1,
    });
    expect(await auditRows("shifts.type_changed")).toEqual([]);
  });

  it("refuses a change on a version someone else moved past", async () => {
    await campYear();
    const lead = await leadOf("kitchen");
    const boss = await captain();
    const made = await call("create_shift_type", DISHES, lead.id);
    const id = made.data!.id as string;
    expect(
      (
        await call(
          "update_shift_type",
          { id, expectedVersion: 1, name: "Washing up" },
          boss.id,
        )
      ).error,
    ).toBeUndefined();
    const stale = await call(
      "update_shift_type",
      { id, expectedVersion: 1, places: 8 },
      lead.id,
    );
    expect(stale.error).toBe(SHIFT_TYPE_CHANGED);
    expect(await shiftRow(id)).toMatchObject({
      name: "Washing up",
      places: 3,
      version: 2,
    });
  });
});

// --- Survival Guide ----------------------------------------------------------

describe("keep_document_members_only", () => {
  async function chapter(boss: string) {
    const [row] = await h
      .db()
      .insert(schema.documents)
      .values({
        title: "Fire safety",
        slug: "fire-safety",
        category: "on_site",
        markdown: "Keep a bucket by the fire.",
        authorId: boss,
        published: true,
        publishedVersion: 1,
      })
      .returning({ slug: schema.documents.slug });
    return row!.slug;
  }
  const membersOnly = async (slug: string) =>
    (
      await h
        .db()
        .select({ membersOnly: schema.documents.membersOnly })
        .from(schema.documents)
        .where(eq(schema.documents.slug, slug))
    )[0]!.membersOnly;

  it("lets a captain keep a chapter members only, audited, and never the other way", async () => {
    await campYear();
    const boss = await captain();
    const slug = await chapter(boss.id);
    expect(await membersOnly(slug)).toBe(false);

    // Even a call that asks for false only ever sets the mark.
    const { data, error } = await call(
      "keep_document_members_only",
      { slug, membersOnly: false },
      boss.id,
    );
    expect(error).toBeUndefined();
    expect(data).toEqual({ slug, membersOnly: true });
    expect(await membersOnly(slug)).toBe(true);
    const rows = await auditRows("document.members_only_set");
    expect(rows).toEqual([
      expect.objectContaining({ actorId: boss.id, target: slug }),
    ]);
    expect(rows[0]!.metadata).toMatchObject({ membersOnly: true });

    // Again: nothing to change, so no second row.
    await call("keep_document_members_only", { slug }, boss.id);
    expect(await auditRows("document.members_only_set")).toHaveLength(1);
  });

  it("refuses a team lead and a member at the gate, naming the page", async () => {
    await campYear();
    const boss = await captain();
    const lead = await leadOf("kitchen");
    const plain = await member();
    const slug = await chapter(boss.id);
    for (const as of [lead.id, plain.id]) {
      const { error } = await call("keep_document_members_only", { slug }, as);
      expect(error).toMatch(
        /^Only a captain can do this\. On the website: \S+\/guide$/,
      );
    }
    expect(await membersOnly(slug)).toBe(false);
    expect(
      await h
        .db()
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.action, "document.members_only_set"),
            eq(schema.auditLog.target, slug),
          ),
        ),
    ).toEqual([]);
  });
});
