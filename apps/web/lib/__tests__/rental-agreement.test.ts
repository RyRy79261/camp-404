// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RENTAL_NOTHING_TO_SEND,
  RENTAL_ORDER_CHANGED,
  RENTAL_ORDER_MOVED,
  RENTAL_ORDER_SENT,
  RENTAL_PICK_A_TENT,
  RENTAL_REOPEN_FIRST,
} from "@camp404/core";
import {
  NOT_A_RENTAL_MANAGER,
  RENTAL_ITEM_MISSING,
  RENTAL_TENT_NOT_CONFIRMED,
} from "@camp404/db/rental";
import {
  RENTAL_CHOICES,
  RENTAL_SOURCES,
  RENTAL_TENT_CHOICES,
  type RentalItemInput,
} from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays, YEAR, type People } from "./_agreement";

// Gear rental (#241), through lib/rental.ts, on the database and on the E2E
// store: the same people, the same calls, the same answers and refusal
// sentences. The order checks, pricing, tent conflicts and the refusal
// sentences are functions in @camp404/core/rental; this holds the rest (who
// runs it, the compare-and-sets, the dues charge, the reads) equal. See
// _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import { getMemberDues } from "../dues";
import {
  addRentalItem,
  archiveRentalItem,
  askForGearOrders,
  confirmRentalOrder,
  editRentalItem,
  fillRentalOrderFor,
  getMyRental,
  getRentalMember,
  getRentalOrderOf,
  getRentalOverview,
  listRentalItems,
  listRentalOrders,
  listRentalSharerChoices,
  listRentalUnanswered,
  reopenRentalOrder,
  saveRentalOrder,
  setTentLabel,
  withdrawRentalOrder,
} from "../rental";

const [OWN, NEED] = RENTAL_CHOICES;
const [CAMP, SUPPLIER] = RENTAL_SOURCES;
const [OWN_TENT_CHOICE, NEED_TENT, SHARED_TENT] = RENTAL_TENT_CHOICES;
const NOBODY = "00000000-0000-4000-8000-000000000000";

const TENT: RentalItemInput = {
  name: "Bell tent",
  isTent: true,
  sleeps: 3,
  campPriceCents: 40_000,
  campStockCount: 2,
  supplierPriceCents: 90_000,
  reserveCount: 0,
  reserveSource: CAMP,
};
const MATTRESS: RentalItemInput = {
  name: "Mattress",
  isTent: false,
  sleeps: 1,
  campPriceCents: null,
  campStockCount: null,
  supplierPriceCents: 15_000,
  reserveCount: 0,
  reserveSource: SUPPLIER,
};

/** The year's tent and mattress, added by the captain; their ids. */
async function catalogue(p: People) {
  const tent = await addRentalItem({
    cycle: YEAR,
    item: TENT,
    actorId: p.captain,
  });
  const mattress = await addRentalItem({
    cycle: YEAR,
    item: MATTRESS,
    actorId: p.captain,
  });
  if (!tent.ok || !mattress.ok) throw new Error("catalogue refused");
  return { tent: tent.id, mattress: mattress.id };
}

/** The member's sent order: a tent for two with `other`, two mattresses. */
async function sentOrder(p: People, mattress: string) {
  const saved = await saveRentalOrder({
    userId: p.member,
    cycle: YEAR,
    submit: true,
    expectedVersion: 0,
    tent: { choice: NEED_TENT, people: 2, sharerIds: [p.other] },
    lines: [{ itemId: mattress, choice: NEED, quantity: 2 }],
  });
  if (!saved.ok) throw new Error(saved.error);
  return saved;
}

describe("gear rental: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("lets only a captain keep the catalogue", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const add = (actorId: string) =>
        addRentalItem({ cycle: YEAR, item: MATTRESS, actorId });
      const ids = await catalogue(p);
      return {
        financeLead: await add(p.financeLead),
        kitchenLead: await add(p.kitchenLead),
        member: await add(p.member),
        edit: await editRentalItem({
          itemId: ids.mattress,
          item: { ...MATTRESS, supplierPriceCents: 16_000 },
          actorId: p.captain,
        }),
        editByFinance: await editRentalItem({
          itemId: ids.mattress,
          item: MATTRESS,
          actorId: p.financeLead,
        }),
        editMissing: await editRentalItem({
          itemId: NOBODY,
          item: MATTRESS,
          actorId: p.captain,
        }),
        archive: await archiveRentalItem({
          itemId: ids.mattress,
          actorId: p.captain,
        }),
        archiveAgain: await archiveRentalItem({
          itemId: ids.mattress,
          actorId: p.captain,
        }),
        live: await listRentalItems(YEAR),
        all: await listRentalItems(YEAR, { includeArchived: true }),
      };
    });
    expect(db).toMatchObject({
      financeLead: { ok: false, error: NOT_A_RENTAL_MANAGER },
      kitchenLead: { ok: false, error: NOT_A_RENTAL_MANAGER },
      member: { ok: false, error: NOT_A_RENTAL_MANAGER },
      edit: { ok: true },
      editByFinance: { ok: false, error: NOT_A_RENTAL_MANAGER },
      editMissing: { ok: false, error: RENTAL_ITEM_MISSING },
      archive: { ok: true },
      archiveAgain: { ok: false, error: RENTAL_ITEM_MISSING },
      live: [{ name: "Bell tent" }],
    });
    expect(store).toEqual(db);
  });

  it("saves, sends and takes back a member's own order, each a compare-and-set", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const { tent, mattress } = await catalogue(p);
      const save = (
        userId: string,
        expectedVersion: number,
        submit: boolean,
        draft: Pick<Parameters<typeof saveRentalOrder>[0], "tent" | "lines">,
      ) =>
        saveRentalOrder({
          userId,
          cycle: YEAR,
          submit,
          expectedVersion,
          ...draft,
        });
      const order = {
        tent: { choice: NEED_TENT, people: 2, sharerIds: [p.other] },
        lines: [{ itemId: mattress, choice: NEED, quantity: 2 }],
      } as const;
      return {
        nothing: await save(p.kitchenLead, 0, true, { tent: null, lines: [] }),
        draft: await save(p.member, 0, false, order),
        staleDraft: await save(p.member, 0, false, order),
        sent: await save(p.member, 1, true, order),
        whileSent: await save(p.member, 2, false, order),
        withdrawStale: await withdrawRentalOrder({
          userId: p.member,
          cycle: YEAR,
          expectedVersion: 1,
        }),
        withdraw: await withdrawRentalOrder({
          userId: p.member,
          cycle: YEAR,
          expectedVersion: 2,
        }),
        sentAgain: await save(p.member, 3, true, order),
        sharerWithOwn: await save(p.other, 0, true, {
          tent: { choice: OWN_TENT_CHOICE, sharerIds: [] },
          lines: [],
        }),
        sharerShared: await save(p.other, 0, true, {
          tent: { choice: SHARED_TENT },
          lines: [{ itemId: mattress, choice: OWN, quantity: 1 }],
        }),
        tentAsLine: await save(p.financeLead, 0, false, {
          tent: null,
          lines: [{ itemId: tent, choice: NEED, quantity: 1 }],
        }),
        mine: await getMyRental(p.member, YEAR),
        theirs: await getMyRental(p.other, YEAR),
        choices: await listRentalSharerChoices(p.member),
      };
    });
    expect(db).toMatchObject({
      nothing: { ok: false, error: RENTAL_NOTHING_TO_SEND },
      draft: { ok: true, version: 1, status: "draft" },
      staleDraft: { ok: false, error: RENTAL_ORDER_CHANGED },
      sent: { ok: true, version: 2, status: "submitted" },
      whileSent: { ok: false, error: RENTAL_ORDER_SENT },
      withdrawStale: { ok: false, error: RENTAL_ORDER_CHANGED },
      withdraw: { ok: true, version: 3 },
      sentAgain: { ok: true, version: 4 },
      sharerWithOwn: { ok: false },
      sharerShared: { ok: true },
      tentAsLine: { ok: false },
      mine: { order: { status: "submitted", tent: { people: 2 } } },
      theirs: { sharedWithMe: [{ ownerName: "Nova" }] },
    });
    expect(store).toEqual(db);
  });

  it("confirms a sent order with the captain's tent and sources, charges dues, and reopens it", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const { tent, mattress } = await catalogue(p);
      await sentOrder(p, mattress);
      const sent = (await getRentalOrderOf(p.member, YEAR))!;
      const sources = sent.lines.map((l) => ({
        lineId: l.id,
        source: SUPPLIER,
      }));
      const confirm = (
        actorId: string,
        expectedVersion: number,
        pick: { itemId: string; source: "camp" | "supplier" } | null,
      ) =>
        confirmRentalOrder({
          orderId: sent.id,
          expectedVersion,
          tent: pick,
          sources,
          actorId,
        });
      const out = {
        byFinance: await confirm(p.financeLead, 1, {
          itemId: tent,
          source: CAMP,
        }),
        noTent: await confirm(p.captain, 1, null),
        stale: await confirm(p.captain, 0, { itemId: tent, source: CAMP }),
        confirmed: await confirm(p.captain, 1, { itemId: tent, source: CAMP }),
      };
      const order = (await getRentalOrderOf(p.member, YEAR))!;
      const tentLine = order.tent!.assigned!.id;
      return {
        ...out,
        order,
        labelByMember: await setTentLabel({
          lineId: tentLine,
          label: "T1",
          actorId: p.member,
        }),
        label: await setTentLabel({
          lineId: tentLine,
          label: "T1",
          actorId: p.captain,
        }),
        labelOnMattress: await setTentLabel({
          lineId: order.lines[0]!.id,
          label: "M1",
          actorId: p.captain,
        }),
        fillConfirmed: await fillRentalOrderFor({
          userId: p.member,
          cycle: YEAR,
          expectedVersion: 2,
          tent: null,
          lines: [{ itemId: mattress, choice: NEED, quantity: 1 }],
          actorId: p.captain,
        }),
        overview: await getRentalOverview(YEAR),
        dues: await getMemberDues(p.member, YEAR, {
          forFinance: true,
          today: `${YEAR}-03-01`,
        }),
        reopenStale: await reopenRentalOrder({
          orderId: sent.id,
          expectedVersion: 1,
          actorId: p.captain,
        }),
        reopenByKitchen: await reopenRentalOrder({
          orderId: sent.id,
          expectedVersion: 2,
          actorId: p.kitchenLead,
        }),
        reopen: await reopenRentalOrder({
          orderId: sent.id,
          expectedVersion: 2,
          actorId: p.captain,
        }),
        afterReopen: await getMemberDues(p.member, YEAR, {
          forFinance: true,
          today: `${YEAR}-03-01`,
        }),
        orders: await listRentalOrders(YEAR),
      };
    });
    expect(db).toMatchObject({
      byFinance: { ok: false, error: NOT_A_RENTAL_MANAGER },
      noTent: { ok: false, error: RENTAL_PICK_A_TENT },
      stale: { ok: false, error: RENTAL_ORDER_MOVED },
      confirmed: { ok: true, totalCents: 40_000 + 2 * 15_000 },
      labelByMember: { ok: false, error: NOT_A_RENTAL_MANAGER },
      label: { ok: true },
      labelOnMattress: { ok: false, error: RENTAL_TENT_NOT_CONFIRMED },
      fillConfirmed: { ok: false, error: RENTAL_REOPEN_FIRST },
      dues: { charges: [{ kind: "rental", amountCents: 70_000 }] },
      reopenStale: { ok: false, error: RENTAL_ORDER_MOVED },
      reopenByKitchen: { ok: false, error: NOT_A_RENTAL_MANAGER },
      reopen: { ok: true },
      afterReopen: { charges: [{ kind: "rental", cancelled: true }] },
      orders: [{ status: "submitted", chargeId: null }],
    });
    expect(store).toEqual(db);
  });

  it("asks everyone coming who has not answered, once, and lets a captain fill an order in", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const { mattress } = await catalogue(p);
      await seed.participation(p.member, "accepted");
      await seed.participation(p.other, "applied");
      await seed.participation(p.kitchenLead, "not_attending");
      const fill = (actorId: string, expectedVersion: number) =>
        fillRentalOrderFor({
          userId: p.other,
          cycle: YEAR,
          expectedVersion,
          tent: { choice: SHARED_TENT },
          lines: [{ itemId: mattress, choice: NEED, quantity: 1 }],
          actorId,
        });
      return {
        unanswered: await listRentalUnanswered(YEAR),
        askByFinance: await askForGearOrders({
          cycle: YEAR,
          actorId: p.financeLead,
        }),
        ask: await askForGearOrders({ cycle: YEAR, actorId: p.captain }),
        askAgain: await askForGearOrders({ cycle: YEAR, actorId: p.captain }),
        asked: (await getMyRental(p.member, YEAR)).asked,
        fillByKitchen: await fill(p.kitchenLead, 0),
        filled: await fill(p.captain, 0),
        fillStale: await fill(p.captain, 0),
        member: await getRentalMember(p.other, YEAR),
        nobody: await getRentalMember(NOBODY, YEAR),
        after: await listRentalUnanswered(YEAR),
        order: await getRentalOrderOf(p.other, YEAR),
      };
    });
    expect(db).toMatchObject({
      askByFinance: { ok: false, error: NOT_A_RENTAL_MANAGER },
      ask: { ok: true, asked: 2, notified: 2 },
      askAgain: { ok: true, asked: 2, notified: 0 },
      asked: true,
      fillByKitchen: { ok: false, error: NOT_A_RENTAL_MANAGER },
      filled: { ok: true, version: 1 },
      fillStale: { ok: false, error: RENTAL_ORDER_MOVED },
      nobody: null,
      order: { status: "submitted", filledByCaptain: true },
    });
    expect(store).toEqual(db);
  });
});
