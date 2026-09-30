import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  campStockInUse,
  FINANCE_TEAM,
  noPriceFrom,
  notEnoughCampStock,
  RENTAL_PICK_EVERY_SOURCE,
  type AuditAction,
} from "@camp404/core";
import type { RentalItemInput, Team } from "@camp404/types";
import { sanitiseAccount } from "../account";
import type { CampConfig } from "../camp-config";
import { UNSET_CYCLE } from "../camp-config";
import { setFoundingYear } from "../cycle-rollover";
import { getMemberDues } from "../dues";
import {
  addRentalItem,
  archiveRentalItem,
  confirmRentalOrder,
  editRentalItem,
  getMyRental,
  getRentalOrderOf,
  getRentalOverview,
  listRentalItems,
  listRentalOrders,
  listRentalSharerChoices,
  NOT_A_RENTAL_MANAGER,
  RENTAL_NOTHING_TO_SEND,
  RENTAL_ORDER_CHANGED,
  RENTAL_ORDER_CONFIRMED,
  RENTAL_ORDER_MOVED,
  RENTAL_ORDER_SENT,
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
// order, the confirmation is a compare-and-set on `submitted` that writes the
// charge and the audit row in one transaction, camp stock cannot be given out
// twice, and the summary's totals are the sum of the confirmed orders.
// Prices are made up.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;
const YEAR = 2027;

const CONFIRMED: AuditAction = "rental.order_confirmed";
const REOPENED: AuditAction = "rental.order_reopened";
const ITEM_ADDED: AuditAction = "rental.item_added";
const LABELLED: AuditAction = "rental.tent_labelled";

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
    const mattress = await add(MATTRESS);
    return { captain, member, friend, tent, mattress, year };
  }

  /** The member sends an order for one shared tent and two mattresses. */
  async function sent(
    c: Awaited<ReturnType<typeof camp>>,
    userId = c.member.id,
    sharerIds: string[] = [c.friend.id],
  ) {
    const res = await saveRentalOrder({
      userId,
      cycle: c.year,
      lines: [
        { itemId: c.tent, choice: "need", quantity: 1, sharerIds },
        { itemId: c.mattress, choice: "need", quantity: 2, sharerIds: [] },
      ],
      submit: true,
      expectedVersion: 0,
    });
    if (!res.ok) throw new Error(res.error);
    const order = (await getRentalOrderOf(userId, c.year))!;
    const line = (itemId: string) =>
      order.lines.find((l) => l.itemId === itemId)!.id;
    return {
      order,
      tentLine: line(c.tent),
      mattressLine: line(c.mattress),
      sources: (tent: "camp" | "supplier") => [
        { lineId: line(c.tent), source: tent },
        { lineId: line(c.mattress), source: "supplier" as const },
      ],
    };
  }

  describe("who may run it", () => {
    it("lets a captain set the catalogue, and records it", async () => {
      const c = await camp();
      expect((await listRentalItems(YEAR)).map((i) => i.name)).toEqual([
        "2-person tent",
        "Mattress",
      ]);
      expect(await auditActions(h.db())).toEqual([ITEM_ADDED, ITEM_ADDED]);
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
      const { order, sources, tentLine } = await sent(c);
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
            orderId: order.id,
            expectedVersion: order.version,
            sources: sources("camp"),
            actorId,
          }),
        ).toEqual(refused);
        expect(
          await reopenRentalOrder({
            orderId: order.id,
            expectedVersion: order.version,
            actorId,
          }),
        ).toEqual(refused);
        expect(
          await setTentLabel({ lineId: tentLine, label: "T1", actorId }),
        ).toEqual(refused);
      }
      expect(await listRentalItems(YEAR)).toHaveLength(2);
      expect((await getRentalOrderOf(c.member.id, YEAR))?.status).toBe(
        "submitted",
      );
      expect(await h.db().select().from(schema.duesCharges)).toEqual([]);
    });
  });

  describe("a member's own order", () => {
    it("saves a draft, sends it, and only a draft can change", async () => {
      const c = await camp();
      const draft = await saveRentalOrder({
        userId: c.member.id,
        cycle: YEAR,
        lines: [{ itemId: c.tent, choice: "own", quantity: 3, sharerIds: [] }],
        submit: false,
        expectedVersion: 0,
      });
      expect(draft).toEqual({ ok: true, version: 1, status: "draft" });
      const lines = [
        {
          itemId: c.tent,
          choice: "need" as const,
          quantity: 1,
          sharerIds: [c.friend.id],
        },
      ];
      // A stale version is refused, never an overwrite.
      expect(
        await saveRentalOrder({
          userId: c.member.id,
          cycle: YEAR,
          lines,
          submit: true,
          expectedVersion: 0,
        }),
      ).toEqual({ ok: false, error: RENTAL_ORDER_CHANGED });
      expect(
        await saveRentalOrder({
          userId: c.member.id,
          cycle: YEAR,
          lines,
          submit: true,
          expectedVersion: 1,
        }),
      ).toEqual({ ok: true, version: 2, status: "submitted" });
      const mine = await getMyRental(c.member.id, YEAR);
      expect(mine.order?.status).toBe("submitted");
      expect(mine.order?.lines).toMatchObject([
        {
          itemName: "2-person tent",
          choice: "need",
          quantity: 1,
          source: null,
          sharers: [{ id: c.friend.id, name: "Fay Friend", accepted: null }],
        },
      ]);
      // Sent: it is taken back before it changes.
      expect(
        await saveRentalOrder({
          userId: c.member.id,
          cycle: YEAR,
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

    it("refuses an empty order, a stranger as a sharer and an item off the list", async () => {
      const c = await camp();
      const base = { userId: c.member.id, cycle: YEAR, expectedVersion: 0 };
      expect(
        await saveRentalOrder({ ...base, lines: [], submit: true }),
      ).toEqual({ ok: false, error: RENTAL_NOTHING_TO_SEND });
      const pending = await makeUser(h.db(), { approvalStatus: "pending" });
      expect(
        await saveRentalOrder({
          ...base,
          lines: [
            {
              itemId: c.tent,
              choice: "need",
              quantity: 1,
              sharerIds: [pending.id],
            },
          ],
          submit: false,
        }),
      ).toEqual({ ok: false, error: RENTAL_SHARER_GONE });
      await archiveRentalItem({ itemId: c.mattress, actorId: c.captain.id });
      const gone = await saveRentalOrder({
        ...base,
        lines: [
          { itemId: c.mattress, choice: "need", quantity: 1, sharerIds: [] },
        ],
        submit: false,
      });
      expect(gone.ok).toBe(false);
      expect(await h.db().select().from(schema.rentalOrders)).toEqual([]);
    });

    it("shows a member only their own order, and a sharer only the tent they are in", async () => {
      const c = await camp();
      const other = await makeUser(h.db(), { displayName: "Otto Other" });
      await sent(c);
      // Someone who is not on the order reads nothing of it.
      const theirs = await getMyRental(other.id, YEAR);
      expect(theirs.order).toBeNull();
      expect(theirs.sharedWithMe).toEqual([]);
      // The friend reads the one tent, not the mattresses or any price.
      const friends = await getMyRental(c.friend.id, YEAR);
      expect(friends.order).toBeNull();
      expect(friends.sharedWithMe).toEqual([
        {
          lineId: expect.any(String),
          itemName: "2-person tent",
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
        lines: [
          {
            itemId: c.tent,
            choice: "need",
            quantity: 1,
            sharerIds: [c.friend.id],
          },
        ],
        submit: false,
        expectedVersion: 0,
      });
      expect((await getMyRental(c.friend.id, YEAR)).sharedWithMe).toEqual([]);
    });
  });

  describe("confirming", () => {
    it("charges the member's dues and writes the audit row, with the captain's sources", async () => {
      const c = await camp();
      const { order, sources } = await sent(c);
      const res = await confirmRentalOrder({
        orderId: order.id,
        expectedVersion: order.version,
        sources: sources("camp"),
        actorId: c.captain.id,
      });
      // One camp tent and two supplier mattresses.
      expect(res).toEqual({
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
      // The member sees it on their dues and on their order.
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
      expect(
        mine.order?.lines.map((l) => [l.itemName, l.source, l.unitPriceCents]),
      ).toEqual([
        ["2-person tent", "camp", 10_000],
        ["Mattress", "supplier", 8_000],
      ]);
    });

    it("is a compare-and-set on submitted: a draft, a second confirm and a changed order are refused", async () => {
      const c = await camp();
      const { order, sources } = await sent(c);
      const moved = { ok: false, error: RENTAL_ORDER_MOVED };
      // The member takes it back and sends it again: the captain's page is stale.
      await withdrawRentalOrder({
        userId: c.member.id,
        cycle: YEAR,
        expectedVersion: order.version,
      });
      const confirm = (expectedVersion: number) =>
        confirmRentalOrder({
          orderId: order.id,
          expectedVersion,
          sources: sources("camp"),
          actorId: c.captain.id,
        });
      // A draft is not confirmed, at the old version or the new one.
      expect(await confirm(order.version)).toEqual(moved);
      expect(await confirm(order.version + 1)).toEqual(moved);
      const again = await saveRentalOrder({
        userId: c.member.id,
        cycle: YEAR,
        lines: [
          { itemId: c.mattress, choice: "need", quantity: 1, sharerIds: [] },
        ],
        submit: true,
        expectedVersion: order.version + 1,
      });
      expect(again.ok).toBe(true);
      // Sent again, but not the order the captain saw.
      expect(await confirm(order.version)).toEqual(moved);
      expect(await h.db().select().from(schema.duesCharges)).toEqual([]);

      const fresh = (await getRentalOrderOf(c.member.id, YEAR))!;
      const go = () =>
        confirmRentalOrder({
          orderId: fresh.id,
          expectedVersion: fresh.version,
          sources: [{ lineId: fresh.lines[0]!.id, source: "supplier" }],
          actorId: c.captain.id,
        });
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
      const { order, tentLine, mattressLine } = await sent(c);
      const base = {
        orderId: order.id,
        expectedVersion: order.version,
        actorId: c.captain.id,
      };
      expect(
        await confirmRentalOrder({
          ...base,
          sources: [{ lineId: tentLine, source: "camp" }],
        }),
      ).toEqual({ ok: false, error: RENTAL_PICK_EVERY_SOURCE });
      expect(
        await confirmRentalOrder({
          ...base,
          sources: [
            { lineId: tentLine, source: "camp" },
            { lineId: mattressLine, source: "camp" },
          ],
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
      const { order, sources } = await sent(c);
      // The audit insert fails: everything the confirmation wrote goes with it.
      await h.client().exec(`
        create function refuse_audit() returns trigger as $$
        begin raise exception 'audit is down'; end; $$ language plpgsql;
        create trigger refuse_audit before insert on audit_log
          for each row execute function refuse_audit();
      `);
      try {
        await expect(
          confirmRentalOrder({
            orderId: order.id,
            expectedVersion: order.version,
            sources: sources("camp"),
            actorId: c.captain.id,
          }),
        ).rejects.toThrow();
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
        version: order.version,
        totalCents: null,
        chargeId: null,
      });
      expect(after.lines.every((l) => l.source === null)).toBe(true);
    });

    it("confirms an order of owned gear with nothing to pay", async () => {
      const c = await camp();
      await saveRentalOrder({
        userId: c.member.id,
        cycle: YEAR,
        lines: [{ itemId: c.tent, choice: "own", quantity: 1, sharerIds: [] }],
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
      const { order, sources } = await sent(c);
      await confirmRentalOrder({
        orderId: order.id,
        expectedVersion: order.version,
        sources: sources("supplier"),
        actorId: c.captain.id,
      });
      await editRentalItem({
        itemId: c.tent,
        item: { ...TENT, supplierPriceCents: 99_000 },
        actorId: c.captain.id,
      });
      const after = (await getRentalOrderOf(c.member.id, YEAR))!;
      expect(after.totalCents).toBe(41_000);
      expect(after.lines.find((l) => l.isTent)?.unitPriceCents).toBe(25_000);
    });
  });

  describe("camp stock", () => {
    it("refuses to give out more than the camp has, across orders", async () => {
      const c = await camp();
      // The camp has 2 tents. Two members take them.
      const second = await makeUser(h.db(), { displayName: "Sam Second" });
      const third = await makeUser(h.db(), { displayName: "Tia Third" });
      for (const who of [c.member, second]) {
        const s = await sent(c, who.id, []);
        expect(
          (
            await confirmRentalOrder({
              orderId: s.order.id,
              expectedVersion: s.order.version,
              sources: s.sources("camp"),
              actorId: c.captain.id,
            })
          ).ok,
        ).toBe(true);
      }
      const last = await sent(c, third.id, []);
      const confirm = (tent: "camp" | "supplier") =>
        confirmRentalOrder({
          orderId: last.order.id,
          expectedVersion: last.order.version,
          sources: last.sources(tent),
          actorId: c.captain.id,
        });
      expect(await confirm("camp")).toEqual({
        ok: false,
        error: notEnoughCampStock("2-person tent", 2, 0),
      });
      // Refused whole: still sent, and nothing charged.
      expect((await getRentalOrderOf(third.id, YEAR))?.status).toBe(
        "submitted",
      );
      expect(await h.db().select().from(schema.duesCharges)).toHaveLength(2);
      // The supplier has no such limit.
      expect((await confirm("supplier")).ok).toBe(true);
    });

    it("counts a camp reserve against the stock, and frees stock on reopen", async () => {
      const c = await camp();
      // One of the two tents is kept for the adoptees.
      expect(
        await editRentalItem({
          itemId: c.tent,
          item: { ...TENT, reserveCount: 1, reserveSource: "camp" },
          actorId: c.captain.id,
        }),
      ).toEqual({ ok: true });
      const first = await sent(c, c.member.id, []);
      await confirmRentalOrder({
        orderId: first.order.id,
        expectedVersion: first.order.version,
        sources: first.sources("camp"),
        actorId: c.captain.id,
      });
      const second = await sent(c, c.friend.id, []);
      const confirmSecond = () =>
        confirmRentalOrder({
          orderId: second.order.id,
          expectedVersion: second.order.version,
          sources: second.sources("camp"),
          actorId: c.captain.id,
        });
      expect(await confirmSecond()).toEqual({
        ok: false,
        error: notEnoughCampStock("2-person tent", 2, 0),
      });
      // The first order is reopened: its tent is free again.
      const confirmed = (await getRentalOrderOf(c.member.id, YEAR))!;
      await reopenRentalOrder({
        orderId: confirmed.id,
        expectedVersion: confirmed.version,
        actorId: c.captain.id,
      });
      expect((await confirmSecond()).ok).toBe(true);
    });

    it("refuses a catalogue change that leaves fewer than are given out", async () => {
      const c = await camp();
      const { order, sources } = await sent(c);
      await confirmRentalOrder({
        orderId: order.id,
        expectedVersion: order.version,
        sources: sources("camp"),
        actorId: c.captain.id,
      });
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
      const { order, sources } = await sent(c);
      // A sent order is not reopened.
      expect(
        await reopenRentalOrder({
          orderId: order.id,
          expectedVersion: order.version,
          actorId: c.captain.id,
        }),
      ).toEqual({ ok: false, error: RENTAL_ORDER_MOVED });
      await confirmRentalOrder({
        orderId: order.id,
        expectedVersion: order.version,
        sources: sources("camp"),
        actorId: c.captain.id,
      });
      // Confirmed: the member cannot change it themselves.
      expect(
        await withdrawRentalOrder({
          userId: c.member.id,
          cycle: YEAR,
          expectedVersion: order.version + 1,
        }),
      ).toEqual({ ok: false, error: RENTAL_ORDER_CONFIRMED });
      const reopen = () =>
        reopenRentalOrder({
          orderId: order.id,
          expectedVersion: order.version + 1,
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
      expect(await getRentalOrderOf(c.member.id, YEAR)).toMatchObject({
        status: "submitted",
        totalCents: null,
        chargeId: null,
      });
      expect(
        (await auditActions(h.db())).filter((a) => a === REOPENED),
      ).toHaveLength(1);
      // A reopened order is not counted, though its lines still name a source.
      expect(await getRentalOverview(YEAR)).toMatchObject({
        waiting: 1,
        confirmed: 0,
        tents: [],
        summary: { chargedCents: 0, fromStorage: 0, toOrder: 0 },
      });
      // A reopened order shows the member no source or price.
      const mine = await getMyRental(c.member.id, YEAR);
      expect(mine.order?.lines.every((l) => l.source === null)).toBe(true);
    });
  });

  describe("the captains' summary", () => {
    it("totals the confirmed orders by source, and they match the sum of the orders", async () => {
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
      await confirmRentalOrder({
        orderId: a.order.id,
        expectedVersion: a.order.version,
        sources: a.sources("camp"),
        actorId: c.captain.id,
      });
      await confirmRentalOrder({
        orderId: b.order.id,
        expectedVersion: b.order.version,
        sources: b.sources("supplier"),
        actorId: c.captain.id,
      });
      const overview = await getRentalOverview(YEAR);
      expect(overview.waiting).toBe(1);
      expect(overview.confirmed).toBe(2);
      expect(overview.summary.rows).toMatchObject([
        {
          name: "2-person tent",
          campCount: 1,
          supplierCount: 1,
          fromStorage: 1,
          toOrder: 1,
          campStockCount: 2,
          campStockLeft: 1,
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
      // The totals are the sum of what the confirmed orders were charged.
      const orders = await listRentalOrders(YEAR);
      const charged = orders
        .filter((o) => o.status === "confirmed")
        .reduce((n, o) => n + (o.totalCents ?? 0), 0);
      expect(charged).toBe(26_000 + 41_000);
      expect(overview.summary.chargedCents).toBe(charged);
      expect(overview.summary.supplierCents).toBe(16_000 + 41_000);
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
    it("labels a tent on a confirmed order, for the member and the sharer", async () => {
      const c = await camp();
      const { order, sources, tentLine, mattressLine } = await sent(c);
      const label = (lineId: string) =>
        setTentLabel({ lineId, label: "T3", actorId: c.captain.id });
      expect(await label(tentLine)).toEqual({
        ok: false,
        error: RENTAL_TENT_NOT_CONFIRMED,
      });
      await confirmRentalOrder({
        orderId: order.id,
        expectedVersion: order.version,
        sources: sources("camp"),
        actorId: c.captain.id,
      });
      expect(await label(mattressLine)).toEqual({
        ok: false,
        error: RENTAL_TENT_NOT_CONFIRMED,
      });
      expect(await label(tentLine)).toEqual({ ok: true });
      expect(await auditActions(h.db())).toContain(LABELLED);
      const mine = await getMyRental(c.member.id, YEAR);
      expect(mine.order?.lines.find((l) => l.isTent)?.tentLabel).toBe("T3");
      expect((await getMyRental(c.friend.id, YEAR)).sharedWithMe).toMatchObject(
        [{ tentLabel: "T3", confirmed: true, ownerName: "Dee Member" }],
      );
      expect((await getRentalOverview(YEAR)).tents).toEqual([
        {
          lineId: tentLine,
          itemName: "2-person tent",
          quantity: 1,
          tentLabel: "T3",
          source: "camp",
          ownerName: "Dee Member",
          sharers: ["Fay Friend"],
        },
      ]);
    });
  });

  describe("the year", () => {
    it("is adopted by the founding year, with the charge it made", async () => {
      // No year yet: everything lands on the sentinel.
      const c = await camp(UNSET_CYCLE);
      const { order, sources } = await sent(c);
      await confirmRentalOrder({
        orderId: order.id,
        expectedVersion: order.version,
        sources: sources("camp"),
        actorId: c.captain.id,
      });
      expect(
        (await setFoundingYear({ year: 2026, actorUserId: c.captain.id })).ok,
      ).toBe(true);
      expect(await listRentalItems(UNSET_CYCLE)).toEqual([]);
      expect(await listRentalItems(2026)).toHaveLength(2);
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
      const { order, sources } = await sent(c);
      await confirmRentalOrder({
        orderId: order.id,
        expectedVersion: order.version,
        sources: sources("camp"),
        actorId: c.captain.id,
      });
      // The friend is erased: they leave the member's tent.
      expect((await sanitiseAccount(c.friend.id)).ok).toBe(true);
      expect(
        (await getRentalOrderOf(c.member.id, YEAR))?.lines.find((l) => l.isTent)
          ?.sharers,
      ).toEqual([]);
      // The member is erased: the order goes, the ledger's charge stays.
      expect((await sanitiseAccount(c.member.id)).ok).toBe(true);
      expect(await h.db().select().from(schema.rentalOrders)).toEqual([]);
      expect(await h.db().select().from(schema.rentalOrderLines)).toEqual([]);
      expect(await h.db().select().from(schema.duesCharges)).toHaveLength(1);
    });
  });
});
