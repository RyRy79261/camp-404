// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KitchenRecipe, type Team } from "@camp404/types";
import type { CampConfig } from "@camp404/db/camp-config";
import { NOT_AN_INVENTORY_EDITOR } from "@camp404/db/inventory";
import { PHASE_CHANGED } from "@camp404/db/logistics";
import { setMealPlan } from "@camp404/db/meal-plan";
import * as schema from "@camp404/db/schema";
import { assignTeam, setLead } from "@camp404/db/team-memberships";
import type * as GoogleCalendar from "@/lib/google-calendar";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import {
  makeUser,
  seedAcceptedVersion,
} from "../../../../../packages/db/src/__tests__/_factories";

// The tools the Notion import (#239) needs, and the Kitchen's reads, against
// real Postgres (PGlite) through the real tool handlers. Each is checked
// against what the website does for the same person (owner, 2026-10-04: "the
// SAME access as the signed-in person … the SAME WAY the website does"): who
// may, who is refused and in what words, the rows the page's write leaves
// behind (its audit and change log), and the compare-and-set.

// The camp's Google Calendar, as lib/logistics.ts reaches it: connected, with
// the event writes recorded instead of sent.
const calendar = vi.hoisted(() => ({
  put: [] as { id: string; summary: string }[],
}));
vi.mock("@/lib/google-calendar", async (importOriginal) => ({
  ...(await importOriginal<typeof GoogleCalendar>()),
  calendarConfig: () => ({
    calendarId: "camp@example.com",
    clientEmail: "bot@example.com",
    privateKey: "key",
  }),
  putCalendarEvent: vi.fn(
    async (_env: unknown, id: string, body: { summary: string }) => {
      calendar.put.push({ id, summary: body.summary });
    },
  ),
  deleteCalendarEvent: vi.fn(async () => true),
  forgetCalendarCache: vi.fn(),
}));

import { registerCampMcpTools } from "../server";

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
registerCampMcpTools({
  registerTool: (name: string, _config: unknown, handler: Handler) => {
    tools.set(name, handler);
  },
} as unknown as McpServer);

async function call(name: string, args: unknown, as: string) {
  const result = await tools.get(name)!(args, {
    authInfo: { clientId: "test", extra: { campUserId: as } },
  });
  const text = (result.content[0] as { text: string }).text;
  return result.isError
    ? { error: text }
    : { data: JSON.parse(text) as Record<string, unknown> };
}

// useTestDb is the PGlite harness (vitest hooks), not a React Hook.
// eslint-disable-next-line react-hooks/rules-of-hooks -- useTestDb is the PGlite harness, not a React Hook
const h = useTestDb();

beforeEach(() => {
  calendar.put.length = 0;
});

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

const STOVE = {
  name: "Two-burner stove",
  team: "kitchen",
  category: "kitchen",
  condition: "good",
  quantity: 2,
  location: "storage_unit",
  requiresMaintenance: false,
};

// --- Inventory ---------------------------------------------------------------

describe("inventory", () => {
  it("lets a lead add gear to the team they lead, logged as the page logs it", async () => {
    await campYear();
    const lead = await leadOf("kitchen");
    const { data, error } = await call("add_inventory_item", STOVE, lead.id);
    expect(error).toBeUndefined();
    const [item] = await h
      .db()
      .select()
      .from(schema.inventoryItems)
      .where(eq(schema.inventoryItems.id, data!.id as string));
    expect(item).toMatchObject({
      name: "Two-burner stove",
      team: "kitchen",
      quantity: 2,
      createdByUserId: lead.id,
    });
    // The item's history: "Added", by the lead, already approved.
    const log = await h
      .db()
      .select()
      .from(schema.inventoryUpdates)
      .where(eq(schema.inventoryUpdates.itemId, item!.id));
    expect(log).toEqual([
      expect.objectContaining({
        status: "approved",
        note: "Added",
        proposedByUserId: lead.id,
        reviewedByUserId: lead.id,
      }),
    ]);
  });

  it("lets a captain add gear to any team", async () => {
    await campYear();
    const boss = await captain();
    const { error } = await call(
      "add_inventory_item",
      { ...STOVE, team: "structures" },
      boss.id,
    );
    expect(error).toBeUndefined();
  });

  it("refuses a member at the gate and a lead of another team in the write, naming the page", async () => {
    await campYear();
    const plain = await member();
    const structures = await leadOf("structures");

    const asMember = await call("add_inventory_item", STOVE, plain.id);
    expect(asMember.error).toMatch(
      /^Only a captain or a lead of the item's team can add gear\./,
    );
    expect(asMember.error).toMatch(
      /On the website: https?:\/\/\S+\/inventory$/,
    );

    const asOtherLead = await call("add_inventory_item", STOVE, structures.id);
    expect(asOtherLead.error).toMatch(
      new RegExp(
        `^${NOT_AN_INVENTORY_EDITOR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} On the website: `,
      ),
    );
    expect(await h.db().select().from(schema.inventoryItems)).toEqual([]);
    expect(await h.db().select().from(schema.inventoryUpdates)).toEqual([]);
  });

  it("lists the gear to every member, and a suggested change only to whoever may decide it", async () => {
    await campYear();
    const lead = await leadOf("kitchen");
    const structures = await leadOf("structures");
    const plain = await member();
    const boss = await captain();
    const added = await call("add_inventory_item", STOVE, lead.id);
    const itemId = added.data!.id as string;

    const suggested = await call(
      "propose_inventory_change",
      {
        itemId,
        quantity: 1,
        condition: "needs_repair",
        location: "storage_unit",
        note: "One burner cracked",
      },
      plain.id,
    );
    expect(suggested.data).toMatchObject({ status: "pending" });
    const [pending] = await h
      .db()
      .select()
      .from(schema.inventoryUpdates)
      .where(eq(schema.inventoryUpdates.status, "pending"));
    expect(pending).toMatchObject({
      itemId,
      quantity: 1,
      proposedByUserId: plain.id,
      note: "One burner cracked",
    });
    // Nothing changes until it is decided on the page.
    const [item] = await h
      .db()
      .select({ quantity: schema.inventoryItems.quantity })
      .from(schema.inventoryItems)
      .where(eq(schema.inventoryItems.id, itemId));
    expect(item!.quantity).toBe(2);

    const reviewIds = async (as: string) => {
      const { data } = await call("list_inventory_items", {}, as);
      expect(data!.rows).toEqual([
        expect.objectContaining({ id: itemId, name: "Two-burner stove" }),
      ]);
      return (data!.toReview as { id: string }[]).map((r) => r.id);
    };
    expect(await reviewIds(plain.id)).toEqual([]);
    expect(await reviewIds(structures.id)).toEqual([]);
    expect(await reviewIds(lead.id)).toEqual([pending!.id]);
    expect(await reviewIds(boss.id)).toEqual([pending!.id]);

    const filtered = await call(
      "list_inventory_items",
      { team: "structures" },
      plain.id,
    );
    expect(filtered.data!.rows).toEqual([]);
  });
});

// --- Logistics ---------------------------------------------------------------

describe("logistics days", () => {
  const BUILD = {
    phase: "build",
    startDate: "2026-04-22",
    endDate: "2026-04-23",
    place: "Tankwa",
    expectedVersion: 0,
  };

  it("lists every phase to a member, with version 0 where none is set", async () => {
    await campYear();
    const plain = await member();
    const { data } = await call("list_logistics_days", {}, plain.id);
    const phases = data!.phases as { phase: string; version: number }[];
    expect(phases.map((p) => p.phase)).toEqual([
      "pack",
      "travel",
      "build",
      "burn",
      "strike",
      "unpack",
    ]);
    expect(phases.every((p) => p.version === 0)).toBe(true);
  });

  it("lets a Transport & Logistics lead set a phase as the page's Save does: audit, calendar, prep re-dated", async () => {
    await campYear();
    const tl = await leadOf("transport_and_logistics");
    const first = await call("set_logistics_days", BUILD, tl.id);
    expect(first.data).toMatchObject({ phase: "build", calendar: "synced" });
    expect(calendar.put).toEqual([
      expect.objectContaining({ summary: "Build" }),
    ]);
    expect(await auditRows("logistics.phase_set")).toEqual([
      expect.objectContaining({ actorId: tl.id }),
    ]);

    // A prep step on the meal plan's Day 1 follows Day 1 when it moves.
    const [recipe] = await h
      .db()
      .insert(schema.recipes)
      .values({ source: "text", title: "Oats" })
      .returning();
    const [menuItem] = await h
      .db()
      .insert(schema.kitchenMenuItems)
      .values({
        cycle: 2026,
        day: 1,
        meal: "breakfast",
        recipeId: recipe!.id,
        position: 0,
      })
      .returning();
    await h.db().insert(schema.kitchenPrepSteps).values({
      menuItemId: menuItem!.id,
      cycle: 2026,
      what: "Soak the oats",
      timing: "day_before",
      dueDate: "2026-04-21",
    });

    const { data: listed } = await call("list_logistics_days", {}, tl.id);
    const build = (
      listed!.phases as { phase: string; version: number; calendar: string }[]
    ).find((p) => p.phase === "build")!;
    expect(build).toMatchObject({ version: 1, calendar: "on" });

    const moved = await call(
      "set_logistics_days",
      {
        ...BUILD,
        startDate: "2026-04-24",
        endDate: "2026-04-25",
        expectedVersion: 1,
      },
      tl.id,
    );
    expect(moved.error).toBeUndefined();
    const [step] = await h.db().select().from(schema.kitchenPrepSteps);
    expect(step!.dueDate).toBe("2026-04-23");
  });

  it("refuses a member and a lead of another team, naming the page, and writes nothing", async () => {
    await campYear();
    const plain = await member();
    const kitchen = await leadOf("kitchen");
    for (const who of [plain, kitchen]) {
      const { error } = await call("set_logistics_days", BUILD, who.id);
      expect(error).toMatch(
        /^Only captains and Transport and Logistics leads can change the logistics days\. On the website: https?:\/\/\S+\/logistics$/,
      );
    }
    expect(await h.db().select().from(schema.logisticsPhases)).toEqual([]);
    expect(await auditRows("logistics.phase_set")).toEqual([]);
    expect(calendar.put).toEqual([]);
  });

  it("lets a captain set days too", async () => {
    await campYear();
    const boss = await captain();
    expect((await call("set_logistics_days", BUILD, boss.id)).error).toBe(
      undefined,
    );
  });

  it("refuses a save on a version someone else already moved past, and keeps theirs", async () => {
    await campYear();
    const tl = await leadOf("transport_and_logistics");
    const boss = await captain();
    expect((await call("set_logistics_days", BUILD, tl.id)).error).toBe(
      undefined,
    );
    // The captain saves on version 1 first.
    expect(
      (
        await call(
          "set_logistics_days",
          { ...BUILD, place: "Site", expectedVersion: 1 },
          boss.id,
        )
      ).error,
    ).toBeUndefined();
    // The lead's save, still on version 1, is refused.
    const stale = await call(
      "set_logistics_days",
      { ...BUILD, startDate: "2026-04-20", expectedVersion: 1 },
      tl.id,
    );
    expect(stale).toEqual({ error: PHASE_CHANGED });
    // A second "first save" of a phase that has a row is refused the same way.
    const again = await call("set_logistics_days", BUILD, tl.id);
    expect(again).toEqual({ error: PHASE_CHANGED });
    const [row] = await h.db().select().from(schema.logisticsPhases);
    expect(row).toMatchObject({
      startDate: "2026-04-22",
      place: "Site",
      version: 2,
    });
    expect(await auditRows("logistics.phase_set")).toHaveLength(2);
  });
});

// --- Recipes -----------------------------------------------------------------

const DAL = KitchenRecipe.parse({
  title: "Camp dal",
  plates: 50,
  ingredients: [
    { name: "Red lentils", category: "legume", quantity: 2.5, unit: "kg" },
    { name: "Onions", category: "produce", quantity: 1500, unit: "g" },
  ],
  steps: [{ instruction: "Simmer.", uses: ["Red lentils", "Onions"] }],
});

async function bookRecipe(authorId: string) {
  const [row] = await h
    .db()
    .insert(schema.recipes)
    .values({ source: "text", title: DAL.title, submitterId: authorId })
    .returning({ id: schema.recipes.id });
  const { versionId } = await seedAcceptedVersion(h.db(), {
    recipeId: row!.id,
    authorId,
    recipe: DAL,
  });
  return { recipeId: row!.id, versionId };
}

/** Text of a source section, flattened. */
function docText(doc: unknown): string {
  return JSON.stringify(doc);
}

describe("recipes", () => {
  it("takes a suggestion as sections, into the same sections, as suggested", async () => {
    await campYear();
    const plain = await member();
    const { data } = await call(
      "submit_recipe",
      {
        title: "Camp dal",
        sections: {
          ingredients: "- 2.5 kg red lentils\n- 1.5 kg onions",
          steps: "Fry the onions.\nSimmer the lentils.",
          notes: "Serves about 50.",
        },
      },
      plain.id,
    );
    expect(data).toMatchObject({ title: "Camp dal", status: "suggested" });
    const [recipe] = await h
      .db()
      .select()
      .from(schema.recipes)
      .where(eq(schema.recipes.id, data!.id as string));
    expect(recipe).toMatchObject({
      status: "suggested",
      submitterId: plain.id,
      aiConsentAt: null,
    });
    const [source] = await h
      .db()
      .select()
      .from(schema.recipeSources)
      .where(eq(schema.recipeSources.recipeId, recipe!.id));
    expect(docText(source!.ingredients)).toContain("2.5 kg red lentils");
    expect(docText(source!.ingredients)).not.toContain("Simmer");
    expect(docText(source!.steps)).toContain("Simmer the lentils.");
    expect(docText(source!.notes)).toContain("Serves about 50.");
    expect(docText(source!.steps)).not.toContain("Method");
    // Nothing is queued for Claude.
    expect(await h.db().select().from(schema.recipeProofreadRuns)).toEqual([]);
  });

  it("refuses text and sections together, and sections with nothing in them", async () => {
    const plain = await member();
    expect(
      await call(
        "submit_recipe",
        { text: "Oats", sections: { steps: "Soak." } },
        plain.id,
      ),
    ).toEqual({ error: "Give the recipe as text or as sections, not both." });
    expect(
      (await call("submit_recipe", { sections: {} }, plain.id)).error,
    ).toBe("Paste the recipe.");
    expect(await h.db().select().from(schema.recipes)).toEqual([]);
  });

  it("reads a recipe in the book to any member, at a plate count that has a result", async () => {
    await campYear();
    const boss = await captain();
    const plain = await member();
    const { recipeId, versionId } = await bookRecipe(boss.id);
    const { data } = await call("get_recipe", { recipeId }, plain.id);
    expect(data).toMatchObject({
      id: recipeId,
      inTheBook: true,
      versionId,
      writtenFor: 50,
      plates: 50,
      readyPlates: [50],
      askedPlatesNotReady: null,
    });
    expect(data!.amounts).toEqual([
      expect.objectContaining({ name: "Red lentils", quantity: 2.5 }),
      expect.objectContaining({ name: "Onions" }),
    ]);
    const asked = await call("get_recipe", { recipeId, plates: 80 }, plain.id);
    expect(asked.data).toMatchObject({ plates: 50, askedPlatesNotReady: 80 });
  });

  it("shows a suggestion only to its submitter and the Kitchen's reviewers", async () => {
    await campYear();
    const author = await member();
    const other = await member();
    const kitchen = await leadOf("kitchen");
    const structures = await leadOf("structures");
    const { data } = await call(
      "submit_recipe",
      { text: "Oats\nSoak overnight.", suitabilityNote: "Easy" },
      author.id,
    );
    const recipeId = data!.id as string;
    for (const who of [author, kitchen]) {
      expect(
        (await call("get_recipe", { recipeId }, who.id)).data,
      ).toMatchObject({
        inTheBook: false,
        status: "suggested",
        text: "Oats\nSoak overnight.",
        suitabilityNote: "Easy",
      });
    }
    for (const who of [other, structures]) {
      expect(await call("get_recipe", { recipeId }, who.id)).toEqual({
        error: "No recipe with that id.",
      });
    }
  });

  it("adds a cook's note to a recipe in the book, on the current version by default", async () => {
    await campYear();
    const boss = await captain();
    const plain = await member();
    const { recipeId, versionId } = await bookRecipe(boss.id);
    const { data } = await call(
      "add_recipe_lesson",
      { recipeId, body: "Double the onions next time." },
      plain.id,
    );
    expect(data).toMatchObject({ recipeId, versionId });
    expect(data!.url).toMatch(/\/versions\/1$/);
    const lessons = await h.db().select().from(schema.recipeLessons);
    expect(lessons).toEqual([
      expect.objectContaining({
        recipeId,
        versionId,
        authorId: plain.id,
        body: "Double the onions next time.",
        cycle: 2026,
      }),
    ]);
    const read = await call("get_recipe", { recipeId }, plain.id);
    expect(read.data!.lessons).toEqual([
      expect.objectContaining({
        version: 1,
        body: "Double the onions next time.",
      }),
    ]);
  });

  it("refuses a note on a recipe not in the book", async () => {
    await campYear();
    const author = await member();
    const { data } = await call("submit_recipe", { text: "Oats" }, author.id);
    const recipeId = data!.id as string;
    expect(
      (await call("add_recipe_lesson", { recipeId, body: "x" }, author.id))
        .error,
    ).toBe("This recipe is not in the book yet, so it has no version to note.");
    const other = await member();
    expect(
      await call("add_recipe_lesson", { recipeId, body: "x" }, other.id),
    ).toEqual({ error: "No recipe with that id." });
    expect(await h.db().select().from(schema.recipeLessons)).toEqual([]);
  });
});

// --- Kitchen reads -----------------------------------------------------------

describe("kitchen reads", () => {
  /** Two days of Build, 50 at dinner on both; the dal on day 1's dinner. */
  async function kitchenWithMenu() {
    await campYear();
    const boss = await captain();
    await h.db().insert(schema.logisticsPhases).values({
      cycle: 2026,
      phase: "build",
      startDate: "2026-04-22",
      endDate: "2026-04-23",
    });
    const saved = await setMealPlan({
      actorId: boss.id,
      firstDay: "2026-04-22",
      days: [
        { breakfast: 0, dinner: 50 },
        { breakfast: 30, dinner: 50 },
      ],
      expectedVersion: 0,
    });
    expect(saved.ok).toBe(true);
    const { recipeId } = await bookRecipe(boss.id);
    await h.db().insert(schema.kitchenMenuItems).values({
      cycle: 2026,
      day: 1,
      meal: "dinner",
      recipeId,
      position: 0,
    });
    return { boss, recipeId };
  }

  it("reads the meal plan to any member", async () => {
    const { recipeId } = await kitchenWithMenu();
    const plain = await member();
    const { data } = await call("get_meal_plan", {}, plain.id);
    expect(data).toMatchObject({ burn: 2026, firstDay: "2026-04-22" });
    const days = data!.days as {
      day: number;
      dinner: { plates: number; recipes: unknown[] };
    }[];
    expect(days[0]!.dinner).toEqual({
      plates: 50,
      recipes: [
        expect.objectContaining({
          recipeId,
          title: "Camp dal",
          verified: true,
        }),
      ],
    });
    expect(days[1]!.dinner.recipes).toEqual([]);
  });

  it("works the shopping list out from the menu, with prices only for those who keep them", async () => {
    await kitchenWithMenu();
    const plain = await member();
    const kitchen = await leadOf("kitchen");

    const lines = async (as: string) => {
      const { data } = await call("get_shopping_list", {}, as);
      return (data!.groups as { lines: Record<string, unknown>[] }[]).flatMap(
        (g) => g.lines,
      );
    };
    const forMember = await lines(plain.id);
    expect(forMember.map((l) => l.name).sort()).toEqual([
      "Onions",
      "Red lentils",
    ]);
    for (const line of forMember) {
      expect(line).not.toHaveProperty("priceCents");
      expect(line).not.toHaveProperty("shop");
    }
    for (const line of await lines(kitchen.id)) {
      expect(line).toHaveProperty("priceCents", null);
    }
  });

  it("gives the review queue to a captain and a Kitchen lead, and refuses anyone else", async () => {
    await campYear();
    const author = await member();
    const kitchen = await leadOf("kitchen");
    const structures = await leadOf("structures");
    const boss = await captain();
    const { data } = await call(
      "submit_recipe",
      { title: "Oats", text: "Oats\nSoak." },
      author.id,
    );
    for (const who of [kitchen, boss]) {
      const queue = await call("list_recipe_review_queue", {}, who.id);
      expect(queue.data!.suggestions).toEqual([
        expect.objectContaining({ id: data!.id, status: "suggested" }),
      ]);
    }
    for (const who of [author, structures]) {
      expect(
        (await call("list_recipe_review_queue", {}, who.id)).error,
      ).toMatch(
        /^Only a captain or a Kitchen lead can do this\. On the website: https?:\/\/\S+\/kitchen\/recipes\/review$/,
      );
    }
  });
});
