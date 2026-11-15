// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { FULLY_BOOKED } from "@camp404/core";
import type { Team } from "@camp404/types";
import type { CampConfig } from "@camp404/db/camp-config";
import {
  LOAN_RETURNED,
  NEED_CHANGED,
  NOT_AN_INVENTORY_EDITOR,
  PROPOSAL_DECIDED,
} from "@camp404/db/inventory";
import * as schema from "@camp404/db/schema";
import { assignTeam, setLead } from "@camp404/db/team-memberships";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import { makeUser } from "../../../../../packages/db/src/__tests__/_factories";
import { GATES } from "../gates";

vi.mock("next/server", () => ({ after: () => undefined }));

import { registerCampMcpTools } from "../server";

// The Inventory page's needs, pledges, bookings, loans and suggestion reviews
// against real Postgres (PGlite), through the real handlers: who may, who is
// refused and in what words, the rows (and audit rows) the page's write
// leaves, and the compare-and-set on what the caller read.

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
const onThePage = (sentence: string, path: string) =>
  new RegExp(`^${escape(sentence)} On the website: https?://\\S+${path}$`);

/** A camp with a Kitchen lead, a Power lead, a member and a Kitchen stove. */
async function gearCamp(bookableCount: number | null = null) {
  await campYear();
  const cook = await leadOf("kitchen");
  const sparky = await leadOf("structures");
  const plain = await member();
  const added = await call(
    "add_inventory_item",
    {
      name: "Two-burner stove",
      team: "kitchen",
      category: "kitchen",
      condition: "good",
      quantity: 2,
      location: "storage_unit",
      requiresMaintenance: false,
      bookableCount,
    },
    cook.id,
  );
  expect(added.error).toBeUndefined();
  return { cook, sparky, plain, itemId: added.data!.id as string };
}

describe("review_inventory_change", () => {
  it("lets the item's team lead approve a member's suggestion once, with the page's audit row", async () => {
    const g = await gearCamp();
    const proposed = await call(
      "propose_inventory_change",
      {
        itemId: g.itemId,
        quantity: 1,
        condition: "needs_repair",
        location: "storage_unit",
      },
      g.plain.id,
    );
    const updateId = proposed.data!.id as string;
    // A member never reaches it; a lead of another team is refused by the write.
    expect(
      (
        await call(
          "review_inventory_change",
          { updateId, decision: "approved" },
          g.plain.id,
        )
      ).error,
    ).toMatch(onThePage(GATES.inventoryEditor.refusal, "/inventory"));
    expect(
      (
        await call(
          "review_inventory_change",
          { updateId, decision: "approved" },
          g.sparky.id,
        )
      ).error,
    ).toBe(NOT_AN_INVENTORY_EDITOR);
    const ok = await call(
      "review_inventory_change",
      { updateId, decision: "approved" },
      g.cook.id,
    );
    expect(ok.error).toBeUndefined();
    expect(ok.data).toMatchObject({ item: "Two-burner stove" });
    const [item] = await h
      .db()
      .select()
      .from(schema.inventoryItems)
      .where(eq(schema.inventoryItems.id, g.itemId));
    expect(item).toMatchObject({ quantity: 1, condition: "needs_repair" });
    expect(
      (
        await call(
          "review_inventory_change",
          { updateId, decision: "rejected" },
          g.cook.id,
        )
      ).error,
    ).toBe(PROPOSAL_DECIDED);
    expect(await auditRows("inventory.change_approved")).toHaveLength(1);
  });
});

describe("needs and pledges", () => {
  it("adds a need, changes only the fields given on the version read, and refuses an old version", async () => {
    const g = await gearCamp();
    expect(
      (
        await call(
          "add_inventory_need",
          { team: "kitchen", name: "Chairs", quantity: 4 },
          g.sparky.id,
        )
      ).error,
    ).toBe(NOT_AN_INVENTORY_EDITOR);
    const added = await call(
      "add_inventory_need",
      { team: "kitchen", name: "Pots", quantity: 4, note: "Big ones" },
      g.cook.id,
    );
    const needId = added.data!.id as string;
    expect(
      (
        await call(
          "update_inventory_need",
          { needId, expectedVersion: 1, boughtQuantity: 2 },
          g.cook.id,
        )
      ).error,
    ).toBeUndefined();
    const [need] = await h.db().select().from(schema.inventoryNeeds);
    expect(need).toMatchObject({
      name: "Pots",
      quantity: 4,
      boughtQuantity: 2,
      note: "Big ones",
      version: 2,
    });
    expect(
      (
        await call(
          "update_inventory_need",
          { needId, expectedVersion: 1, quantity: 9 },
          g.cook.id,
        )
      ).error,
    ).toBe(NEED_CHANGED);
  });

  it("pledges and withdraws only the caller's own pledge", async () => {
    const g = await gearCamp();
    const added = await call(
      "add_inventory_need",
      { team: "kitchen", name: "Pots", quantity: 4 },
      g.cook.id,
    );
    const needId = added.data!.id as string;
    await call("pledge_to_need", { needId, quantity: 2 }, g.plain.id);
    await call("pledge_to_need", { needId, quantity: 1 }, g.cook.id);
    const list = await call("list_inventory_needs", {}, g.plain.id);
    expect(
      (list.data!.needs as { myPledge: unknown; pledged: number }[])[0],
    ).toMatchObject({ myPledge: { quantity: 2 }, pledged: 3 });
    expect(
      (await call("withdraw_my_pledge", { needId }, g.plain.id)).error,
    ).toBeUndefined();
    const left = await h.db().select().from(schema.inventoryPledges);
    expect(left.map((p) => p.userId)).toEqual([g.cook.id]);
    expect(
      (await call("withdraw_my_pledge", { needId }, g.plain.id)).error,
    ).toBe("You have no pledge on that need.");
  });
});

describe("bookings", () => {
  it("books the last one for one member only, and cancels only the caller's own", async () => {
    const g = await gearCamp(1);
    const other = await member();
    expect(
      (await call("book_inventory_item", { itemId: g.itemId }, g.plain.id))
        .error,
    ).toBeUndefined();
    expect(
      (await call("book_inventory_item", { itemId: g.itemId }, other.id)).error,
    ).toBe(FULLY_BOOKED);
    const listed = await call("list_bookable_gear", {}, g.plain.id);
    expect(listed.data!.items).toMatchObject([
      { itemId: g.itemId, myBooking: true, left: 0 },
    ]);
    // Another member, a lead of the item's team included, cancels nothing here.
    for (const who of [other, g.cook]) {
      expect(
        (await call("cancel_my_booking", { itemId: g.itemId }, who.id)).error,
      ).toBe("You have no booking of that item this year.");
    }
    expect(await h.db().select().from(schema.inventoryBookings)).toHaveLength(
      1,
    );
    expect(
      (await call("cancel_my_booking", { itemId: g.itemId }, g.plain.id)).error,
    ).toBeUndefined();
    expect(await h.db().select().from(schema.inventoryBookings)).toEqual([]);
    expect(await auditRows("inventory.booking_cancelled")).toEqual([]);
  });
});

describe("loans", () => {
  it("lets the item's team lead lend and mark it back once; a member is refused", async () => {
    const g = await gearCamp();
    const loan = {
      itemId: g.itemId,
      quantity: 1,
      borrowerCamp: "Camp Tea",
      borrowerAddress: "7:30 and C",
    };
    expect((await call("lend_inventory_item", loan, g.plain.id)).error).toMatch(
      onThePage(GATES.inventoryEditor.refusal, "/inventory/lent"),
    );
    expect((await call("lend_inventory_item", loan, g.sparky.id)).error).toBe(
      NOT_AN_INVENTORY_EDITOR,
    );
    expect(
      (await call("lend_inventory_item", { ...loan, quantity: 5 }, g.cook.id))
        .error,
    ).toBe("You can't lend more than the camp has.");
    const lent = await call("lend_inventory_item", loan, g.cook.id);
    const loanId = lent.data!.id as string;
    const listed = await call("list_inventory_loans", {}, g.plain.id);
    expect(listed.data!.loans).toMatchObject([
      { id: loanId, borrowerCamp: "Camp Tea", youMayMarkReturned: false },
    ]);
    expect(
      (await call("return_inventory_loan", { loanId }, g.cook.id)).error,
    ).toBeUndefined();
    const [row] = await h.db().select().from(schema.inventoryLoans);
    expect(row!.returnedAt).not.toBeNull();
    expect(
      (await call("return_inventory_loan", { loanId }, g.cook.id)).error,
    ).toBe(LOAN_RETURNED);
  });
});
