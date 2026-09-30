import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  GEAR_ORDER_REF_TYPE,
  hostedElsewhere,
  notEnoughCampStock,
  RENTAL_ITEM_GONE,
  RENTAL_PICK_A_TENT,
} from "@camp404/core";
import type { CampConfig, TeamsConfig } from "@camp404/db/camp-config";
import {
  NOT_A_RENTAL_MANAGER,
  RENTAL_KIND_IN_USE,
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
// member reads only their own order, the tent is asked once and a captain
// picks the actual tent, two orders cannot disagree about who is in whose
// tent, the confirmation is a compare-and-set that charges the dues twin,
// camp stock cannot be given out twice, and the summary adds up. Prices are
// made up.

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
  const other = user("Otto");
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
    other,
    tent: add(TENT),
    mattress: add(MATTRESS),
  };
}

/** A tent for the member and whoever shares it, and two mattresses. */
function send(
  c: ReturnType<typeof camp>,
  userId = c.member.id,
  sharerIds: string[] = userId === c.member.id ? [c.friend.id] : [],
) {
  const res = rentalTestStore.saveRentalOrder({
    userId,
    cycle: YEAR,
    tent: { choice: "need", people: sharerIds.length + 1, sharerIds },
    lines: [{ itemId: c.mattress, choice: "need", quantity: 2 }],
    submit: true,
    expectedVersion: 0,
  });
  if (!res.ok) throw new Error(res.error);
  const order = rentalTestStore.getRentalOrderOf(userId, YEAR)!;
  const mattressLine = order.lines.find((l) => l.itemId === c.mattress)!.id;
  return {
    order,
    confirm: (source: "camp" | "supplier", actorId = c.captain.id) =>
      rentalTestStore.confirmRentalOrder({
        orderId: order.id,
        expectedVersion: order.version,
        tent: { itemId: c.tent, source },
        sources: [{ lineId: mattressLine, source: "supplier" }],
        actorId,
      }),
  };
}

beforeEach(() => {
  testStore.reset();
  foundedAt(YEAR);
});

describe("the gear rental twin", () => {
  it("lets only a captain run it: a Finance lead and a member are refused", () => {
    const c = camp();
    const s = send(c);
    const refused = { ok: false, error: NOT_A_RENTAL_MANAGER };
    for (const actor of [c.financeLead, c.member]) {
      expect(
        rentalTestStore.addRentalItem({
          cycle: YEAR,
          item: MATTRESS,
          actorId: actor.id,
        }),
      ).toEqual(refused);
      expect(s.confirm("camp", actor.id)).toEqual(refused);
    }
    expect(rentalTestStore.listRentalItems(YEAR)).toHaveLength(2);
    expect(rentalTestStore.getRentalOrderOf(c.member.id, YEAR)?.status).toBe(
      "submitted",
    );
  });

  it("asks about a tent once, and never takes a catalogue tent from a member", () => {
    const c = camp();
    expect(
      rentalTestStore.saveRentalOrder({
        userId: c.member.id,
        cycle: YEAR,
        tent: null,
        lines: [{ itemId: c.tent, choice: "need", quantity: 1 }],
        submit: true,
        expectedVersion: 0,
      }),
    ).toEqual({ ok: false, error: RENTAL_ITEM_GONE });
    send(c);
    const mine = rentalTestStore.getMyRental(c.member.id, YEAR).order!;
    expect(mine.tent).toMatchObject({
      choice: "need",
      people: 2,
      assigned: null,
      // No place is shown to a member.
      sharers: [{ id: c.friend.id, name: "Fay", accepted: null }],
    });
    expect(mine.lines.map((l) => l.itemName)).toEqual(["Mattress"]);
  });

  it("shows a member their own order only, and a sharer whose tent they are in", () => {
    const c = camp();
    send(c);
    const friends = rentalTestStore.getMyRental(c.friend.id, YEAR);
    expect(friends.order).toBeNull();
    expect(friends.sharedWithMe).toMatchObject([
      { tentName: "A camp tent", ownerName: "Nova", confirmed: false },
    ]);
    expect(
      rentalTestStore.getMyRental(c.captain.id, YEAR).sharedWithMe,
    ).toEqual([]);
  });

  it("never lets two orders disagree about who is in whose tent", () => {
    const c = camp();
    send(c); // Nova's tent, with Fay in it.
    const fay = (
      tent: Parameters<typeof rentalTestStore.saveRentalOrder>[0]["tent"],
    ) =>
      rentalTestStore.saveRentalOrder({
        userId: c.friend.id,
        cycle: YEAR,
        tent,
        lines: [],
        submit: true,
        expectedVersion: 0,
      });
    expect(fay({ choice: "own", sharerIds: [] })).toEqual({
      ok: false,
      error: hostedElsewhere("Nova"),
    });
    expect(fay({ choice: "need", people: 1, sharerIds: [] })).toEqual({
      ok: false,
      error: hostedElsewhere("Nova"),
    });
    // Otto cannot take Fay into his tent too.
    expect(
      rentalTestStore.saveRentalOrder({
        userId: c.other.id,
        cycle: YEAR,
        tent: { choice: "own", ownSleeps: 2, sharerIds: [c.friend.id] },
        lines: [],
        submit: true,
        expectedVersion: 0,
      }),
    ).toEqual({ ok: false, error: "Fay is already in someone else's tent." });
    expect(fay({ choice: "shared" })).toMatchObject({ ok: true });
    expect(
      rentalTestStore.getRentalOrderOf(c.friend.id, YEAR)?.hostedBy,
    ).toEqual(["Nova"]);
  });

  it("confirms once, with the tent the captain picked, and charges the dues twin", () => {
    const c = camp();
    const s = send(c);
    // Only a draft changes: a sent order is taken back first.
    expect(
      rentalTestStore.saveRentalOrder({
        userId: c.member.id,
        cycle: YEAR,
        tent: null,
        lines: [],
        submit: false,
        expectedVersion: s.order.version,
      }),
    ).toEqual({ ok: false, error: RENTAL_ORDER_SENT });
    // A member who needs a tent cannot be confirmed without one.
    expect(
      rentalTestStore.confirmRentalOrder({
        orderId: s.order.id,
        expectedVersion: s.order.version,
        sources: [{ lineId: s.order.lines[0]!.id, source: "supplier" }],
        actorId: c.captain.id,
      }),
    ).toEqual({ ok: false, error: RENTAL_PICK_A_TENT });
    expect(
      rentalTestStore.confirmRentalOrder({
        orderId: s.order.id,
        expectedVersion: s.order.version + 1,
        tent: { itemId: c.tent, source: "camp" },
        sources: [{ lineId: s.order.lines[0]!.id, source: "supplier" }],
        actorId: c.captain.id,
      }),
    ).toEqual({ ok: false, error: RENTAL_ORDER_MOVED });
    expect(s.confirm("camp")).toEqual({
      ok: true,
      totalCents: 26_000,
      chargeId: expect.any(String),
    });
    expect(s.confirm("camp")).toEqual({ ok: false, error: RENTAL_ORDER_MOVED });
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
    expect(
      rentalTestStore.getMyRental(c.member.id, YEAR).order?.tent?.assigned,
    ).toMatchObject({
      itemName: "2-person tent",
      source: "camp",
      unitPriceCents: 10_000,
    });
    // Reopened: the charge is cancelled and the order can change.
    expect(
      rentalTestStore.reopenRentalOrder({
        orderId: s.order.id,
        expectedVersion: s.order.version + 1,
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
    // A reopened order is not counted: its tent is a need again.
    expect(rentalTestStore.getRentalOverview(YEAR)).toMatchObject({
      waiting: 1,
      confirmed: 0,
      tents: [],
      unassigned: [{ ownerName: "Nova", people: 2, sharers: ["Fay"] }],
      summary: { chargedCents: 0, fromStorage: 0, toOrder: 2 },
    });
    // The member does not see the pick of a reopened order.
    expect(
      rentalTestStore.getMyRental(c.member.id, YEAR).order?.tent?.assigned,
    ).toBeNull();
  });

  it("charges nothing for a member's own tent, and keeps it for the site plan", () => {
    const c = camp();
    const save = rentalTestStore.saveRentalOrder({
      userId: c.member.id,
      cycle: YEAR,
      tent: {
        choice: "own",
        ownDescription: "3-person dome",
        ownSleeps: 3,
        sharerIds: [c.friend.id],
      },
      lines: [],
      submit: true,
      expectedVersion: 0,
    });
    expect(save.ok).toBe(true);
    const overview = rentalTestStore.getRentalOverview(YEAR);
    expect(overview.ownTents).toMatchObject([
      {
        ownerName: "Nova",
        description: "3-person dome",
        sleeps: 3,
        sharers: ["Fay"],
      },
    ]);
    expect(overview.tents).toEqual([]);
    expect(overview.unassigned).toEqual([]);
    expect(
      rentalTestStore.getMyRental(c.friend.id, YEAR).sharedWithMe,
    ).toMatchObject([{ tentName: "3-person dome", ownerName: "Nova" }]);
    const order = rentalTestStore.getRentalOrderOf(c.member.id, YEAR)!;
    expect(
      rentalTestStore.confirmRentalOrder({
        orderId: order.id,
        expectedVersion: order.version,
        sources: [],
        actorId: c.captain.id,
      }),
    ).toEqual({ ok: true, totalCents: 0, chargeId: null });
    expect(
      duesTestStore.getMemberDues(c.member.id, YEAR, { forFinance: false })
        ?.charges,
    ).toEqual([]);
  });

  it("keeps an item a tent, or not a tent, while orders have it", () => {
    const c = camp();
    const edit = (itemId: string, item: RentalItemInput) =>
      rentalTestStore.editRentalItem({ itemId, item, actorId: c.captain.id });
    // Nothing has the mattress yet: it may still be turned into a tent.
    expect(edit(c.mattress, { ...MATTRESS, isTent: true, sleeps: 2 })).toEqual({
      ok: true,
    });
    expect(edit(c.mattress, MATTRESS)).toEqual({ ok: true });
    send(c).confirm("camp");
    const refused = { ok: false, error: RENTAL_KIND_IN_USE };
    expect(edit(c.mattress, { ...MATTRESS, isTent: true, sleeps: 2 })).toEqual(
      refused,
    );
    expect(edit(c.tent, { ...TENT, isTent: false, sleeps: 1 })).toEqual(
      refused,
    );
    expect(edit(c.tent, { ...TENT, sleeps: 3 })).toEqual({ ok: true });
  });

  it("refuses camp stock that is already given out", () => {
    const c = camp();
    send(c).confirm("camp");
    const second = send(c, c.other.id);
    // The camp has one tent, and the first order took it.
    expect(second.confirm("camp")).toEqual({
      ok: false,
      error: notEnoughCampStock("2-person tent", 1, 0),
    });
    const after = rentalTestStore.getRentalOrderOf(c.other.id, YEAR)!;
    expect(after.status).toBe("submitted");
    // Refused whole: no tent was left on the order.
    expect(after.tent?.assigned).toBeNull();
    expect(second.confirm("supplier").ok).toBe(true);
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
    send(c, c.member.id, []);
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
        tent: { choice: "need", people: 1, sharerIds: [] },
        lines: [{ itemId: c.mattress, choice: "need", quantity: 1 }],
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
      tent: { choice: "need", people: 1 },
    });
    const order = rentalTestStore.getRentalOrderOf(c.friend.id, YEAR)!;
    rentalTestStore.confirmRentalOrder({
      orderId: order.id,
      expectedVersion: order.version,
      tent: { itemId: c.tent, source: "supplier" },
      sources: [{ lineId: order.lines[0]!.id, source: "supplier" }],
      actorId: c.captain.id,
    });
    expect(fill(3)).toEqual({ ok: false, error: RENTAL_REOPEN_FIRST });
  });

  it("adds the summary up from the tents captains picked, with the reserve", () => {
    const c = camp();
    const a = send(c);
    const b = send(c, c.other.id);
    send(c, c.financeLead.id);
    a.confirm("camp");
    b.confirm("supplier");
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
    expect(overview.unassigned).toMatchObject([
      { ownerName: "Fin", people: 1 },
    ]);
    expect(overview.summary.chargedCents).toBe(26_000 + 41_000);
    expect(
      rentalTestStore
        .listRentalOrders(YEAR)
        .reduce((n, o) => n + (o.totalCents ?? 0), 0),
    ).toBe(overview.summary.chargedCents);
  });

  it("labels the tent a captain picked, once its order is confirmed", () => {
    const c = camp();
    const s = send(c);
    const mattress = s.order.lines[0]!.id;
    expect(
      rentalTestStore.setTentLabel({
        lineId: mattress,
        label: "T3",
        actorId: c.captain.id,
      }),
    ).toEqual({ ok: false, error: RENTAL_TENT_NOT_CONFIRMED });
    s.confirm("camp");
    const tentLine = rentalTestStore.getRentalOrderOf(c.member.id, YEAR)!.tent!
      .assigned!.id;
    expect(
      rentalTestStore.setTentLabel({
        lineId: tentLine,
        label: "T3",
        actorId: c.captain.id,
      }),
    ).toEqual({ ok: true });
    expect(
      rentalTestStore.getMyRental(c.friend.id, YEAR).sharedWithMe[0],
    ).toMatchObject({
      tentName: "2-person tent",
      tentLabel: "T3",
      confirmed: true,
    });
    expect(rentalTestStore.getRentalOverview(YEAR).tents).toMatchObject([
      { tentLabel: "T3", ownerName: "Nova", sharers: ["Fay"], people: 2 },
    ]);
  });
});
