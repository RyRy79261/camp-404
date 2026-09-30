import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  GEAR_ORDER_REF_TYPE,
  notEnoughCampStock,
  tentInUse,
} from "@camp404/core";
import type { CampConfig, TeamsConfig } from "@camp404/db/camp-config";
import {
  NOT_A_RENTAL_MANAGER,
  RENTAL_ORDER_MOVED,
  RENTAL_REOPEN_FIRST,
  RENTAL_ORDER_SENT,
  RENTAL_TENT_NOT_CONFIRMED,
} from "@camp404/db/rental";
import type { RentalItemInput } from "@camp404/types";
import { testStore } from "../test-store";
import { duesTestStore } from "../test-store-dues";
import { rentalTestStore } from "../test-store-rental";

// The E2E twin of @camp404/db/rental (#241). Playwright drives the gear
// screens through it, so it keeps the database module's rules, case for case
// with packages/db/src/__tests__/rental.test.ts: only a captain runs it, a
// member reads only their own order, the confirmation is a compare-and-set
// that charges the dues twin, camp stock cannot be given out twice, and the
// summary adds up. Prices are made up.

const YEAR = 2027;

function foundedAt(year: number): void {
  const config: CampConfig = {
    ...(testStore.getTeamsConfig() as CampConfig),
    cycles: [{ year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null }],
  };
  testStore.setTeamsConfig(config satisfies TeamsConfig);
}

function user(name: string, rank: "captain" | "member" = "member") {
  return testStore.createUser({
    authUserId: `auth-${name}`,
    displayName: name,
    inviteCode: "seeded",
    rank,
  });
}

const TENT: RentalItemInput = {
  name: "2-person tent",
  isTent: true,
  sleeps: 2,
  campPriceCents: 10_000,
  campStockCount: 1,
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
  reserveCount: 2,
  reserveSource: "supplier",
};

function camp() {
  const captain = user("Cap", "captain");
  const financeLead = user("Fin");
  testStore.seedTeamMembership({
    userId: financeLead.id,
    team: "finance",
    isLead: true,
  });
  const member = user("Nova");
  const friend = user("Fay");
  const add = (item: RentalItemInput) => {
    const res = rentalTestStore.addRentalItem({
      cycle: YEAR,
      item,
      actorId: captain.id,
    });
    if (!res.ok) throw new Error(res.error);
    return res.id;
  };
  return {
    captain,
    financeLead,
    member,
    friend,
    tent: add(TENT),
    mattress: add(MATTRESS),
  };
}

function send(c: ReturnType<typeof camp>, userId = c.member.id) {
  const res = rentalTestStore.saveRentalOrder({
    userId,
    cycle: YEAR,
    lines: [
      {
        itemId: c.tent,
        choice: "need",
        quantity: 1,
        sharerIds: userId === c.member.id ? [c.friend.id] : [],
      },
      { itemId: c.mattress, choice: "need", quantity: 2, sharerIds: [] },
    ],
    submit: true,
    expectedVersion: 0,
  });
  if (!res.ok) throw new Error(res.error);
  const order = rentalTestStore.getRentalOrderOf(userId, YEAR)!;
  const line = (itemId: string) =>
    order.lines.find((l) => l.itemId === itemId)!.id;
  return {
    order,
    tentLine: line(c.tent),
    sources: (tent: "camp" | "supplier") => [
      { lineId: line(c.tent), source: tent },
      { lineId: line(c.mattress), source: "supplier" as const },
    ],
  };
}

beforeEach(() => {
  testStore.reset();
  foundedAt(YEAR);
});

describe("the gear rental twin", () => {
  it("lets only a captain run it: a Finance lead and a member are refused", () => {
    const c = camp();
    const { order, sources } = send(c);
    const refused = { ok: false, error: NOT_A_RENTAL_MANAGER };
    for (const actor of [c.financeLead, c.member]) {
      expect(
        rentalTestStore.addRentalItem({
          cycle: YEAR,
          item: MATTRESS,
          actorId: actor.id,
        }),
      ).toEqual(refused);
      expect(
        rentalTestStore.confirmRentalOrder({
          orderId: order.id,
          expectedVersion: order.version,
          sources: sources("camp"),
          actorId: actor.id,
        }),
      ).toEqual(refused);
    }
    expect(rentalTestStore.listRentalItems(YEAR)).toHaveLength(2);
    expect(rentalTestStore.getRentalOrderOf(c.member.id, YEAR)?.status).toBe(
      "submitted",
    );
  });

  it("shows a member their own order only, and a sharer the one tent", () => {
    const c = camp();
    send(c);
    const mine = rentalTestStore.getMyRental(c.member.id, YEAR);
    expect(mine.order?.lines.map((l) => l.itemName)).toEqual([
      "2-person tent",
      "Mattress",
    ]);
    // No place is shown to a member, and no source before a captain confirms.
    expect(mine.order?.lines[0]).toMatchObject({
      source: null,
      sharers: [{ id: c.friend.id, name: "Fay", accepted: null }],
    });
    const friends = rentalTestStore.getMyRental(c.friend.id, YEAR);
    expect(friends.order).toBeNull();
    expect(friends.sharedWithMe).toMatchObject([
      { itemName: "2-person tent", ownerName: "Nova", confirmed: false },
    ]);
    expect(
      rentalTestStore.getMyRental(c.captain.id, YEAR).sharedWithMe,
    ).toEqual([]);
  });

  it("confirms once, on the order the captain saw, and charges the dues twin", () => {
    const c = camp();
    const { order, sources } = send(c);
    // Only a draft changes: a sent order is taken back first.
    expect(
      rentalTestStore.saveRentalOrder({
        userId: c.member.id,
        cycle: YEAR,
        lines: [],
        submit: false,
        expectedVersion: order.version,
      }),
    ).toEqual({ ok: false, error: RENTAL_ORDER_SENT });
    const confirm = (expectedVersion: number) =>
      rentalTestStore.confirmRentalOrder({
        orderId: order.id,
        expectedVersion,
        sources: sources("camp"),
        actorId: c.captain.id,
      });
    expect(confirm(order.version + 1)).toEqual({
      ok: false,
      error: RENTAL_ORDER_MOVED,
    });
    expect(confirm(order.version)).toEqual({
      ok: true,
      totalCents: 26_000,
      chargeId: expect.any(String),
    });
    expect(confirm(order.version)).toEqual({
      ok: false,
      error: RENTAL_ORDER_MOVED,
    });
    const dues = duesTestStore.getMemberDues(c.member.id, YEAR, {
      forFinance: false,
    });
    expect(dues?.balance.balanceCents).toBe(26_000);
    expect(dues?.charges).toMatchObject([
      {
        kind: "rental",
        amountCents: 26_000,
        description: "Gear rental: 1 × 2-person tent, 2 × Mattress",
      },
    ]);
    // Reopened: the charge is cancelled and the order can change.
    expect(
      rentalTestStore.reopenRentalOrder({
        orderId: order.id,
        expectedVersion: order.version + 1,
        actorId: c.captain.id,
      }),
    ).toEqual({ ok: true });
    expect(
      duesTestStore.getMemberDues(c.member.id, YEAR, { forFinance: false })
        ?.balance.balanceCents,
    ).toBe(0);
    expect(rentalTestStore.getRentalOrderOf(c.member.id, YEAR)).toMatchObject({
      status: "submitted",
      chargeId: null,
      totalCents: null,
    });
    // A reopened order is not counted, though its lines still name a source.
    expect(rentalTestStore.getRentalOverview(YEAR)).toMatchObject({
      waiting: 1,
      confirmed: 0,
      tents: [],
      summary: { chargedCents: 0, fromStorage: 0, toOrder: 2 },
    });
  });

  it("refuses camp stock that is already given out", () => {
    const c = camp();
    const first = send(c);
    rentalTestStore.confirmRentalOrder({
      orderId: first.order.id,
      expectedVersion: first.order.version,
      sources: first.sources("camp"),
      actorId: c.captain.id,
    });
    const second = send(c, c.friend.id);
    const confirm = (tent: "camp" | "supplier") =>
      rentalTestStore.confirmRentalOrder({
        orderId: second.order.id,
        expectedVersion: second.order.version,
        sources: second.sources(tent),
        actorId: c.captain.id,
      });
    // The camp has one tent, and the first order took it.
    expect(confirm("camp")).toEqual({
      ok: false,
      error: notEnoughCampStock("2-person tent", 1, 0),
    });
    expect(rentalTestStore.getRentalOrderOf(c.friend.id, YEAR)?.status).toBe(
      "submitted",
    );
    expect(confirm("supplier").ok).toBe(true);
  });

  it("keeps a shared tent's size under the people on a sent order", () => {
    const c = camp();
    const edit = (sleeps: number) =>
      rentalTestStore.editRentalItem({
        itemId: c.tent,
        item: { ...TENT, sleeps },
        actorId: c.captain.id,
      });
    // Nobody has ordered it: any size.
    expect(edit(1)).toEqual({ ok: true });
    expect(edit(2)).toEqual({ ok: true });
    send(c);
    expect(edit(1)).toEqual({ ok: false, error: tentInUse("2-person tent") });
    expect(
      rentalTestStore.listRentalItems(YEAR).find((i) => i.id === c.tent)
        ?.sleeps,
    ).toBe(2);
    expect(edit(3)).toEqual({ ok: true });
  });

  it("asks exactly the members who are coming and have not answered, and never stacks", () => {
    const c = camp();
    const maybe = user("Mo");
    const coming = (id: string, status: "applied" | "accepted" | "maybe") =>
      testStore.seedParticipation({ userId: id, cycle: YEAR, status });
    coming(c.member.id, "applied");
    coming(c.friend.id, "accepted");
    coming(maybe.id, "maybe");
    coming(c.financeLead.id, "accepted");
    send(c, c.financeLead.id);
    const ask = (actorId: string) =>
      rentalTestStore.askForGearOrders({ cycle: YEAR, actorId });
    const unread = (userId: string) =>
      testStore.hasUnreadNotice(userId, GEAR_ORDER_REF_TYPE);

    expect(
      rentalTestStore.listRentalUnanswered(YEAR).map((m) => [m.name, m.asked]),
    ).toEqual([
      ["Fay", false],
      ["Nova", false],
    ]);
    // Not a member's to press, nor a Finance lead's.
    for (const actor of [c.member, c.financeLead]) {
      expect(ask(actor.id)).toEqual({
        ok: false,
        error: NOT_A_RENTAL_MANAGER,
      });
    }
    expect(unread(c.member.id)).toBe(false);

    expect(ask(c.captain.id)).toEqual({ ok: true, asked: 2, notified: 2 });
    expect(unread(c.member.id)).toBe(true);
    expect(unread(maybe.id)).toBe(false);
    expect(unread(c.financeLead.id)).toBe(false);
    expect(rentalTestStore.getMyRental(c.member.id, YEAR).asked).toBe(true);
    expect(rentalTestStore.getMyRental(maybe.id, YEAR).asked).toBe(false);
    // A nudge, never a block.
    expect(testStore.getPendingRequiredActions(c.member.id)).toEqual([]);
    // Pressed again: nobody gets a second notice while the first is unread.
    expect(ask(c.captain.id)).toEqual({ ok: true, asked: 2, notified: 0 });

    // The member sends their order: the ask is answered and its notice read.
    send(c);
    expect(rentalTestStore.getMyRental(c.member.id, YEAR).asked).toBe(false);
    expect(unread(c.member.id)).toBe(false);
    expect(
      rentalTestStore.listRentalUnanswered(YEAR).map((m) => [m.name, m.asked]),
    ).toEqual([["Fay", true]]);
    expect(ask(c.captain.id)).toEqual({ ok: true, asked: 1, notified: 0 });
    // Taken back: the ask stays answered until a captain asks again.
    const mine = rentalTestStore.getRentalOrderOf(c.member.id, YEAR)!;
    rentalTestStore.withdrawRentalOrder({
      userId: c.member.id,
      cycle: YEAR,
      expectedVersion: mine.version,
    });
    expect(rentalTestStore.getMyRental(c.member.id, YEAR).asked).toBe(false);
    expect(ask(c.captain.id)).toEqual({ ok: true, asked: 2, notified: 1 });
    expect(rentalTestStore.getMyRental(c.member.id, YEAR).asked).toBe(true);
  });

  it("lets a captain fill an order in for a member, who sees that a captain did", () => {
    const c = camp();
    const fill = (expectedVersion: number, actorId = c.captain.id) =>
      rentalTestStore.fillRentalOrderFor({
        userId: c.friend.id,
        cycle: YEAR,
        lines: [
          { itemId: c.mattress, choice: "need", quantity: 1, sharerIds: [] },
        ],
        expectedVersion,
        actorId,
      });
    expect(fill(0, c.member.id)).toEqual({
      ok: false,
      error: NOT_A_RENTAL_MANAGER,
    });
    expect(rentalTestStore.getRentalOrderOf(c.friend.id, YEAR)).toBeNull();
    expect(fill(0)).toEqual({ ok: true, version: 1 });
    expect(fill(0)).toEqual({ ok: false, error: RENTAL_ORDER_MOVED });
    // A sent order can be changed again, on the version the captain saw.
    expect(fill(1)).toEqual({ ok: true, version: 2 });
    expect(fill(1)).toEqual({ ok: false, error: RENTAL_ORDER_MOVED });
    expect(rentalTestStore.getMyRental(c.friend.id, YEAR).order).toMatchObject({
      status: "submitted",
      filledByCaptain: true,
    });
    const order = rentalTestStore.getRentalOrderOf(c.friend.id, YEAR)!;
    rentalTestStore.confirmRentalOrder({
      orderId: order.id,
      expectedVersion: order.version,
      sources: [{ lineId: order.lines[0]!.id, source: "supplier" }],
      actorId: c.captain.id,
    });
    expect(fill(3)).toEqual({ ok: false, error: RENTAL_REOPEN_FIRST });
  });

  it("keeps a member's own tent for the site plan", () => {
    const c = camp();
    const save = rentalTestStore.saveRentalOrder({
      userId: c.member.id,
      cycle: YEAR,
      lines: [
        {
          itemId: c.tent,
          choice: "own",
          quantity: 1,
          sharerIds: [c.friend.id],
          ownDescription: "3-person dome",
          ownSleeps: 3,
        },
      ],
      submit: true,
      expectedVersion: 0,
    });
    expect(save.ok).toBe(true);
    expect(rentalTestStore.getRentalOverview(YEAR).ownTents).toMatchObject([
      {
        ownerName: "Nova",
        description: "3-person dome",
        sleeps: 3,
        sharers: ["Fay"],
      },
    ]);
    expect(
      rentalTestStore.getMyRental(c.friend.id, YEAR).sharedWithMe,
    ).toMatchObject([{ itemName: "3-person dome", ownerName: "Nova" }]);
    expect(rentalTestStore.getRentalOverview(YEAR).tents).toEqual([]);
  });

  it("adds the summary up from the confirmed orders, with the reserve", () => {
    const c = camp();
    const a = send(c);
    const b = send(c, c.friend.id);
    send(c, c.financeLead.id);
    rentalTestStore.confirmRentalOrder({
      orderId: a.order.id,
      expectedVersion: a.order.version,
      sources: a.sources("camp"),
      actorId: c.captain.id,
    });
    rentalTestStore.confirmRentalOrder({
      orderId: b.order.id,
      expectedVersion: b.order.version,
      sources: b.sources("supplier"),
      actorId: c.captain.id,
    });
    const overview = rentalTestStore.getRentalOverview(YEAR);
    expect(overview.waiting).toBe(1);
    expect(overview.summary.rows).toMatchObject([
      {
        name: "2-person tent",
        fromStorage: 1,
        toOrder: 1,
        campStockLeft: 0,
      },
      { name: "Mattress", fromStorage: 0, toOrder: 6, campStockLeft: null },
    ]);
    expect(overview.summary.chargedCents).toBe(26_000 + 41_000);
    expect(
      rentalTestStore
        .listRentalOrders(YEAR)
        .reduce((n, o) => n + (o.totalCents ?? 0), 0),
    ).toBe(overview.summary.chargedCents);
  });

  it("labels a tent only once its order is confirmed", () => {
    const c = camp();
    const { order, sources, tentLine } = send(c);
    const label = () =>
      rentalTestStore.setTentLabel({
        lineId: tentLine,
        label: "T3",
        actorId: c.captain.id,
      });
    expect(label()).toEqual({ ok: false, error: RENTAL_TENT_NOT_CONFIRMED });
    rentalTestStore.confirmRentalOrder({
      orderId: order.id,
      expectedVersion: order.version,
      sources: sources("camp"),
      actorId: c.captain.id,
    });
    expect(label()).toEqual({ ok: true });
    expect(
      rentalTestStore.getMyRental(c.friend.id, YEAR).sharedWithMe[0],
    ).toMatchObject({ tentLabel: "T3", confirmed: true });
    expect(rentalTestStore.getRentalOverview(YEAR).tents).toMatchObject([
      { tentLabel: "T3", ownerName: "Nova", sharers: ["Fay"] },
    ]);
  });
});
