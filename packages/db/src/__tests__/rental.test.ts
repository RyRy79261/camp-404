import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  campStockInUse,
  FINANCE_TEAM,
  GEAR_ORDER_ACTION_KEY,
  GEAR_ORDER_ACTION_TITLE,
  GEAR_ORDER_REF_TYPE,
  noPriceFrom,
  notEnoughCampStock,
  hostedElsewhere,
  RENTAL_ITEM_GONE,
  RENTAL_NOT_A_TENT,
  RENTAL_PICK_A_TENT,
  RENTAL_PICK_EVERY_SOURCE,
  tooManySharers,
  type AuditAction,
} from "@camp404/core";
import type {
  ParticipationStatus,
  RentalItemInput,
  Team,
} from "@camp404/types";
import { sanitiseAccount } from "../account";
import { getPendingRequiredActions } from "../activations";
import type { CampConfig } from "../camp-config";
import { UNSET_CYCLE } from "../camp-config";
import { setFoundingYear } from "../cycle-rollover";
import { getMemberDues } from "../dues";
import {
  addRentalItem,
  archiveRentalItem,
  askForGearOrders,
  confirmRentalOrder,
  editRentalItem,
  fillRentalOrderFor,
  getMyRental,
  getRentalOrderOf,
  getRentalOverview,
  listRentalItems,
  listRentalOrders,
  listRentalSharerChoices,
  listRentalUnanswered,
  NOT_A_RENTAL_MANAGER,
  RENTAL_NO_SUCH_MEMBER,
  RENTAL_NOTHING_TO_SEND,
  RENTAL_ORDER_CHANGED,
  RENTAL_ORDER_CONFIRMED,
  RENTAL_ORDER_MOVED,
  RENTAL_ORDER_SENT,
  RENTAL_REOPEN_FIRST,
  RENTAL_SHARER_GONE,
  RENTAL_TENT_NOT_CONFIRMED,
  reopenRentalOrder,
  saveRentalOrder,
  setTentLabel,
  withdrawRentalOrder,
} from "../rental";
import * as schema from "../schema";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// Gear rental (#241) on a real Postgres (PGlite): only a captain runs it
// (re-checked inside each write), a member reads and writes only their own
// order, the tent is asked once and a captain picks the actual tent, two
// orders can never disagree about who is in whose tent, the confirmation is a
// compare-and-set on `submitted` that writes the charge and the audit row in
// one transaction, camp stock cannot be given out twice, and the summary's
// totals are the sum of the confirmed orders. Prices are made up.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;
const YEAR = 2027;

const CONFIRMED: AuditAction = "rental.order_confirmed";
const REOPENED: AuditAction = "rental.order_reopened";
const ITEM_ADDED: AuditAction = "rental.item_added";
const LABELLED: AuditAction = "rental.tent_labelled";
const ASKED: AuditAction = "rental.orders_asked";
const FILLED: AuditAction = "rental.order_filled";

async function campYear(db: DB, year: number) {
  const cycles: CampConfig["cycles"] = [
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

async function auditActions(db: DB): Promise<string[]> {
  const rows = await db
    .select({ action: schema.auditLog.action })
    .from(schema.auditLog);
  return rows.map((r) => r.action);
}

/** A member's place this year. "applied" is the member's own Yes. */
async function place(db: DB, userId: string, status: ParticipationStatus) {
  await db.insert(schema.campParticipations).values({
    userId,
    cycle: YEAR,
    status,
    intent:
      status === "not_attending" ? "no" : status === "maybe" ? "maybe" : "yes",
  });
}

const TENT: RentalItemInput = {
  name: "2-person tent",
  isTent: true,
  sleeps: 2,
  campPriceCents: 10_000,
  campStockCount: 2,
  supplierPriceCents: 25_000,
  reserveCount: 0,
  reserveSource: "supplier",
};
const BIG_TENT: RentalItemInput = {
  name: "4-person tent",
  isTent: true,
  sleeps: 4,
  campPriceCents: null,
  campStockCount: null,
  supplierPriceCents: 70_000,
  reserveCount: 0,
  reserveSource: "supplier",
};
const MATTRESS: RentalItemInput = {
  name: "Mattress",
  isTent: false,
  sleeps: 1,
  campPriceCents: null,
  campStockCount: null,
  supplierPriceCents: 8_000,
  reserveCount: 0,
  reserveSource: "supplier",
};

describe("gear rental", () => {
  const h = useTestDb();

  async function leadOf(team: Team) {
    const user = await makeUser(h.db());
    await assignTeam({ userId: user.id, team });
    expect(await setLead({ userId: user.id, team, isLead: true })).toEqual({
      ok: true,
      changed: true,
    });
    return user;
  }

  async function camp(year = YEAR) {
    if (year !== UNSET_CYCLE) await campYear(h.db(), year);
    const captain = await makeUser(h.db(), { rank: "captain" });
    const member = await makeUser(h.db(), { displayName: "Dee Member" });
    const friend = await makeUser(h.db(), { displayName: "Fay Friend" });
    const add = async (item: RentalItemInput) => {
      const res = await addRentalItem({
        cycle: year,
        item,
        actorId: captain.id,
      });
      if (!res.ok) throw new Error(res.error);
      return res.id;
    };
    const tent = await add(TENT);
    const bigTent = await add(BIG_TENT);
    const mattress = await add(MATTRESS);
    return { captain, member, friend, tent, bigTent, mattress, year };
  }

  /**
   * The member sends an order: a tent for them and whoever shares it (they
   * pick no tent), and two mattresses.
   */
  async function sent(
    c: Awaited<ReturnType<typeof camp>>,
    userId = c.member.id,
    sharerIds: string[] = [c.friend.id],
  ) {
    const res = await saveRentalOrder({
      userId,
      cycle: c.year,
      tent: { choice: "need", people: sharerIds.length + 1, sharerIds },
      lines: [{ itemId: c.mattress, choice: "need", quantity: 2 }],
      submit: true,
      expectedVersion: 0,
    });
    if (!res.ok) throw new Error(res.error);
    const order = (await getRentalOrderOf(userId, c.year))!;
    const mattressLine = order.lines.find((l) => l.itemId === c.mattress)!.id;
    return {
      order,
      mattressLine,
      /** The captain's pick: the 2-person tent from `source`, supplier mattresses. */
      pick: (source: "camp" | "supplier", itemId = c.tent) => ({
        tent: { itemId, source },
        sources: [{ lineId: mattressLine, source: "supplier" as const }],
      }),
    };
  }

  /** Confirm a sent order with the 2-person tent from `source`. */
  async function confirmed(
    c: Awaited<ReturnType<typeof camp>>,
    s: Awaited<ReturnType<typeof sent>>,
    source: "camp" | "supplier",
    itemId = c.tent,
  ) {
    return confirmRentalOrder({
      orderId: s.order.id,
      expectedVersion: s.order.version,
      ...s.pick(source, itemId),
      actorId: c.captain.id,
    });
  }

  describe("who may run it", () => {
    it("lets a captain set the catalogue, and records it", async () => {
      const c = await camp();
      expect((await listRentalItems(YEAR)).map((i) => i.name)).toEqual([
        "2-person tent",
        "4-person tent",
        "Mattress",
      ]);
      expect(await auditActions(h.db())).toEqual([
        ITEM_ADDED,
        ITEM_ADDED,
        ITEM_ADDED,
      ]);
      expect(
        await editRentalItem({
          itemId: c.mattress,
          item: { ...MATTRESS, supplierPriceCents: 9_000 },
          actorId: c.captain.id,
        }),
      ).toEqual({ ok: true });
      expect(
        (await listRentalItems(YEAR)).find((i) => i.id === c.mattress)
          ?.supplierPriceCents,
      ).toBe(9_000);
    });

    it("refuses a Finance lead, a lead of another team and a member inside every write", async () => {
      const c = await camp();
      const s = await sent(c);
      const other = await makeUser(h.db());
      const done = await sent(c, other.id, []);
      await confirmed(c, done, "supplier");
      const doneOrder = (await getRentalOrderOf(other.id, YEAR))!;
      const financeLead = await leadOf(FINANCE_TEAM as Team);
      const kitchenLead = await leadOf("kitchen");
      const refused = { ok: false, error: NOT_A_RENTAL_MANAGER };
      for (const actor of [financeLead, kitchenLead, c.member]) {
        const actorId = actor.id;
        expect(
          await addRentalItem({ cycle: YEAR, item: MATTRESS, actorId }),
        ).toEqual(refused);
        expect(
          await editRentalItem({ itemId: c.tent, item: TENT, actorId }),
        ).toEqual(refused);
        expect(await archiveRentalItem({ itemId: c.tent, actorId })).toEqual(
          refused,
        );
        expect(
          await confirmRentalOrder({
            orderId: s.order.id,
            expectedVersion: s.order.version,
            ...s.pick("camp"),
            actorId,
          }),
        ).toEqual(refused);
        expect(
          await reopenRentalOrder({
            orderId: doneOrder.id,
            expectedVersion: doneOrder.version,
            actorId,
          }),
        ).toEqual(refused);
        expect(
          await setTentLabel({
            lineId: doneOrder.tent!.assigned!.id,
            label: "T1",
            actorId,
          }),
        ).toEqual(refused);
      }
      expect(await listRentalItems(YEAR)).toHaveLength(3);
      expect((await getRentalOrderOf(c.member.id, YEAR))?.status).toBe(
        "submitted",
      );
      expect((await getRentalOrderOf(other.id, YEAR))?.status).toBe(
        "confirmed",
      );
      expect(await h.db().select().from(schema.duesCharges)).toHaveLength(1);
    });
  });

  describe("a member's own order", () => {
    it("saves a draft, sends it, and only a draft can change", async () => {
      const c = await camp();
      const draft = await saveRentalOrder({
        userId: c.member.id,
        cycle: YEAR,
        tent: { choice: "own", sharerIds: [] },
        lines: [],
        submit: false,
        expectedVersion: 0,
      });
      expect(draft).toEqual({ ok: true, version: 1, status: "draft" });
      const order = {
        tent: {
          choice: "need" as const,
          people: 2,
          sharerIds: [c.friend.id],
        },
        lines: [],
      };
      // A stale version is refused, never an overwrite.
      expect(
        await saveRentalOrder({
          userId: c.member.id,
          cycle: YEAR,
          ...order,
          submit: true,
          expectedVersion: 0,
        }),
      ).toEqual({ ok: false, error: RENTAL_ORDER_CHANGED });
      expect(
        await saveRentalOrder({
          userId: c.member.id,
          cycle: YEAR,
          ...order,
          submit: true,
          expectedVersion: 1,
        }),
      ).toEqual({ ok: true, version: 2, status: "submitted" });
      const mine = await getMyRental(c.member.id, YEAR);
      expect(mine.order?.status).toBe("submitted");
      // One tent answer, no catalogue tent, and no place shown for a sharer.
      expect(mine.order?.tent).toEqual({
        choice: "need",
        people: 2,
        ownDescription: null,
        ownSleeps: null,
        sharers: [{ id: c.friend.id, name: "Fay Friend", accepted: null }],
        assigned: null,
      });
      expect(mine.order?.lines).toEqual([]);
      // Sent: it is taken back before it changes.
      expect(
        await saveRentalOrder({
          userId: c.member.id,
          cycle: YEAR,
          tent: null,
          lines: [],
          submit: false,
          expectedVersion: 2,
        }),
      ).toEqual({ ok: false, error: RENTAL_ORDER_SENT });
      expect(
        await withdrawRentalOrder({
          userId: c.member.id,
          cycle: YEAR,
          expectedVersion: 2,
        }),
      ).toEqual({ ok: true, version: 3 });
      expect((await getMyRental(c.member.id, YEAR)).order?.status).toBe(
        "draft",
      );
    });

    it("never takes a catalogue tent from a member: the tent is one answer, not a line", async () => {
      const c = await camp();
      expect(
        await saveRentalOrder({
          userId: c.member.id,
          cycle: YEAR,
          tent: null,
          lines: [{ itemId: c.tent, choice: "need", quantity: 1 }],
          submit: true,
          expectedVersion: 0,
        }),
      ).toEqual({ ok: false, error: RENTAL_ITEM_GONE });
      expect(await h.db().select().from(schema.rentalOrders)).toEqual([]);
    });

    it("refuses an empty order, a stranger as a sharer, too many sharers and an item off the list", async () => {
      const c = await camp();
      const base = { userId: c.member.id, cycle: YEAR, expectedVersion: 0 };
      expect(
        await saveRentalOrder({ ...base, tent: null, lines: [], submit: true }),
      ).toEqual({ ok: false, error: RENTAL_NOTHING_TO_SEND });
      const pending = await makeUser(h.db(), { approvalStatus: "pending" });
      expect(
        await saveRentalOrder({
          ...base,
          tent: { choice: "need", people: 2, sharerIds: [pending.id] },
          lines: [],
          submit: false,
        }),
      ).toEqual({ ok: false, error: RENTAL_SHARER_GONE });
      expect(
        await saveRentalOrder({
          ...base,
          tent: { choice: "need", people: 1, sharerIds: [c.friend.id] },
          lines: [],
          submit: false,
        }),
      ).toEqual({ ok: false, error: tooManySharers(0) });
      await archiveRentalItem({ itemId: c.mattress, actorId: c.captain.id });
      expect(
        await saveRentalOrder({
          ...base,
          tent: null,
          lines: [{ itemId: c.mattress, choice: "need", quantity: 1 }],
          submit: false,
        }),
      ).toEqual({ ok: false, error: RENTAL_ITEM_GONE });
      expect(await h.db().select().from(schema.rentalOrders)).toEqual([]);
    });

    it("shows a member only their own order, and a sharer only the tent they are in", async () => {
      const c = await camp();
      const other = await makeUser(h.db(), { displayName: "Otto Other" });
      const s = await sent(c);
      // Someone who is not on the order reads nothing of it.
      const theirs = await getMyRental(other.id, YEAR);
      expect(theirs.order).toBeNull();
      expect(theirs.sharedWithMe).toEqual([]);
      // The friend reads whose tent it is, not the mattresses or any price.
      const friends = await getMyRental(c.friend.id, YEAR);
      expect(friends.order).toBeNull();
      expect(friends.sharedWithMe).toEqual([
        {
          orderId: s.order.id,
          tentName: "A camp tent",
          tentLabel: null,
          confirmed: false,
          ownerName: "Dee Member",
          otherSharers: [],
        },
      ]);
      // The picker offers every approved member but yourself, by name only.
      expect(await listRentalSharerChoices(c.member.id)).toEqual(
        expect.arrayContaining([{ id: c.friend.id, name: "Fay Friend" }]),
      );
      expect(
        (await listRentalSharerChoices(c.member.id)).map((m) => m.id),
      ).not.toContain(c.member.id);
    });

    it("does not show a sharer a tent on a draft", async () => {
      const c = await camp();
      await saveRentalOrder({
        userId: c.member.id,
        cycle: YEAR,
        tent: { choice: "need", people: 2, sharerIds: [c.friend.id] },
        lines: [],
        submit: false,
        expectedVersion: 0,
      });
      expect((await getMyRental(c.friend.id, YEAR)).sharedWithMe).toEqual([]);
    });
  });

  describe("who is in whose tent", () => {
    const send = (
      userId: string,
      tent: Parameters<typeof saveRentalOrder>[0]["tent"],
      expectedVersion = 0,
      submit = true,
    ) =>
      saveRentalOrder({
        userId,
        cycle: YEAR,
        tent,
        lines: [],
        submit,
        expectedVersion,
      });

    it("lets the member in someone's tent say so, and nothing that disagrees", async () => {
      const c = await camp();
      await sent(c); // Dee needs a tent, with Fay in it.
      // Fay cannot also have her own, or need one.
      for (const tent of [
        { choice: "own" as const, sharerIds: [] },
        { choice: "need" as const, people: 1, sharerIds: [] },
      ]) {
        expect(await send(c.friend.id, tent)).toEqual({
          ok: false,
          error: hostedElsewhere("Dee Member"),
        });
      }
      expect(await h.db().select().from(schema.rentalOrders)).toHaveLength(1);
      // "I'm in someone else's tent" agrees, and names nobody itself.
      expect(await send(c.friend.id, { choice: "shared" })).toMatchObject({
        ok: true,
      });
      const fays = (await getRentalOrderOf(c.friend.id, YEAR))!;
      expect(fays.tent).toMatchObject({ choice: "shared", sharers: [] });
      expect(fays.hostedBy).toEqual(["Dee Member"]);
    });

    it("refuses a sharer who has their own tent answer, or is in another tent", async () => {
      const c = await camp();
      const sam = await makeUser(h.db(), { displayName: "Sam Second" });
      // Fay has her own tent, sent.
      await send(c.friend.id, { choice: "own", sharerIds: [] });
      expect(
        await send(c.member.id, {
          choice: "need",
          people: 2,
          sharerIds: [c.friend.id],
        }),
      ).toMatchObject({
        ok: false,
        error: expect.stringContaining(
          "Fay Friend says they have their own tent or need one.",
        ),
      });
      // Sam is in Dee's tent; a third member cannot take him too.
      expect(
        await send(c.member.id, {
          choice: "need",
          people: 2,
          sharerIds: [sam.id],
        }),
      ).toMatchObject({ ok: true });
      const otto = await makeUser(h.db(), { displayName: "Otto Other" });
      expect(
        await send(otto.id, {
          choice: "own",
          ownSleeps: 2,
          sharerIds: [sam.id],
        }),
      ).toEqual({
        ok: false,
        error: "Sam Second is already in someone else's tent.",
      });
    });

    it("checks a draft only when it is sent, and a captain's fill-in the same way", async () => {
      const c = await camp();
      // Fay drafts "I need one", then Dee sends an order with Fay in her tent.
      expect(
        await send(
          c.friend.id,
          { choice: "need", people: 1, sharerIds: [] },
          0,
          false,
        ),
      ).toMatchObject({ ok: true });
      await sent(c);
      // Fay's draft now disagrees: it cannot be sent, by her or by a captain.
      expect(
        await send(
          c.friend.id,
          { choice: "need", people: 1, sharerIds: [] },
          1,
        ),
      ).toEqual({ ok: false, error: hostedElsewhere("Dee Member") });
      expect(
        await fillRentalOrderFor({
          userId: c.friend.id,
          cycle: YEAR,
          tent: { choice: "own", sharerIds: [] },
          lines: [],
          expectedVersion: 1,
          actorId: c.captain.id,
        }),
      ).toEqual({ ok: false, error: hostedElsewhere("Dee Member") });
      expect(await send(c.friend.id, { choice: "shared" }, 1)).toMatchObject({
        ok: true,
      });
    });

    it("lets someone say they share a tent before anyone has put them in one", async () => {
      const c = await camp();
      expect(await send(c.friend.id, { choice: "shared" })).toMatchObject({
        ok: true,
      });
      const order = (await getRentalOrderOf(c.friend.id, YEAR))!;
      expect(order.tent?.choice).toBe("shared");
      // Nobody has: the captain is shown that, rather than a guess.
      expect(order.hostedBy).toEqual([]);
      // Dee then adds her, and the two orders agree.
      await sent(c);
      expect((await getRentalOrderOf(c.friend.id, YEAR))?.hostedBy).toEqual([
        "Dee Member",
      ]);
    });
  });

  describe("confirming", () => {
    it("takes the captain's tent and sources, charges the member's dues and writes the audit row", async () => {
      const c = await camp();
      const s = await sent(c);
      // One camp 2-person tent and two supplier mattresses.
      expect(await confirmed(c, s, "camp")).toEqual({
        ok: true,
        totalCents: 26_000,
        chargeId: expect.any(String),
      });
      const charges = await h.db().select().from(schema.duesCharges);
      expect(charges).toMatchObject([
        {
          userId: c.member.id,
          cycle: YEAR,
          kind: "rental",
          amountCents: 26_000,
          currency: "ZAR",
          description: "Gear rental: 1 × 2-person tent, 2 × Mattress",
          createdByUserId: c.captain.id,
          cancelledAt: null,
        },
      ]);
      const audit = await h
        .db()
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, CONFIRMED));
      expect(audit).toMatchObject([
        {
          actorId: c.captain.id,
          target: c.member.id,
          metadata: {
            cycle: YEAR,
            totalCents: 26_000,
            fromCamp: 1,
            fromSupplier: 2,
          },
        },
      ]);
      // The member sees it on their dues, and the tent a captain picked.
      const dues = await getMemberDues(c.member.id, YEAR, {
        forFinance: false,
      });
      expect(dues?.balance.balanceCents).toBe(26_000);
      const mine = await getMyRental(c.member.id, YEAR);
      expect(mine.order).toMatchObject({
        status: "confirmed",
        totalCents: 26_000,
        chargeId: charges[0]!.id,
      });
      expect(mine.order?.tent?.assigned).toMatchObject({
        itemName: "2-person tent",
        source: "camp",
        unitPriceCents: 10_000,
        quantity: 1,
      });
      expect(
        mine.order?.lines.map((l) => [l.itemName, l.source, l.unitPriceCents]),
      ).toEqual([["Mattress", "supplier", 8_000]]);
    });

    it("prices the tent the captain picked, from the source they picked", async () => {
      const c = await camp();
      const s = await sent(c);
      // The 4-person tent, which only the supplier has.
      expect(await confirmed(c, s, "supplier", c.bigTent)).toMatchObject({
        ok: true,
        totalCents: 70_000 + 16_000,
      });
      const order = (await getRentalOrderOf(c.member.id, YEAR))!;
      expect(order.tent?.assigned).toMatchObject({
        itemName: "4-person tent",
        sleeps: 4,
        source: "supplier",
        unitPriceCents: 70_000,
      });
      // The tent is not among the member's own lines.
      expect(order.lines.map((l) => l.itemName)).toEqual(["Mattress"]);
    });

    it("needs a tent picked for a member who needs one, and refuses a pick that is not a tent or has no such source", async () => {
      const c = await camp();
      const s = await sent(c);
      const base = {
        orderId: s.order.id,
        expectedVersion: s.order.version,
        actorId: c.captain.id,
      };
      const sources = s.pick("camp").sources;
      expect(await confirmRentalOrder({ ...base, sources })).toEqual({
        ok: false,
        error: RENTAL_PICK_A_TENT,
      });
      expect(
        await confirmRentalOrder({
          ...base,
          tent: { itemId: c.mattress, source: "supplier" },
          sources,
        }),
      ).toEqual({ ok: false, error: RENTAL_NOT_A_TENT });
      // The 4-person tent has no camp stock.
      expect(
        await confirmRentalOrder({ ...base, ...s.pick("camp", c.bigTent) }),
      ).toEqual({ ok: false, error: noPriceFrom("4-person tent", "camp") });
      // Refused whole each time: still sent, no tent line, nothing charged.
      const after = (await getRentalOrderOf(c.member.id, YEAR))!;
      expect(after).toMatchObject({ status: "submitted" });
      expect(after.tent?.assigned).toBeNull();
      expect(await h.db().select().from(schema.rentalOrderLines)).toHaveLength(
        1,
      );
      expect(await h.db().select().from(schema.duesCharges)).toEqual([]);
    });

    it("lets a captain pick a tent that sleeps fewer than it is for: a warning on screen, not a refusal", async () => {
      const c = await camp();
      const sam = await makeUser(h.db(), { displayName: "Sam Second" });
      // A tent for three people.
      const s = await sent(c, c.member.id, [c.friend.id, sam.id]);
      expect(s.order.tent?.people).toBe(3);
      expect((await confirmed(c, s, "camp")).ok).toBe(true);
      expect((await getRentalOverview(YEAR)).tents).toMatchObject([
        { itemName: "2-person tent", sleeps: 2, people: 3 },
      ]);
    });

    it("is a compare-and-set on submitted: a draft, a second confirm and a changed order are refused", async () => {
      const c = await camp();
      const s = await sent(c);
      const moved = { ok: false, error: RENTAL_ORDER_MOVED };
      // The member takes it back and sends it again: the captain's page is stale.
      await withdrawRentalOrder({
        userId: c.member.id,
        cycle: YEAR,
        expectedVersion: s.order.version,
      });
      const confirm = (expectedVersion: number) =>
        confirmRentalOrder({
          orderId: s.order.id,
          expectedVersion,
          ...s.pick("camp"),
          actorId: c.captain.id,
        });
      // A draft is not confirmed, at the old version or the new one.
      expect(await confirm(s.order.version)).toEqual(moved);
      expect(await confirm(s.order.version + 1)).toEqual(moved);
      const again = await saveRentalOrder({
        userId: c.member.id,
        cycle: YEAR,
        tent: { choice: "own", sharerIds: [] },
        lines: [{ itemId: c.mattress, choice: "need", quantity: 1 }],
        submit: true,
        expectedVersion: s.order.version + 1,
      });
      expect(again.ok).toBe(true);
      // Sent again, but not the order the captain saw.
      expect(await confirm(s.order.version)).toEqual(moved);
      expect(await h.db().select().from(schema.duesCharges)).toEqual([]);

      const fresh = (await getRentalOrderOf(c.member.id, YEAR))!;
      const go = (tent?: { itemId: string; source: "camp" }) =>
        confirmRentalOrder({
          orderId: fresh.id,
          expectedVersion: fresh.version,
          tent,
          sources: [{ lineId: fresh.lines[0]!.id, source: "supplier" }],
          actorId: c.captain.id,
        });
      // They have their own tent now: a tent picked for them is a stale page.
      expect(await go({ itemId: c.tent, source: "camp" })).toEqual(moved);
      expect((await go()).ok).toBe(true);
      // A second captain pressing Confirm on the same page charges nothing more.
      expect(await go()).toEqual(moved);
      expect(await h.db().select().from(schema.duesCharges)).toHaveLength(1);
      expect(
        (await auditActions(h.db())).filter((a) => a === CONFIRMED),
      ).toHaveLength(1);
    });

    it("writes nothing when a source is missing or the item has no camp stock", async () => {
      const c = await camp();
      const s = await sent(c);
      const base = {
        orderId: s.order.id,
        expectedVersion: s.order.version,
        tent: { itemId: c.tent, source: "camp" as const },
        actorId: c.captain.id,
      };
      expect(await confirmRentalOrder({ ...base, sources: [] })).toEqual({
        ok: false,
        error: RENTAL_PICK_EVERY_SOURCE,
      });
      expect(
        await confirmRentalOrder({
          ...base,
          sources: [{ lineId: s.mattressLine, source: "camp" }],
        }),
      ).toEqual({ ok: false, error: noPriceFrom("Mattress", "camp") });
      expect((await getRentalOrderOf(c.member.id, YEAR))?.status).toBe(
        "submitted",
      );
      expect(await h.db().select().from(schema.duesCharges)).toEqual([]);
      expect(await auditActions(h.db())).not.toContain(CONFIRMED);
    });

    it("keeps the charge and the audit row in one transaction: no audit row, no charge", async () => {
      const c = await camp();
      const s = await sent(c);
      // The audit insert fails: everything the confirmation wrote goes with it.
      await h.client().exec(`
        create function refuse_audit() returns trigger as $$
        begin raise exception 'audit is down'; end; $$ language plpgsql;
        create trigger refuse_audit before insert on audit_log
          for each row execute function refuse_audit();
      `);
      try {
        await expect(confirmed(c, s, "camp")).rejects.toThrow();
      } finally {
        await h.client().exec(`
          drop trigger refuse_audit on audit_log;
          drop function refuse_audit();
        `);
      }
      expect(await h.db().select().from(schema.duesCharges)).toEqual([]);
      const after = (await getRentalOrderOf(c.member.id, YEAR))!;
      expect(after).toMatchObject({
        status: "submitted",
        version: s.order.version,
        totalCents: null,
        chargeId: null,
      });
      expect(after.tent?.assigned).toBeNull();
      expect(after.lines.every((l) => l.source === null)).toBe(true);
    });

    it("confirms a member with their own tent and bedding with nothing to pay", async () => {
      const c = await camp();
      await saveRentalOrder({
        userId: c.member.id,
        cycle: YEAR,
        tent: { choice: "own", ownDescription: "Dome", sharerIds: [] },
        lines: [{ itemId: c.mattress, choice: "own", quantity: 1 }],
        submit: true,
        expectedVersion: 0,
      });
      const order = (await getRentalOrderOf(c.member.id, YEAR))!;
      expect(
        await confirmRentalOrder({
          orderId: order.id,
          expectedVersion: order.version,
          sources: [],
          actorId: c.captain.id,
        }),
      ).toEqual({ ok: true, totalCents: 0, chargeId: null });
      expect(await h.db().select().from(schema.duesCharges)).toEqual([]);
    });

    it("keeps a confirmed order at the price it was confirmed at", async () => {
      const c = await camp();
      const s = await sent(c);
      await confirmed(c, s, "supplier");
      await editRentalItem({
        itemId: c.tent,
        item: { ...TENT, supplierPriceCents: 99_000 },
        actorId: c.captain.id,
      });
      const after = (await getRentalOrderOf(c.member.id, YEAR))!;
      expect(after.totalCents).toBe(41_000);
      expect(after.tent?.assigned?.unitPriceCents).toBe(25_000);
    });
  });

  describe("camp stock", () => {
    it("refuses to give out more than the camp has, across orders", async () => {
      const c = await camp();
      // The camp has 2 tents. Two members get them.
      const second = await makeUser(h.db(), { displayName: "Sam Second" });
      const third = await makeUser(h.db(), { displayName: "Tia Third" });
      for (const who of [c.member, second]) {
        const s = await sent(c, who.id, []);
        expect((await confirmed(c, s, "camp")).ok).toBe(true);
      }
      const last = await sent(c, third.id, []);
      expect(await confirmed(c, last, "camp")).toEqual({
        ok: false,
        error: notEnoughCampStock("2-person tent", 2, 0),
      });
      // Refused whole: still sent, and nothing charged.
      expect((await getRentalOrderOf(third.id, YEAR))?.status).toBe(
        "submitted",
      );
      expect(await h.db().select().from(schema.duesCharges)).toHaveLength(2);
      // The supplier has no such limit.
      expect((await confirmed(c, last, "supplier")).ok).toBe(true);
    });

    it("counts a camp reserve against the stock, and frees stock on reopen", async () => {
      const c = await camp();
      // One of the two tents is kept back for the site.
      expect(
        await editRentalItem({
          itemId: c.tent,
          item: { ...TENT, reserveCount: 1, reserveSource: "camp" },
          actorId: c.captain.id,
        }),
      ).toEqual({ ok: true });
      const first = await sent(c, c.member.id, []);
      await confirmed(c, first, "camp");
      const second = await sent(c, c.friend.id, []);
      expect(await confirmed(c, second, "camp")).toEqual({
        ok: false,
        error: notEnoughCampStock("2-person tent", 2, 0),
      });
      // The first order is reopened: its tent is free again.
      const done = (await getRentalOrderOf(c.member.id, YEAR))!;
      await reopenRentalOrder({
        orderId: done.id,
        expectedVersion: done.version,
        actorId: c.captain.id,
      });
      expect((await confirmed(c, second, "camp")).ok).toBe(true);
    });

    it("refuses a catalogue change that leaves fewer than are given out", async () => {
      const c = await camp();
      const s = await sent(c);
      await confirmed(c, s, "camp");
      const edit = (item: RentalItemInput) =>
        editRentalItem({ itemId: c.tent, item, actorId: c.captain.id });
      // One is out: the camp cannot have none, and cannot reserve both.
      expect(
        await edit({ ...TENT, campPriceCents: null, campStockCount: null }),
      ).toEqual({ ok: false, error: campStockInUse("2-person tent", 1) });
      expect(
        await edit({ ...TENT, reserveCount: 2, reserveSource: "camp" }),
      ).toEqual({ ok: false, error: campStockInUse("2-person tent", 3) });
      expect(await edit({ ...TENT, campStockCount: 1 })).toEqual({ ok: true });
      expect(
        (await listRentalItems(YEAR)).find((i) => i.id === c.tent)
          ?.campStockCount,
      ).toBe(1);
    });
  });

  describe("reopening", () => {
    it("cancels the charge in the same write, and is a compare-and-set on confirmed", async () => {
      const c = await camp();
      const s = await sent(c);
      // A sent order is not reopened.
      expect(
        await reopenRentalOrder({
          orderId: s.order.id,
          expectedVersion: s.order.version,
          actorId: c.captain.id,
        }),
      ).toEqual({ ok: false, error: RENTAL_ORDER_MOVED });
      await confirmed(c, s, "camp");
      // Confirmed: the member cannot change it themselves.
      expect(
        await withdrawRentalOrder({
          userId: c.member.id,
          cycle: YEAR,
          expectedVersion: s.order.version + 1,
        }),
      ).toEqual({ ok: false, error: RENTAL_ORDER_CONFIRMED });
      const reopen = () =>
        reopenRentalOrder({
          orderId: s.order.id,
          expectedVersion: s.order.version + 1,
          actorId: c.captain.id,
        });
      expect(await reopen()).toEqual({ ok: true });
      expect(await reopen()).toEqual({ ok: false, error: RENTAL_ORDER_MOVED });
      const [charge] = await h.db().select().from(schema.duesCharges);
      expect(charge?.cancelledAt).not.toBeNull();
      expect(charge?.cancelledByUserId).toBe(c.captain.id);
      expect(
        (await getMemberDues(c.member.id, YEAR, { forFinance: false }))?.balance
          .balanceCents,
      ).toBe(0);
      const reopened = (await getRentalOrderOf(c.member.id, YEAR))!;
      expect(reopened).toMatchObject({
        status: "submitted",
        totalCents: null,
        chargeId: null,
      });
      // The captain's last pick is kept, to confirm again without redoing it.
      expect(reopened.tent?.assigned).toMatchObject({
        itemName: "2-person tent",
        source: "camp",
      });
      expect(
        (await auditActions(h.db())).filter((a) => a === REOPENED),
      ).toHaveLength(1);
      // A reopened order is not counted, though its lines still name a source:
      // the tent is a need again, not an assigned tent.
      expect(await getRentalOverview(YEAR)).toMatchObject({
        waiting: 1,
        confirmed: 0,
        tents: [],
        unassigned: [{ ownerName: "Dee Member", people: 2 }],
        summary: { chargedCents: 0, fromStorage: 0, toOrder: 0 },
      });
      // A reopened order shows the member no tent, source or price.
      const mine = await getMyRental(c.member.id, YEAR);
      expect(mine.order?.tent?.assigned).toBeNull();
      expect(mine.order?.lines.every((l) => l.source === null)).toBe(true);
    });

    it("drops the captain's tent when the member changes their answer", async () => {
      const c = await camp();
      const s = await sent(c);
      await confirmed(c, s, "camp");
      await reopenRentalOrder({
        orderId: s.order.id,
        expectedVersion: s.order.version + 1,
        actorId: c.captain.id,
      });
      await withdrawRentalOrder({
        userId: c.member.id,
        cycle: YEAR,
        expectedVersion: s.order.version + 2,
      });
      await saveRentalOrder({
        userId: c.member.id,
        cycle: YEAR,
        tent: { choice: "own", sharerIds: [] },
        lines: [],
        submit: true,
        expectedVersion: s.order.version + 3,
      });
      expect(await h.db().select().from(schema.rentalOrderLines)).toEqual([]);
      expect((await getRentalOrderOf(c.member.id, YEAR))?.tent).toMatchObject({
        choice: "own",
        assigned: null,
        sharers: [],
      });
    });
  });

  describe("the captains' summary", () => {
    it("totals the tents captains picked and the rest by source, and they match the sum of the orders", async () => {
      const c = await camp();
      await editRentalItem({
        itemId: c.mattress,
        item: { ...MATTRESS, reserveCount: 3 },
        actorId: c.captain.id,
      });
      const second = await makeUser(h.db(), { displayName: "Sam Second" });
      const waiting = await makeUser(h.db(), { displayName: "Wes Waiting" });
      const a = await sent(c);
      const b = await sent(c, second.id, []);
      await sent(c, waiting.id, []);
      await confirmed(c, a, "camp");
      await confirmed(c, b, "supplier", c.bigTent);
      const overview = await getRentalOverview(YEAR);
      expect(overview.waiting).toBe(1);
      expect(overview.confirmed).toBe(2);
      // Counted as the tent each captain picked, from the source they picked.
      expect(overview.summary.rows).toMatchObject([
        {
          name: "2-person tent",
          campCount: 1,
          supplierCount: 0,
          fromStorage: 1,
          toOrder: 0,
          campStockCount: 2,
          campStockLeft: 1,
        },
        {
          name: "4-person tent",
          campCount: 0,
          supplierCount: 1,
          fromStorage: 0,
          toOrder: 1,
          campStockCount: null,
        },
        {
          name: "Mattress",
          campCount: 0,
          supplierCount: 4,
          reserveCount: 3,
          fromStorage: 0,
          toOrder: 7,
          campStockCount: null,
          campStockLeft: null,
        },
      ]);
      // A tent need that is only sent is in no total: it is not assigned yet.
      expect(overview.unassigned).toEqual([
        {
          orderId: expect.any(String),
          userId: waiting.id,
          ownerName: "Wes Waiting",
          people: 1,
          sharers: [],
        },
      ]);
      // The totals are the sum of what the confirmed orders were charged.
      const orders = await listRentalOrders(YEAR);
      const charged = orders
        .filter((o) => o.status === "confirmed")
        .reduce((n, o) => n + (o.totalCents ?? 0), 0);
      expect(charged).toBe(26_000 + 86_000);
      expect(overview.summary.chargedCents).toBe(charged);
      expect(overview.summary.supplierCents).toBe(16_000 + 86_000);
      expect(overview.summary.campCents).toBe(10_000);
      const ledger = await h.db().select().from(schema.duesCharges);
      expect(ledger.reduce((n, l) => n + l.amountCents, 0)).toBe(charged);
      // Sent orders come first on the captains' list.
      expect(orders.map((o) => o.memberName)).toEqual([
        "Wes Waiting",
        "Dee Member",
        "Sam Second",
      ]);
    });
  });

  describe("tent labels", () => {
    it("labels the tent a captain picked, for the member and the sharer, and keeps it across a reopen", async () => {
      const c = await camp();
      const s = await sent(c);
      const label = (lineId: string) =>
        setTentLabel({ lineId, label: "T3", actorId: c.captain.id });
      // Nothing to label before a captain has picked a tent.
      expect(await label(s.mattressLine)).toEqual({
        ok: false,
        error: RENTAL_TENT_NOT_CONFIRMED,
      });
      await confirmed(c, s, "camp");
      const tentLine = (await getRentalOrderOf(c.member.id, YEAR))!.tent!
        .assigned!.id;
      expect(await label(s.mattressLine)).toEqual({
        ok: false,
        error: RENTAL_TENT_NOT_CONFIRMED,
      });
      expect(await label(tentLine)).toEqual({ ok: true });
      expect(await auditActions(h.db())).toContain(LABELLED);
      const mine = await getMyRental(c.member.id, YEAR);
      expect(mine.order?.tent?.assigned?.tentLabel).toBe("T3");
      expect((await getMyRental(c.friend.id, YEAR)).sharedWithMe).toMatchObject(
        [
          {
            tentName: "2-person tent",
            tentLabel: "T3",
            confirmed: true,
            ownerName: "Dee Member",
          },
        ],
      );
      expect((await getRentalOverview(YEAR)).tents).toEqual([
        {
          lineId: tentLine,
          itemName: "2-person tent",
          sleeps: 2,
          people: 2,
          tentLabel: "T3",
          source: "camp",
          ownerName: "Dee Member",
          sharers: ["Fay Friend"],
        },
      ]);
      // Reopened and confirmed again with the same tent: the label stays.
      const done = (await getRentalOrderOf(c.member.id, YEAR))!;
      await reopenRentalOrder({
        orderId: done.id,
        expectedVersion: done.version,
        actorId: c.captain.id,
      });
      await confirmRentalOrder({
        orderId: done.id,
        expectedVersion: done.version + 1,
        ...s.pick("supplier"),
        actorId: c.captain.id,
      });
      expect((await getRentalOverview(YEAR)).tents).toMatchObject([
        { itemName: "2-person tent", tentLabel: "T3", source: "supplier" },
      ]);
    });
  });

  describe("Ask everyone", () => {
    /** Who is coming, who is not, and who has already answered. */
    async function crowd() {
      const c = await camp();
      const named = (displayName: string) => makeUser(h.db(), { displayName });
      const maybe = await named("Mo Maybe");
      const waiting = await named("Wes Waiting");
      const silent = await named("Nan Noanswer");
      const away = await named("Noa Notcoming");
      const sentAlready = await named("Sam Sent");
      const drafting = await named("Dra Draft");
      await place(h.db(), c.member.id, "applied");
      await place(h.db(), c.friend.id, "accepted");
      await place(h.db(), maybe.id, "maybe");
      await place(h.db(), waiting.id, "waitlisted");
      await place(h.db(), away.id, "not_attending");
      await place(h.db(), sentAlready.id, "accepted");
      await place(h.db(), drafting.id, "applied");
      await sent(c, sentAlready.id, []);
      await saveRentalOrder({
        userId: drafting.id,
        cycle: YEAR,
        tent: null,
        lines: [{ itemId: c.mattress, choice: "need", quantity: 1 }],
        submit: false,
        expectedVersion: 0,
      });
      return { ...c, maybe, waiting, silent, away, sentAlready, drafting };
    }
    const ask = (actorId: string) => askForGearOrders({ cycle: YEAR, actorId });
    const asks = () =>
      h
        .db()
        .select()
        .from(schema.requiredActions)
        .where(eq(schema.requiredActions.actionKey, GEAR_ORDER_ACTION_KEY));
    const notices = () =>
      h
        .db()
        .select()
        .from(schema.notificationDeliveries)
        .where(eq(schema.notificationDeliveries.refType, GEAR_ORDER_REF_TYPE));

    it("names who is coming and has not sent an order, and asks exactly them", async () => {
      const c = await crowd();
      // Said Yes or accepted, with no order or only a draft. Not Maybe, not
      // the waiting list, not No, not silent, and not one who already sent.
      expect(await listRentalUnanswered(YEAR)).toEqual([
        {
          userId: c.member.id,
          name: "Dee Member",
          participation: "applied",
          draft: false,
          asked: false,
        },
        {
          userId: c.drafting.id,
          name: "Dra Draft",
          participation: "applied",
          draft: true,
          asked: false,
        },
        {
          userId: c.friend.id,
          name: "Fay Friend",
          participation: "accepted",
          draft: false,
          asked: false,
        },
      ]);

      expect(await ask(c.captain.id)).toEqual({
        ok: true,
        asked: 3,
        notified: 3,
      });
      const rows = await asks();
      expect(rows.map((r) => r.userId).sort()).toEqual(
        [c.member.id, c.drafting.id, c.friend.id].sort(),
      );
      // A nudge, never a block: not one of them is gated by it.
      for (const row of rows) {
        expect(row).toMatchObject({
          type: "questionnaire",
          title: GEAR_ORDER_ACTION_TITLE,
          blocking: false,
          status: "pending",
          activationId: null,
        });
      }
      expect(await getPendingRequiredActions(c.member.id)).toEqual([]);
      // One notice each, which the email drain will pick up.
      const sentNotices = await notices();
      expect(sentNotices).toHaveLength(3);
      for (const n of sentNotices) {
        expect(n).toMatchObject({
          kind: "questionnaire_reminder",
          title: GEAR_ORDER_ACTION_TITLE,
          broadcastId: null,
          emailStatus: "queued",
          readAt: null,
        });
        expect(rows.map((r) => r.id)).toContain(n.refId);
      }
      const audit = await h
        .db()
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, ASKED));
      expect(audit).toMatchObject([
        {
          actorId: c.captain.id,
          metadata: { cycle: YEAR, asked: 3, notified: 3 },
        },
      ]);
      // The member sees they were asked; one who was not asked does not.
      expect((await getMyRental(c.member.id, YEAR)).asked).toBe(true);
      expect((await getMyRental(c.maybe.id, YEAR)).asked).toBe(false);
      expect((await listRentalUnanswered(YEAR)).every((m) => m.asked)).toBe(
        true,
      );
    });

    it("never stacks: a second press adds no row and no notice while the first is unread", async () => {
      const c = await crowd();
      await ask(c.captain.id);
      expect(await ask(c.captain.id)).toEqual({
        ok: true,
        asked: 3,
        notified: 0,
      });
      expect(await asks()).toHaveLength(3);
      expect(await notices()).toHaveLength(3);
      // One member read theirs and still has not answered: they are reminded,
      // the others are not.
      await h
        .db()
        .update(schema.notificationDeliveries)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(schema.notificationDeliveries.userId, c.member.id),
            eq(schema.notificationDeliveries.refType, GEAR_ORDER_REF_TYPE),
          ),
        );
      expect(await ask(c.captain.id)).toEqual({
        ok: true,
        asked: 3,
        notified: 1,
      });
      expect(await asks()).toHaveLength(3);
      const mine = (await notices()).filter((n) => n.userId === c.member.id);
      expect(mine).toHaveLength(2);
      expect(mine.filter((n) => n.readAt === null)).toHaveLength(1);
    });

    it("clears for a member when they send their order, and reaches only the rest next time", async () => {
      const c = await crowd();
      await ask(c.captain.id);
      await sent(c, c.member.id, []);
      const [row] = (await asks()).filter((r) => r.userId === c.member.id);
      expect(row).toMatchObject({ status: "completed" });
      expect(row?.completedAt).not.toBeNull();
      // Their notice is read, so the inbox stops counting it.
      expect(
        await h
          .db()
          .select()
          .from(schema.notificationDeliveries)
          .where(
            and(
              eq(schema.notificationDeliveries.userId, c.member.id),
              isNull(schema.notificationDeliveries.readAt),
            ),
          ),
      ).toEqual([]);
      expect((await getMyRental(c.member.id, YEAR)).asked).toBe(false);
      expect((await listRentalUnanswered(YEAR)).map((m) => m.name)).toEqual([
        "Dra Draft",
        "Fay Friend",
      ]);
      expect(await ask(c.captain.id)).toEqual({
        ok: true,
        asked: 2,
        notified: 0,
      });

      // They take it back: not answered again, and the next ask opens the
      // same row again rather than adding one.
      const order = (await getRentalOrderOf(c.member.id, YEAR))!;
      await withdrawRentalOrder({
        userId: c.member.id,
        cycle: YEAR,
        expectedVersion: order.version,
      });
      expect((await getMyRental(c.member.id, YEAR)).asked).toBe(false);
      expect(await ask(c.captain.id)).toEqual({
        ok: true,
        asked: 3,
        notified: 1,
      });
      expect(await asks()).toHaveLength(3);
      expect((await getMyRental(c.member.id, YEAR)).asked).toBe(true);
    });

    it("is a captain's to press: a Finance lead, another lead and a member are refused, and nobody is asked", async () => {
      const c = await crowd();
      const financeLead = await leadOf(FINANCE_TEAM as Team);
      const kitchenLead = await leadOf("kitchen");
      for (const actor of [financeLead, kitchenLead, c.member]) {
        expect(await ask(actor.id)).toEqual({
          ok: false,
          error: NOT_A_RENTAL_MANAGER,
        });
      }
      expect(await asks()).toEqual([]);
      expect(await notices()).toEqual([]);
      expect(await auditActions(h.db())).not.toContain(ASKED);
    });

    it("asks nobody when everyone who is coming has answered", async () => {
      const c = await camp();
      await place(h.db(), c.member.id, "accepted");
      await sent(c, c.member.id, []);
      expect(await ask(c.captain.id)).toEqual({
        ok: true,
        asked: 0,
        notified: 0,
      });
      expect(await asks()).toEqual([]);
      expect(await auditActions(h.db())).not.toContain(ASKED);
    });
  });

  describe("a captain fills an order in for a member", () => {
    const order = (c: { mattress: string }) => ({
      tent: { choice: "need" as const, people: 1, sharerIds: [] as string[] },
      lines: [{ itemId: c.mattress, choice: "need" as const, quantity: 1 }],
    });

    it("sends it for them, audited, and the member sees a captain did", async () => {
      const c = await camp();
      await place(h.db(), c.friend.id, "accepted");
      await askForGearOrders({ cycle: YEAR, actorId: c.captain.id });
      const fill = (expectedVersion: number, actorId = c.captain.id) =>
        fillRentalOrderFor({
          userId: c.friend.id,
          cycle: YEAR,
          ...order(c),
          expectedVersion,
          actorId,
        });
      // Not a member's to do for someone else, nor a Finance lead's.
      const financeLead = await leadOf(FINANCE_TEAM as Team);
      for (const actor of [c.member, financeLead]) {
        expect(await fill(0, actor.id)).toEqual({
          ok: false,
          error: NOT_A_RENTAL_MANAGER,
        });
      }
      expect(await getRentalOrderOf(c.friend.id, YEAR)).toBeNull();

      expect(await fill(0)).toEqual({ ok: true, version: 1 });
      expect(await getRentalOrderOf(c.friend.id, YEAR)).toMatchObject({
        status: "submitted",
        version: 1,
        filledByCaptain: true,
        tent: { choice: "need", people: 1 },
      });
      const audit = await h
        .db()
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, FILLED));
      expect(audit).toMatchObject([
        {
          actorId: c.captain.id,
          target: c.friend.id,
          metadata: { cycle: YEAR, tent: "need", lines: 1 },
        },
      ]);
      // It answers the ask, and the member sees who filled it in.
      const theirs = await getMyRental(c.friend.id, YEAR);
      expect(theirs.asked).toBe(false);
      expect(theirs.order).toMatchObject({
        status: "submitted",
        filledByCaptain: true,
      });
      expect(await listRentalUnanswered(YEAR)).toEqual([]);

      // A compare-and-set on the version the captain saw.
      expect(await fill(0)).toEqual({ ok: false, error: RENTAL_ORDER_MOVED });
      expect(await fill(1)).toEqual({ ok: true, version: 2 });
      // A stale page, after another captain changed it.
      expect(await fill(1)).toEqual({ ok: false, error: RENTAL_ORDER_MOVED });
      expect(
        (await auditActions(h.db())).filter((a) => a === FILLED),
      ).toHaveLength(2);

      // Confirmed as usual, with the tent the captain assigns; after that it
      // is reopened before it changes.
      const filled = (await getRentalOrderOf(c.friend.id, YEAR))!;
      expect(
        (
          await confirmRentalOrder({
            orderId: filled.id,
            expectedVersion: filled.version,
            tent: { itemId: c.tent, source: "camp" },
            sources: filled.lines.map((l) => ({
              lineId: l.id,
              source: "supplier" as const,
            })),
            actorId: c.captain.id,
          })
        ).ok,
      ).toBe(true);
      expect(await fill(3)).toEqual({ ok: false, error: RENTAL_REOPEN_FIRST });
    });

    it("takes over a draft, and becomes the member's own again when they save it", async () => {
      const c = await camp();
      const own = {
        tent: { choice: "own" as const, sharerIds: [] },
        lines: [],
      };
      await saveRentalOrder({
        userId: c.member.id,
        cycle: YEAR,
        ...own,
        submit: false,
        expectedVersion: 0,
      });
      expect(
        await fillRentalOrderFor({
          userId: c.member.id,
          cycle: YEAR,
          ...order(c),
          expectedVersion: 1,
          actorId: c.captain.id,
        }),
      ).toEqual({ ok: true, version: 2 });
      expect((await getMyRental(c.member.id, YEAR)).order).toMatchObject({
        status: "submitted",
        filledByCaptain: true,
      });
      // The normal path: the member takes it back and sends their own.
      await withdrawRentalOrder({
        userId: c.member.id,
        cycle: YEAR,
        expectedVersion: 2,
      });
      await saveRentalOrder({
        userId: c.member.id,
        cycle: YEAR,
        ...own,
        submit: true,
        expectedVersion: 3,
      });
      expect((await getMyRental(c.member.id, YEAR)).order).toMatchObject({
        status: "submitted",
        filledByCaptain: false,
      });
    });

    it("refuses a member who is not in the camp, and writes no audit row", async () => {
      const c = await camp();
      const erased = await makeUser(h.db(), { sanitised: true });
      expect(
        await fillRentalOrderFor({
          userId: erased.id,
          cycle: YEAR,
          ...order(c),
          expectedVersion: 0,
          actorId: c.captain.id,
        }),
      ).toEqual({ ok: false, error: RENTAL_NO_SUCH_MEMBER });
      expect(await auditActions(h.db())).not.toContain(FILLED);
      expect(await h.db().select().from(schema.rentalOrders)).toEqual([]);
    });
  });

  describe("a tent of their own", () => {
    it("keeps what it is, how many it sleeps and who shares it, and costs nothing", async () => {
      const c = await camp();
      const save = (submit: boolean, expectedVersion: number) =>
        saveRentalOrder({
          userId: c.member.id,
          cycle: YEAR,
          tent: {
            choice: "own",
            ownDescription: "3-person dome",
            ownSleeps: 3,
            sharerIds: [c.friend.id],
          },
          lines: [],
          submit,
          expectedVersion,
        });
      expect((await save(false, 0)).ok).toBe(true);
      // A draft is nobody's business yet.
      expect((await getRentalOverview(YEAR)).ownTents).toEqual([]);
      expect((await getMyRental(c.friend.id, YEAR)).sharedWithMe).toEqual([]);

      expect((await save(true, 1)).ok).toBe(true);
      const mine = (await getMyRental(c.member.id, YEAR)).order!;
      expect(mine.tent).toMatchObject({
        choice: "own",
        ownDescription: "3-person dome",
        ownSleeps: 3,
        sharers: [{ id: c.friend.id, name: "Fay Friend" }],
        assigned: null,
      });
      // The captain reads it without confirming anything.
      const overview = await getRentalOverview(YEAR);
      expect(overview.ownTents).toEqual([
        {
          orderId: mine.id,
          ownerName: "Dee Member",
          description: "3-person dome",
          sleeps: 3,
          sharers: ["Fay Friend"],
        },
      ]);
      // It is not a camp tent: nothing to assign, order or label.
      expect(overview.tents).toEqual([]);
      expect(overview.unassigned).toEqual([]);
      expect((await getMyRental(c.friend.id, YEAR)).sharedWithMe).toEqual([
        {
          orderId: mine.id,
          tentName: "3-person dome",
          tentLabel: null,
          confirmed: false,
          ownerName: "Dee Member",
          otherSharers: [],
        },
      ]);
      // Confirmed: nothing is charged for it, and no tent may be picked.
      expect(
        await confirmRentalOrder({
          orderId: mine.id,
          expectedVersion: mine.version,
          sources: [],
          actorId: c.captain.id,
        }),
      ).toEqual({ ok: true, totalCents: 0, chargeId: null });
      expect(await h.db().select().from(schema.duesCharges)).toEqual([]);
    });

    it("leaves both fields optional, and refuses more sharers than it sleeps", async () => {
      const c = await camp();
      const base = {
        userId: c.member.id,
        cycle: YEAR,
        lines: [],
        submit: true,
      };
      expect(
        (
          await saveRentalOrder({
            ...base,
            tent: { choice: "own", sharerIds: [] },
            expectedVersion: 0,
          })
        ).ok,
      ).toBe(true);
      expect((await getRentalOverview(YEAR)).ownTents).toMatchObject([
        { description: null, sleeps: null, sharers: [] },
      ]);
      await withdrawRentalOrder({
        userId: c.member.id,
        cycle: YEAR,
        expectedVersion: 1,
      });
      expect(
        await saveRentalOrder({
          ...base,
          tent: { choice: "own", ownSleeps: 1, sharerIds: [c.friend.id] },
          expectedVersion: 2,
        }),
      ).toEqual({ ok: false, error: tooManySharers(0) });
    });
  });

  describe("the on-site reserve", () => {
    it("keeps five camp tents back: they cannot be given out, and the summary counts them", async () => {
      const c = await camp();
      // The camp has 8 tents and reserves 5 for the site.
      expect(
        await editRentalItem({
          itemId: c.tent,
          item: {
            ...TENT,
            campStockCount: 8,
            reserveCount: 5,
            reserveSource: "camp",
          },
          actorId: c.captain.id,
        }),
      ).toEqual({ ok: true });
      const confirmCamp = async (userId: string) =>
        confirmed(c, await sent(c, userId, []), "camp");
      // Three are left to give out.
      for (const name of ["One", "Two", "Three"]) {
        const who = await makeUser(h.db(), { displayName: name });
        expect((await confirmCamp(who.id)).ok).toBe(true);
      }
      const fourth = await makeUser(h.db(), { displayName: "Four" });
      expect(await confirmCamp(fourth.id)).toEqual({
        ok: false,
        error: notEnoughCampStock("2-person tent", 8, 0),
      });
      const [row] = (await getRentalOverview(YEAR)).summary.rows;
      expect(row).toMatchObject({
        name: "2-person tent",
        campCount: 3,
        reserveCount: 5,
        reserveSource: "camp",
        fromStorage: 8,
        campStockCount: 8,
        campStockLeft: 0,
        toOrder: 0,
      });
    });
  });

  describe("the year", () => {
    it("is adopted by the founding year, with the charge it made", async () => {
      // No year yet: everything lands on the sentinel.
      const c = await camp(UNSET_CYCLE);
      const s = await sent(c);
      await confirmed(c, s, "camp");
      expect(
        (await setFoundingYear({ year: 2026, actorUserId: c.captain.id })).ok,
      ).toBe(true);
      expect(await listRentalItems(UNSET_CYCLE)).toEqual([]);
      expect(await listRentalItems(2026)).toHaveLength(3);
      const mine = await getMyRental(c.member.id, 2026);
      expect(mine.order).toMatchObject({ cycle: 2026, status: "confirmed" });
      const [charge] = await h.db().select().from(schema.duesCharges);
      expect(charge?.cycle).toBe(2026);
      expect(
        (await getMemberDues(c.member.id, 2026, { forFinance: false }))?.balance
          .balanceCents,
      ).toBe(26_000);
    });
  });

  describe("erasure", () => {
    it("deletes the member's orders and takes them out of other members' tents", async () => {
      const c = await camp();
      const s = await sent(c);
      await confirmed(c, s, "camp");
      // The friend is erased: they leave the member's tent.
      expect((await sanitiseAccount(c.friend.id)).ok).toBe(true);
      expect(
        (await getRentalOrderOf(c.member.id, YEAR))?.tent?.sharers,
      ).toEqual([]);
      // The member is erased: the order goes, the ledger's charge stays.
      expect((await sanitiseAccount(c.member.id)).ok).toBe(true);
      expect(await h.db().select().from(schema.rentalOrders)).toEqual([]);
      expect(await h.db().select().from(schema.rentalOrderLines)).toEqual([]);
      expect(await h.db().select().from(schema.rentalOrderSharers)).toEqual([]);
      expect(await h.db().select().from(schema.duesCharges)).toHaveLength(1);
    });
  });
});
