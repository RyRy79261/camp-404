import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { stillNeeded } from "@camp404/core";
import {
  EditInventoryItemInput,
  InventoryItemInput,
  InventoryLoanInput,
  InventoryNeedInput,
  InventoryProposalInput,
  type Team,
} from "@camp404/types";
import { sanitiseAccount } from "../account";
import type { CampConfig } from "../camp-config";
import {
  ALREADY_BOOKED,
  CUSTODIAN_UNKNOWN,
  FULLY_BOOKED,
  ITEM_CHANGED,
  LOAN_RETURNED,
  LOAN_TOO_MANY,
  NOT_AN_INVENTORY_EDITOR,
  NOT_BOOKABLE,
  NOT_YOUR_BOOKING,
  PROPOSAL_DECIDED,
  addInventoryItem,
  addInventoryNeed,
  archiveInventoryItem,
  bookInventoryItem,
  cancelInventoryBooking,
  getInventoryItem,
  lendInventoryItem,
  listBookableItems,
  listInventoryItems,
  listInventoryLoans,
  listInventoryNeeds,
  listItemBookings,
  listItemUpdates,
  listPendingProposals,
  pledgeToNeed,
  proposeInventoryChange,
  returnInventoryLoan,
  reviewInventoryChange,
  updateInventoryItem,
  withdrawPledge,
} from "../inventory";
import * as schema from "../schema";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// Inventory (#246) on a real Postgres (PGlite). What matters: a captain or a
// lead of the item's OWN team changes it, checked again inside each write; a
// lead of another team is refused; a proposal is approved once
// (compare-and-set on pending) with its audit row in the same transaction; a
// booking can't take an item past its limit, even when members press at once;
// needs, pledges, bookings and loans belong to the year they were written in.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

/** Put the camp in `year`, with the years before it closed. */
async function campYear(db: DB, year: number, earlier: number[] = []) {
  const cycles: CampConfig["cycles"] = [
    ...earlier.map((y) => ({
      year: y,
      startedAt: `${y}-01-01T00:00:00.000Z`,
      endedAt: `${y}-12-31T00:00:00.000Z`,
    })),
    { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
  ];
  await db
    .insert(schema.campSettings)
    .values({ id: true })
    .onConflictDoNothing({ target: schema.campSettings.id });
  const [row] = await db
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  await db
    .update(schema.campSettings)
    .set({ config: { ...row!.config, cycles } })
    .where(eq(schema.campSettings.id, true));
}

const COOLER = InventoryItemInput.parse({
  name: "Cooler box",
  team: "kitchen",
  category: "cooling",
  condition: "good",
  quantity: 4,
  location: "storage_unit",
  bookableCount: 2,
});

describe("inventory", () => {
  const h = useTestDb();

  async function leadOf(team: Team) {
    const user = await makeUser(h.db(), { approvalStatus: "approved" });
    await assignTeam({ userId: user.id, team });
    const led = await setLead({ userId: user.id, team, isLead: true });
    expect(led).toEqual({ ok: true, changed: true });
    return user;
  }

  async function people() {
    await campYear(h.db(), 2026);
    const captain = await makeUser(h.db(), {
      rank: "captain",
      approvalStatus: "approved",
    });
    const kitchenLead = await leadOf("kitchen");
    const soundLead = await leadOf("sound");
    const member = await makeUser(h.db(), { approvalStatus: "approved" });
    const other = await makeUser(h.db(), { approvalStatus: "approved" });
    return { captain, kitchenLead, soundLead, member, other };
  }

  async function cooler(actorId: string, item = COOLER) {
    const made = await addInventoryItem({ ...item, actorId });
    if (!made.ok) throw new Error(made.error);
    return made.id;
  }

  describe("who may change an item", () => {
    it("lets a captain add any team's gear and a lead only their own team's", async () => {
      const p = await people();
      expect(
        (await addInventoryItem({ ...COOLER, actorId: p.captain.id })).ok,
      ).toBe(true);
      expect(
        (await addInventoryItem({ ...COOLER, actorId: p.kitchenLead.id })).ok,
      ).toBe(true);
      expect(
        await addInventoryItem({ ...COOLER, actorId: p.soundLead.id }),
      ).toEqual({ ok: false, error: NOT_AN_INVENTORY_EDITOR });
      expect(
        await addInventoryItem({ ...COOLER, actorId: p.member.id }),
      ).toEqual({ ok: false, error: NOT_AN_INVENTORY_EDITOR });
      expect(await listInventoryItems()).toHaveLength(2);
      // Each add is in the change log as an approved change by its author.
      const [first] = await listInventoryItems();
      const log = await listItemUpdates(first!.id);
      expect(log.map((u) => [u.status, u.note])).toEqual([
        ["approved", "Added"],
      ]);
    });

    it("edits with a compare-and-set on the version, and refuses a lead of another team", async () => {
      const p = await people();
      const id = await cooler(p.kitchenLead.id);
      const edit = (
        actorId: string,
        expectedVersion: number,
        quantity: number,
      ) =>
        updateInventoryItem({
          ...EditInventoryItemInput.parse({
            ...COOLER,
            quantity,
            itemId: id,
            expectedVersion,
          }),
          actorId,
        });
      expect(await edit(p.soundLead.id, 1, 9)).toEqual({
        ok: false,
        error: NOT_AN_INVENTORY_EDITOR,
      });
      expect(await edit(p.kitchenLead.id, 1, 5)).toEqual({
        ok: true,
        version: 2,
      });
      // The second editor opened version 1 too.
      expect(await edit(p.captain.id, 1, 7)).toEqual({
        ok: false,
        error: ITEM_CHANGED,
      });
      expect((await getInventoryItem(id))?.quantity).toBe(5);
    });

    it("refuses moving an item to a team the lead does not lead", async () => {
      const p = await people();
      const id = await cooler(p.kitchenLead.id);
      const moved = await updateInventoryItem({
        ...EditInventoryItemInput.parse({
          ...COOLER,
          team: "sound",
          itemId: id,
          expectedVersion: 1,
        }),
        actorId: p.kitchenLead.id,
      });
      expect(moved).toEqual({ ok: false, error: NOT_AN_INVENTORY_EDITOR });
    });

    it("re-reads the lead flag inside the write, so a removed lead is refused", async () => {
      const p = await people();
      const id = await cooler(p.kitchenLead.id);
      await setLead({
        userId: p.kitchenLead.id,
        team: "kitchen",
        isLead: false,
      });
      expect(
        await archiveInventoryItem({
          actorId: p.kitchenLead.id,
          itemId: id,
          expectedVersion: 1,
        }),
      ).toEqual({ ok: false, error: NOT_AN_INVENTORY_EDITOR });
    });

    it("refuses a custodian who is not an approved member", async () => {
      const p = await people();
      const stranger = await makeUser(h.db(), { approvalStatus: "pending" });
      const made = await addInventoryItem({
        ...InventoryItemInput.parse({
          ...COOLER,
          location: "custodian_home",
          custodianUserId: stranger.id,
        }),
        actorId: p.captain.id,
      });
      expect(made).toEqual({ ok: false, error: CUSTODIAN_UNKNOWN });
    });

    it("archives an item off the list, keeping it readable by id", async () => {
      const p = await people();
      const id = await cooler(p.captain.id);
      expect(
        await archiveInventoryItem({
          actorId: p.captain.id,
          itemId: id,
          expectedVersion: 1,
        }),
      ).toEqual({ ok: true });
      expect(await listInventoryItems()).toEqual([]);
      expect((await getInventoryItem(id))?.archivedAt).not.toBeNull();
    });
  });

  describe("proposals", () => {
    async function proposed(p: Awaited<ReturnType<typeof people>>) {
      const id = await cooler(p.kitchenLead.id);
      const made = await proposeInventoryChange({
        ...InventoryProposalInput.parse({
          itemId: id,
          quantity: 3,
          condition: "needs_repair",
          location: "custodian_home",
          custodianUserId: p.member.id,
          maintenanceDone: true,
          note: "One lid cracked",
        }),
        actorId: p.member.id,
      });
      if (!made.ok) throw new Error(made.error);
      return { itemId: id, updateId: made.id };
    }

    it("lets any member propose, and leaves the item alone until reviewed", async () => {
      const p = await people();
      const { itemId } = await proposed(p);
      const pending = await listPendingProposals();
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({
        itemId,
        status: "pending",
        quantity: 3,
        proposedById: p.member.id,
      });
      expect((await getInventoryItem(itemId))?.quantity).toBe(4);
    });

    it("refuses a lead of another team, and approves for the item's own lead with an audit row", async () => {
      const p = await people();
      const { itemId, updateId } = await proposed(p);
      expect(
        await reviewInventoryChange({
          updateId,
          decision: "approved",
          actorId: p.soundLead.id,
        }),
      ).toEqual({ ok: false, error: NOT_AN_INVENTORY_EDITOR });

      expect(
        await reviewInventoryChange({
          updateId,
          decision: "approved",
          actorId: p.kitchenLead.id,
        }),
      ).toEqual({ ok: true });
      const item = await getInventoryItem(itemId);
      expect(item).toMatchObject({
        quantity: 3,
        condition: "needs_repair",
        location: "custodian_home",
        custodianUserId: p.member.id,
        custodianName: p.member.displayName,
        version: 2,
      });
      expect(item?.lastMaintainedAt).not.toBeNull();
      expect(await listPendingProposals()).toEqual([]);

      const audit = await h
        .db()
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.target, itemId));
      expect(audit.map((a) => [a.action, a.actorId])).toEqual([
        ["inventory.change_approved", p.kitchenLead.id],
      ]);
    });

    it("decides a proposal once: two reviewers at once, one wins and one is told", async () => {
      const p = await people();
      const { itemId, updateId } = await proposed(p);
      const results = await Promise.all([
        reviewInventoryChange({
          updateId,
          decision: "approved",
          actorId: p.kitchenLead.id,
        }),
        reviewInventoryChange({
          updateId,
          decision: "rejected",
          actorId: p.captain.id,
        }),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toEqual([
        { ok: false, error: PROPOSAL_DECIDED },
      ]);
      const audit = await h
        .db()
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.target, itemId));
      expect(audit).toHaveLength(1);
    });

    it("rejecting leaves the item as it was", async () => {
      const p = await people();
      const { itemId, updateId } = await proposed(p);
      expect(
        await reviewInventoryChange({
          updateId,
          decision: "rejected",
          reviewNote: "Counted 4 myself",
          actorId: p.captain.id,
        }),
      ).toEqual({ ok: true });
      expect(await getInventoryItem(itemId)).toMatchObject({
        quantity: 4,
        condition: "good",
        version: 1,
      });
      const [latest] = await listItemUpdates(itemId);
      expect(latest).toMatchObject({
        status: "rejected",
        reviewNote: "Counted 4 myself",
      });
    });
  });

  describe("bookings", () => {
    it("takes bookings up to the item's limit and refuses the next", async () => {
      const p = await people();
      const id = await cooler(p.captain.id);
      expect(
        (await bookInventoryItem({ itemId: id, actorId: p.member.id })).ok,
      ).toBe(true);
      expect(
        await bookInventoryItem({ itemId: id, actorId: p.member.id }),
      ).toEqual({ ok: false, error: ALREADY_BOOKED });
      expect(
        (await bookInventoryItem({ itemId: id, actorId: p.other.id })).ok,
      ).toBe(true);
      expect(
        await bookInventoryItem({ itemId: id, actorId: p.soundLead.id }),
      ).toEqual({ ok: false, error: FULLY_BOOKED });
      const [row] = await listBookableItems(p.member.id);
      expect(row).toMatchObject({ bookableCount: 2, booked: 2 });
      expect(row?.myBookingId).not.toBeNull();
    });

    it("never goes past the limit when members press at once", async () => {
      const p = await people();
      const id = await cooler(p.captain.id);
      const results = await Promise.all(
        [p.member, p.other, p.soundLead, p.kitchenLead].map((u) =>
          bookInventoryItem({ itemId: id, actorId: u.id }),
        ),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(2);
      const rows = await h
        .db()
        .select()
        .from(schema.inventoryBookings)
        .where(eq(schema.inventoryBookings.itemId, id));
      expect(rows).toHaveLength(2);
    });

    it("refuses an item that is not booked at all", async () => {
      const p = await people();
      const id = await cooler(
        p.captain.id,
        InventoryItemInput.parse({ ...COOLER, bookableCount: null }),
      );
      expect(
        await bookInventoryItem({ itemId: id, actorId: p.member.id }),
      ).toEqual({ ok: false, error: NOT_BOOKABLE });
    });

    it("names bookers only to an editor, and lets only them or the booker cancel", async () => {
      const p = await people();
      const id = await cooler(p.captain.id);
      const mine = await bookInventoryItem({
        itemId: id,
        actorId: p.member.id,
      });
      await bookInventoryItem({ itemId: id, actorId: p.other.id });
      if (!mine.ok) throw new Error(mine.error);

      const asMember = await listItemBookings(id, p.other.id, false);
      expect(asMember.map((b) => [b.displayName, b.mine])).toEqual([
        [null, false],
        [p.other.displayName, true],
      ]);
      const asLead = await listItemBookings(id, p.kitchenLead.id, true);
      expect(asLead.map((b) => b.displayName)).toEqual([
        p.member.displayName,
        p.other.displayName,
      ]);

      expect(
        await cancelInventoryBooking({
          bookingId: mine.id,
          actorId: p.other.id,
        }),
      ).toEqual({ ok: false, error: NOT_YOUR_BOOKING });
      expect(
        await cancelInventoryBooking({
          bookingId: mine.id,
          actorId: p.soundLead.id,
        }),
      ).toEqual({ ok: false, error: NOT_YOUR_BOOKING });
      expect(
        await cancelInventoryBooking({
          bookingId: mine.id,
          actorId: p.kitchenLead.id,
        }),
      ).toEqual({ ok: true });
      const audit = await h
        .db()
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, "inventory.booking_cancelled"));
      expect(audit.map((a) => [a.actorId, a.target])).toEqual([
        [p.kitchenLead.id, p.member.id],
      ]);
    });

    it("starts each year with no bookings", async () => {
      const p = await people();
      const id = await cooler(p.captain.id);
      await bookInventoryItem({ itemId: id, actorId: p.member.id });
      await campYear(h.db(), 2027, [2026]);
      const [row] = await listBookableItems(p.member.id);
      expect(row).toMatchObject({ booked: 0, myBookingId: null });
      expect(
        (await bookInventoryItem({ itemId: id, actorId: p.member.id })).ok,
      ).toBe(true);
    });
  });

  describe("needs and pledges", () => {
    it("adds up what is still needed, and only the team's leads keep the list", async () => {
      const p = await people();
      const id = await cooler(p.captain.id);
      const need = InventoryNeedInput.parse({
        team: "kitchen",
        name: "Cooler boxes",
        quantity: 10,
        itemId: id,
        boughtQuantity: 1,
      });
      expect(
        await addInventoryNeed({ ...need, actorId: p.soundLead.id }),
      ).toEqual({ ok: false, error: NOT_AN_INVENTORY_EDITOR });
      const made = await addInventoryNeed({
        ...need,
        actorId: p.kitchenLead.id,
      });
      if (!made.ok) throw new Error(made.error);

      expect(
        (
          await pledgeToNeed({
            needId: made.id,
            quantity: 2,
            actorId: p.member.id,
          })
        ).ok,
      ).toBe(true);
      // Pledging again changes the pledge, it doesn't add a second.
      await pledgeToNeed({
        needId: made.id,
        quantity: 3,
        actorId: p.member.id,
      });
      await pledgeToNeed({ needId: made.id, quantity: 1, actorId: p.other.id });

      const [row] = await listInventoryNeeds();
      expect(row).toMatchObject({ have: 4, boughtQuantity: 1 });
      expect(row!.pledges.map((x) => x.quantity)).toEqual([3, 1]);
      const pledged = row!.pledges.reduce((sum, x) => sum + x.quantity, 0);
      expect(
        stillNeeded({
          quantity: row!.quantity,
          have: row!.have,
          bought: row!.boughtQuantity,
          pledged,
        }),
      ).toBe(1);

      await withdrawPledge({ needId: made.id, actorId: p.other.id });
      const [after] = await listInventoryNeeds();
      expect(after!.pledges).toHaveLength(1);
    });

    it("belongs to its year", async () => {
      const p = await people();
      await addInventoryNeed({
        ...InventoryNeedInput.parse({
          team: "kitchen",
          name: "Chairs",
          quantity: 3,
        }),
        actorId: p.captain.id,
      });
      expect(await listInventoryNeeds()).toHaveLength(1);
      await campYear(h.db(), 2027, [2026]);
      expect(await listInventoryNeeds()).toEqual([]);
    });
  });

  describe("loans", () => {
    const loan = (itemId: string, quantity: number) =>
      InventoryLoanInput.parse({
        itemId,
        quantity,
        borrowerCamp: "Camp Next Door",
        borrowerAddress: "7:30 and C",
      });

    it("logs a loan by the item's lead, no more than the camp has, and returns it once", async () => {
      const p = await people();
      const id = await cooler(p.captain.id);
      expect(
        await lendInventoryItem({ ...loan(id, 1), actorId: p.member.id }),
      ).toEqual({ ok: false, error: NOT_AN_INVENTORY_EDITOR });
      expect(
        await lendInventoryItem({ ...loan(id, 1), actorId: p.soundLead.id }),
      ).toEqual({ ok: false, error: NOT_AN_INVENTORY_EDITOR });
      const lent = await lendInventoryItem({
        ...loan(id, 3),
        actorId: p.kitchenLead.id,
      });
      if (!lent.ok) throw new Error(lent.error);
      expect(
        await lendInventoryItem({ ...loan(id, 2), actorId: p.kitchenLead.id }),
      ).toEqual({ ok: false, error: LOAN_TOO_MANY });

      const [open] = await listInventoryLoans();
      expect(open).toMatchObject({
        borrowerCamp: "Camp Next Door",
        borrowerAddress: "7:30 and C",
        returnedAt: null,
      });
      expect(
        await returnInventoryLoan({ loanId: lent.id, actorId: p.captain.id }),
      ).toEqual({ ok: true });
      expect(
        await returnInventoryLoan({
          loanId: lent.id,
          actorId: p.kitchenLead.id,
        }),
      ).toEqual({ ok: false, error: LOAN_RETURNED });
    });

    it("keeps a loan still out in sight in a later year, but not one returned", async () => {
      const p = await people();
      const id = await cooler(p.captain.id);
      const out = await lendInventoryItem({
        ...loan(id, 1),
        actorId: p.kitchenLead.id,
      });
      const back = await lendInventoryItem({
        ...loan(id, 1),
        actorId: p.kitchenLead.id,
      });
      if (!out.ok || !back.ok) throw new Error("lend failed");
      await returnInventoryLoan({ loanId: back.id, actorId: p.captain.id });
      // Both were lent in another year than this one.
      await h
        .db()
        .update(schema.inventoryLoans)
        .set({ cycle: 2 })
        .where(eq(schema.inventoryLoans.itemId, id));
      const shown = await listInventoryLoans(id);
      expect(shown.map((l) => l.id)).toEqual([out.id]);
      // And it can still be marked returned from there.
      expect(
        await returnInventoryLoan({ loanId: out.id, actorId: p.captain.id }),
      ).toEqual({ ok: true });
    });

    it("has no column for a borrower's name or phone", () => {
      const columns = Object.keys(schema.inventoryLoans);
      expect(
        columns.filter((c) => /name|phone|person|contact/i.test(c)),
      ).toEqual([]);
    });
  });

  it("erasure deletes the member's bookings and pledges", async () => {
    const p = await people();
    const id = await cooler(p.captain.id);
    await bookInventoryItem({ itemId: id, actorId: p.member.id });
    const need = await addInventoryNeed({
      ...InventoryNeedInput.parse({
        team: "kitchen",
        name: "Chairs",
        quantity: 3,
      }),
      actorId: p.captain.id,
    });
    if (!need.ok) throw new Error(need.error);
    await pledgeToNeed({ needId: need.id, quantity: 1, actorId: p.member.id });
    await sanitiseAccount(p.member.id);
    const bookings = await h
      .db()
      .select()
      .from(schema.inventoryBookings)
      .where(eq(schema.inventoryBookings.userId, p.member.id));
    const pledges = await h
      .db()
      .select()
      .from(schema.inventoryPledges)
      .where(
        and(
          eq(schema.inventoryPledges.userId, p.member.id),
          eq(schema.inventoryPledges.needId, need.id),
        ),
      );
    expect([bookings.length, pledges.length]).toEqual([0, 0]);
  });
});
