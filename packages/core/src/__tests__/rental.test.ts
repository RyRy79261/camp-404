import { describe, expect, it } from "vitest";
import { RENTAL_SOURCES } from "@camp404/types";
import { auditActionLabel, auditDetail } from "../audit-actions";
import { notificationLink } from "../notification-links";
import { gearOrderAskNotification, payloadLink } from "../notifications";
import { formatMoney } from "../money";
import {
  campStockInUse,
  campStockTaken,
  canManageRental,
  checkRentalOrder,
  GEAR_ORDER_ACTION_TITLE,
  GEAR_ORDER_REF_TYPE,
  hostedElsewhere,
  isAskedForGear,
  noPriceFrom,
  notEnoughCampStock,
  priceRentalOrder,
  RENTAL_ITEM_GONE,
  RENTAL_NOT_WITH_YOURSELF,
  RENTAL_PICK_EVERY_SOURCE,
  rentalChargeDescription,
  rentalEstimate,
  rentalOrderState,
  rentalSources,
  rentalSummary,
  tentConflict,
  tentRoom,
  tentSleepsEnough,
  tooManySharers,
  type RentalPricedItem,
} from "../rental";

// Gear rental (#241): who runs it, what a member may send, what an order
// costs from each source, and the totals the camp orders. Prices are made up.

const TENT: RentalPricedItem = {
  id: "tent",
  name: "2-person tent",
  isTent: true,
  sleeps: 2,
  campPriceCents: 10_000,
  campStockCount: 4,
  supplierPriceCents: 25_000,
};
const MATTRESS: RentalPricedItem = {
  id: "mattress",
  name: "Mattress",
  isTent: false,
  sleeps: 1,
  campPriceCents: null,
  campStockCount: null,
  supplierPriceCents: 8_000,
};
const ITEMS = [TENT, MATTRESS];

describe("canManageRental", () => {
  it("lets a captain in and nobody else, whatever team they lead", () => {
    expect(canManageRental("captain", [])).toBe(true);
    expect(canManageRental("team_lead", ["finance"])).toBe(false);
    expect(canManageRental("team_lead", ["structures"])).toBe(false);
    expect(canManageRental("camp_member", [])).toBe(false);
  });

  it("fails closed on a rank it does not know", () => {
    expect(canManageRental("god", ["finance"])).toBe(false);
    expect(canManageRental("", [])).toBe(false);
  });
});

describe("Ask everyone", () => {
  it("asks a member who said Yes or was accepted, and nobody else", () => {
    expect(isAskedForGear("applied")).toBe(true);
    expect(isAskedForGear("accepted")).toBe(true);
    for (const status of ["maybe", "waitlisted", "not_attending"] as const) {
      expect(isAskedForGear(status)).toBe(false);
    }
    // No answer to "Coming this year?" at all.
    expect(isAskedForGear(null)).toBe(false);
  });

  it("sends a notice that opens My gear", () => {
    const notice = gearOrderAskNotification({
      requiredActionId: "11111111-1111-4111-8111-111111111111",
    });
    expect(notice).toMatchObject({
      kind: "questionnaire_reminder",
      title: GEAR_ORDER_ACTION_TITLE,
      refType: GEAR_ORDER_REF_TYPE,
      refId: "11111111-1111-4111-8111-111111111111",
    });
    expect(payloadLink(notice)).toBe("/gear");
    // The E2E store has no row id to point at; the link does not need one.
    expect(notificationLink(GEAR_ORDER_REF_TYPE, null)).toBe("/gear");
  });
});

describe("rentalOrderState", () => {
  it("calls a confirmed order with a charge charged", () => {
    expect(rentalOrderState({ status: "draft", chargeId: null })).toBe("draft");
    expect(rentalOrderState({ status: "submitted", chargeId: null })).toBe(
      "submitted",
    );
    expect(rentalOrderState({ status: "confirmed", chargeId: null })).toBe(
      "confirmed",
    );
    expect(rentalOrderState({ status: "confirmed", chargeId: "c1" })).toBe(
      "charged",
    );
  });
});

describe("the catalogue", () => {
  it("offers only the sources the item has", () => {
    expect(rentalSources(TENT)).toEqual([...RENTAL_SOURCES]);
    expect(rentalSources(MATTRESS)).toEqual(["supplier"]);
    // A camp price with no count is not camp stock.
    expect(rentalSources({ ...TENT, campStockCount: null })).toEqual([
      "supplier",
    ]);
  });
});

describe("checkRentalOrder", () => {
  const order = (
    tent: Parameters<typeof checkRentalOrder>[1]["tent"],
    lines: Parameters<typeof checkRentalOrder>[1]["lines"] = [],
  ) => checkRentalOrder(ITEMS, { tent, lines }, "a");

  it("takes one tent answer, whatever tents the catalogue holds", () => {
    expect(order({ choice: "need", people: 2, sharerIds: ["b", "b"] })).toEqual(
      {
        ok: true,
        tent: {
          choice: "need",
          people: 2,
          ownDescription: null,
          ownSleeps: null,
          sharerIds: ["b"],
        },
        lines: [],
      },
    );
    expect(
      order({
        choice: "own",
        ownDescription: "  3-person dome ",
        ownSleeps: 3,
        sharerIds: ["b", "c"],
      }),
    ).toEqual({
      ok: true,
      tent: {
        choice: "own",
        people: null,
        ownDescription: "3-person dome",
        ownSleeps: 3,
        sharerIds: ["b", "c"],
      },
      lines: [],
    });
    // In someone else's tent: it names nobody, so it cannot disagree.
    expect(order({ choice: "shared" })).toEqual({
      ok: true,
      tent: {
        choice: "shared",
        people: null,
        ownDescription: null,
        ownSleeps: null,
        sharerIds: [],
      },
      lines: [],
    });
    // No tent answer at all is an answer about the bedding only.
    expect(order(null)).toEqual({ ok: true, tent: null, lines: [] });
  });

  it("leaves a tent of their own optional in what it is and how many it sleeps", () => {
    expect(order({ choice: "own", sharerIds: [] })).toMatchObject({
      ok: true,
      tent: { choice: "own", ownDescription: null, ownSleeps: null },
    });
  });

  it("never takes a catalogue tent as a line: the member does not pick one", () => {
    expect(
      order(null, [{ itemId: "tent", choice: "need", quantity: 1 }]),
    ).toEqual({ ok: false, error: RENTAL_ITEM_GONE });
  });

  it("tidies the other items: one of what they have, and each item once", () => {
    expect(
      order(null, [{ itemId: "mattress", choice: "own", quantity: 4 }]),
    ).toEqual({
      ok: true,
      tent: null,
      lines: [{ itemId: "mattress", choice: "own", quantity: 1 }],
    });
    const line = { itemId: "mattress", choice: "need" as const, quantity: 2 };
    expect(order(null, [line])).toMatchObject({ ok: true, lines: [line] });
    expect(order(null, [line, line])).toEqual({
      ok: false,
      error: RENTAL_ITEM_GONE,
    });
    expect(
      order(null, [{ itemId: "gone", choice: "need", quantity: 1 }]),
    ).toEqual({ ok: false, error: RENTAL_ITEM_GONE });
  });

  it("refuses sharing with yourself, and more sharers than the tent is for", () => {
    expect(order({ choice: "need", people: 2, sharerIds: ["a"] })).toEqual({
      ok: false,
      error: RENTAL_NOT_WITH_YOURSELF,
    });
    expect(order({ choice: "need", people: 2, sharerIds: ["b", "c"] })).toEqual(
      { ok: false, error: tooManySharers(1) },
    );
    expect(order({ choice: "need", people: 1, sharerIds: ["b"] })).toEqual({
      ok: false,
      error: tooManySharers(0),
    });
    // A tent of their own sleeps what they say it does; one when they do not.
    expect(
      order({ choice: "own", ownSleeps: 3, sharerIds: ["b", "c", "d"] }),
    ).toEqual({ ok: false, error: tooManySharers(2) });
    expect(order({ choice: "own", sharerIds: ["b"] })).toEqual({
      ok: false,
      error: tooManySharers(0),
    });
  });

  it("knows how much room each answer has", () => {
    expect(tentRoom({ choice: "need", people: 4 })).toBe(3);
    expect(tentRoom({ choice: "own", ownSleeps: 2 })).toBe(1);
    expect(tentRoom({ choice: "own" })).toBe(0);
    expect(tentRoom({ choice: "shared" })).toBe(0);
  });
});

describe("tentConflict", () => {
  const free = { name: "Fay", hasOwnAnswer: false, inAnotherTent: false };

  it("lets a sent order through when nobody else says otherwise", () => {
    for (const choice of ["own", "need", "shared"] as const) {
      expect(
        tentConflict({ tent: { choice }, hostName: null, sharers: [free] }),
      ).toBeNull();
    }
    expect(
      tentConflict({ tent: null, hostName: "Dee", sharers: [] }),
    ).toBeNull();
  });

  it("refuses a tent of their own, or a needed one, for a member already in someone's tent", () => {
    for (const choice of ["own", "need"] as const) {
      expect(
        tentConflict({ tent: { choice }, hostName: "Dee", sharers: [] }),
      ).toBe(hostedElsewhere("Dee"));
    }
    // "I'm in someone else's tent" agrees with the host's order.
    expect(
      tentConflict({
        tent: { choice: "shared" },
        hostName: "Dee",
        sharers: [],
      }),
    ).toBeNull();
  });

  it("refuses a sharer who has their own answer, or is in another tent", () => {
    expect(
      tentConflict({
        tent: { choice: "need" },
        hostName: null,
        sharers: [free, { ...free, name: "Sam", hasOwnAnswer: true }],
      }),
    ).toContain("Sam says they have their own tent or need one.");
    expect(
      tentConflict({
        tent: { choice: "own" },
        hostName: null,
        sharers: [{ ...free, inAnotherTent: true }],
      }),
    ).toBe("Fay is already in someone else's tent.");
  });
});

describe("the captain's tent pick", () => {
  it("warns, never refuses, when the tent sleeps fewer than it is for", () => {
    expect(tentSleepsEnough(TENT, 2)).toBe(true);
    expect(tentSleepsEnough(TENT, 1)).toBe(true);
    expect(tentSleepsEnough(TENT, 3)).toBe(false);
    expect(tentSleepsEnough(TENT, null)).toBe(true);
  });
});

describe("rentalEstimate", () => {
  const BIG: RentalPricedItem = {
    id: "big",
    name: "4-person tent",
    isTent: true,
    sleeps: 4,
    campPriceCents: null,
    campStockCount: null,
    supplierPriceCents: 70_000,
  };

  it("prices a needed tent as a range across every tent and source, never one tent", () => {
    // 2-person: 100 camp, 250 supplier; 4-person: 700 supplier.
    expect(
      rentalEstimate([...ITEMS, BIG], { tent: { choice: "need" }, lines: [] }),
    ).toEqual({ lowCents: 10_000, highCents: 70_000 });
  });

  it("adds the other items across their sources", () => {
    expect(
      rentalEstimate(ITEMS, {
        tent: { choice: "need" },
        lines: [{ itemId: "mattress", choice: "need", quantity: 2 }],
      }),
    ).toEqual({ lowCents: 26_000, highCents: 41_000 });
  });

  it("counts nothing for a tent of their own, someone else's tent, or what they have", () => {
    for (const choice of ["own", "shared"] as const) {
      expect(
        rentalEstimate(ITEMS, {
          tent: { choice },
          lines: [{ itemId: "mattress", choice: "own", quantity: 1 }],
        }),
      ).toEqual({ lowCents: 0, highCents: 0 });
    }
    // A catalogue with no tent in it has no tent price to show.
    expect(
      rentalEstimate([MATTRESS], { tent: { choice: "need" }, lines: [] }),
    ).toEqual({ lowCents: 0, highCents: 0 });
  });
});

describe("priceRentalOrder", () => {
  const lines = [
    { id: "l1", itemId: "tent", choice: "need" as const, quantity: 1 },
    { id: "l2", itemId: "mattress", choice: "need" as const, quantity: 2 },
    { id: "l3", itemId: "tent2", choice: "own" as const, quantity: 1 },
  ];

  it("prices each needed line from the source the captain picked", () => {
    const priced = priceRentalOrder(ITEMS, lines, [
      { lineId: "l1", source: "camp" },
      { lineId: "l2", source: "supplier" },
    ]);
    expect(priced).toEqual({
      ok: true,
      totalCents: 26_000,
      lines: [
        {
          lineId: "l1",
          itemName: "2-person tent",
          quantity: 1,
          source: "camp",
          unitPriceCents: 10_000,
          lineCents: 10_000,
        },
        {
          lineId: "l2",
          itemName: "Mattress",
          quantity: 2,
          source: "supplier",
          unitPriceCents: 8_000,
          lineCents: 16_000,
        },
      ],
    });
  });

  it("charges the supplier's price when the captain picks the supplier", () => {
    const priced = priceRentalOrder(ITEMS, lines, [
      { lineId: "l1", source: "supplier" },
      { lineId: "l2", source: "supplier" },
    ]);
    expect(priced.ok && priced.totalCents).toBe(41_000);
  });

  it("refuses a missing source, an extra one, and one for an owned line", () => {
    const refused = { ok: false, error: RENTAL_PICK_EVERY_SOURCE };
    expect(
      priceRentalOrder(ITEMS, lines, [{ lineId: "l1", source: "camp" }]),
    ).toEqual(refused);
    expect(
      priceRentalOrder(ITEMS, lines, [
        { lineId: "l1", source: "camp" },
        { lineId: "l2", source: "supplier" },
        { lineId: "l3", source: "camp" },
      ]),
    ).toEqual(refused);
    expect(
      priceRentalOrder(ITEMS, lines, [
        { lineId: "l1", source: "camp" },
        { lineId: "l1", source: "supplier" },
      ]),
    ).toEqual(refused);
  });

  it("refuses a source the item has no price from", () => {
    expect(
      priceRentalOrder(ITEMS, lines, [
        { lineId: "l1", source: "camp" },
        { lineId: "l2", source: "camp" },
      ]),
    ).toEqual({ ok: false, error: noPriceFrom("Mattress", "camp") });
  });

  it("refuses camp stock for more than the camp has left", () => {
    const sources = [
      { lineId: "l1", source: "camp" as const },
      { lineId: "l2", source: "supplier" as const },
    ];
    // The camp has 4 tents: 3 taken leaves 1, which this order may have.
    expect(
      priceRentalOrder(ITEMS, lines, sources, new Map([["tent", 3]])).ok,
    ).toBe(true);
    // 4 taken leaves none.
    expect(
      priceRentalOrder(ITEMS, lines, sources, new Map([["tent", 4]])),
    ).toEqual({
      ok: false,
      error: notEnoughCampStock("2-person tent", 4, 0),
    });
    // Two asked for, one left.
    expect(
      priceRentalOrder(
        ITEMS,
        [{ ...lines[0]!, quantity: 2 }],
        [sources[0]!],
        new Map([["tent", 3]]),
      ),
    ).toEqual({
      ok: false,
      error: notEnoughCampStock("2-person tent", 4, 1),
    });
    // The supplier is never limited by the camp's count.
    expect(
      priceRentalOrder(
        ITEMS,
        lines,
        [
          { lineId: "l1", source: "supplier" },
          { lineId: "l2", source: "supplier" },
        ],
        new Map([["tent", 99]]),
      ).ok,
    ).toBe(true);
  });

  it("says what is left in words a captain can act on", () => {
    expect(notEnoughCampStock("Tent", 4, 0)).toBe(
      "The camp has 4 of Tent and none are left. Pick the supplier, or raise the count in the catalogue.",
    );
    expect(notEnoughCampStock("Tent", 4, 1)).toContain("only 1 is left");
    expect(notEnoughCampStock("Tent", 4, 2)).toContain("only 2 are left");
    expect(campStockInUse("Tent", 1)).toContain("1 of Tent is already");
  });

  it("counts a camp reserve as taken, and a supplier reserve not", () => {
    expect(campStockTaken({ reserveCount: 2, reserveSource: "camp" }, 3)).toBe(
      5,
    );
    expect(
      campStockTaken({ reserveCount: 2, reserveSource: "supplier" }, 3),
    ).toBe(3);
  });

  it("comes to nothing for an order of owned items only", () => {
    expect(priceRentalOrder(ITEMS, [lines[2]!], [])).toEqual({
      ok: true,
      lines: [],
      totalCents: 0,
    });
  });
});

describe("rentalChargeDescription", () => {
  it("names each item and how many", () => {
    expect(
      rentalChargeDescription([
        { itemName: "2-person tent", quantity: 1 },
        { itemName: "Mattress", quantity: 2 },
      ]),
    ).toBe("Gear rental: 1 × 2-person tent, 2 × Mattress");
  });

  it("stays within the charge's 200 characters", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      itemName: `A rather long item name ${i}`,
      quantity: 1,
    }));
    expect(rentalChargeDescription(many).length).toBe(200);
  });
});

describe("rentalSummary", () => {
  const items = [
    {
      id: "tent",
      name: "2-person tent",
      campStockCount: 4 as number | null,
      reserveCount: 3,
      reserveSource: "supplier" as const,
    },
    {
      id: "mattress",
      name: "Mattress",
      campStockCount: 3 as number | null,
      reserveCount: 2,
      reserveSource: "camp" as const,
    },
    {
      id: "pillow",
      name: "Pillow",
      campStockCount: null,
      reserveCount: 0,
      reserveSource: "supplier" as const,
    },
  ];
  // Three members' confirmed lines.
  const lines = [
    {
      itemId: "tent",
      quantity: 1,
      source: "camp" as const,
      unitPriceCents: 10_000,
    },
    {
      itemId: "tent",
      quantity: 1,
      source: "supplier" as const,
      unitPriceCents: 25_000,
    },
    {
      itemId: "tent",
      quantity: 2,
      source: "supplier" as const,
      unitPriceCents: 25_000,
    },
    {
      itemId: "mattress",
      quantity: 2,
      source: "supplier" as const,
      unitPriceCents: 8_000,
    },
    {
      itemId: "mattress",
      quantity: 1,
      source: "camp" as const,
      unitPriceCents: 3_000,
    },
  ];

  it("splits each item by source and adds the reserve to its source", () => {
    const summary = rentalSummary(items, lines);
    expect(summary.rows).toEqual([
      {
        itemId: "tent",
        name: "2-person tent",
        campCount: 1,
        supplierCount: 3,
        reserveCount: 3,
        reserveSource: "supplier",
        fromStorage: 1,
        campStockCount: 4,
        campStockLeft: 3,
        toOrder: 6,
        campCents: 10_000,
        supplierCents: 75_000,
      },
      {
        itemId: "mattress",
        name: "Mattress",
        campCount: 1,
        supplierCount: 2,
        reserveCount: 2,
        reserveSource: "camp",
        fromStorage: 3,
        campStockCount: 3,
        campStockLeft: 0,
        toOrder: 2,
        campCents: 3_000,
        supplierCents: 16_000,
      },
      {
        itemId: "pillow",
        name: "Pillow",
        campCount: 0,
        supplierCount: 0,
        reserveCount: 0,
        reserveSource: "supplier",
        fromStorage: 0,
        campStockCount: null,
        campStockLeft: null,
        toOrder: 0,
        campCents: 0,
        supplierCents: 0,
      },
    ]);
    expect(summary.fromStorage).toBe(4);
    expect(summary.toOrder).toBe(8);
  });

  it("charges exactly the sum of the orders' lines", () => {
    const summary = rentalSummary(items, lines);
    const sum = (source: string) =>
      lines
        .filter((l) => l.source === source)
        .reduce((n, l) => n + l.quantity * l.unitPriceCents, 0);
    expect(summary.supplierCents).toBe(sum("supplier"));
    expect(summary.campCents).toBe(sum("camp"));
    expect(summary.chargedCents).toBe(sum("supplier") + sum("camp"));
    // Without the reserve, the counts are the orders' quantities.
    const members = rentalSummary(
      items.map((i) => ({ ...i, reserveCount: 0 })),
      lines,
    );
    expect(members.toOrder).toBe(
      lines
        .filter((l) => l.source === "supplier")
        .reduce((n, l) => n + l.quantity, 0),
    );
  });
});

describe("the audit trail's words", () => {
  it("labels and details the rental actions", () => {
    expect(auditActionLabel("rental.order_confirmed")).toBe(
      "Confirmed a member's gear order",
    );
    expect(auditDetail("rental.order_confirmed", { totalCents: 26_000 })).toBe(
      formatMoney(26_000),
    );
    expect(auditDetail("rental.order_reopened", {})).toBeNull();
    expect(auditActionLabel("rental.orders_asked")).toBe(
      "Asked members for their gear orders",
    );
    expect(auditDetail("rental.orders_asked", { asked: 1 })).toBe("1 member");
    expect(auditDetail("rental.orders_asked", { asked: 12 })).toBe(
      "12 members",
    );
    expect(auditActionLabel("rental.order_filled")).toBe(
      "Filled in a member's gear order for them",
    );
    expect(auditDetail("rental.item_added", { name: "Mattress" })).toBe(
      "Mattress",
    );
    expect(
      auditDetail("rental.tent_labelled", { name: "Tent", label: "T3" }),
    ).toBe("Tent, T3");
    expect(
      auditDetail("rental.tent_labelled", { name: "Tent", label: null }),
    ).toBe("Tent, label removed");
  });
});
