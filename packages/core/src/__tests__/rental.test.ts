import { describe, expect, it } from "vitest";
import { RENTAL_SOURCES } from "@camp404/types";
import { auditActionLabel, auditDetail } from "../audit-actions";
import { formatMoney } from "../money";
import {
  campStockInUse,
  campStockTaken,
  canManageRental,
  checkRentalLines,
  holdsSharers,
  maxSharers,
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

  it("fits a tent's sleepers less the member, and nobody in anything else", () => {
    expect(maxSharers(TENT, 1)).toBe(1);
    expect(maxSharers(TENT, 2)).toBe(3);
    expect(maxSharers({ isTent: true, sleeps: 1 }, 1)).toBe(0);
    expect(maxSharers(MATTRESS, 3)).toBe(0);
  });
});

describe("holdsSharers", () => {
  // One 2-person tent shared with one person, and two shared with three.
  const lines = [
    { quantity: 1, sharers: 1 },
    { quantity: 2, sharers: 3 },
  ];

  it("holds while every line's sharers still fit", () => {
    expect(holdsSharers(TENT, lines)).toBe(true);
    expect(holdsSharers({ isTent: true, sleeps: 4 }, lines)).toBe(true);
    expect(holdsSharers({ isTent: true, sleeps: 1 }, [])).toBe(true);
    // Nobody shares: any size, and not a tent at all, is fine.
    expect(
      holdsSharers({ isTent: false, sleeps: 1 }, [{ quantity: 3, sharers: 0 }]),
    ).toBe(true);
  });

  it("fails for a tent made smaller, or one that stops being a tent", () => {
    expect(holdsSharers({ isTent: true, sleeps: 1 }, lines)).toBe(false);
    expect(holdsSharers({ isTent: false, sleeps: 1 }, lines)).toBe(false);
    expect(
      holdsSharers({ isTent: true, sleeps: 2 }, [{ quantity: 1, sharers: 2 }]),
    ).toBe(false);
  });
});

describe("checkRentalLines", () => {
  it("tidies an item the member has: one, with no sharers", () => {
    expect(
      checkRentalLines(
        ITEMS,
        [{ itemId: "tent", choice: "own", quantity: 4, sharerIds: ["b"] }],
        "a",
      ),
    ).toEqual({
      ok: true,
      lines: [{ itemId: "tent", choice: "own", quantity: 1, sharerIds: [] }],
    });
  });

  it("keeps a needed tent's sharers, once each", () => {
    expect(
      checkRentalLines(
        ITEMS,
        [
          {
            itemId: "tent",
            choice: "need",
            quantity: 2,
            sharerIds: ["b", "b"],
          },
        ],
        "a",
      ),
    ).toEqual({
      ok: true,
      lines: [
        { itemId: "tent", choice: "need", quantity: 2, sharerIds: ["b"] },
      ],
    });
  });

  it("refuses an item off the list, and the same item twice", () => {
    expect(
      checkRentalLines(
        ITEMS,
        [{ itemId: "gone", choice: "need", quantity: 1, sharerIds: [] }],
        "a",
      ),
    ).toEqual({ ok: false, error: RENTAL_ITEM_GONE });
    const line = {
      itemId: "mattress",
      choice: "need" as const,
      quantity: 1,
      sharerIds: [],
    };
    expect(checkRentalLines(ITEMS, [line, line], "a")).toEqual({
      ok: false,
      error: RENTAL_ITEM_GONE,
    });
  });

  it("refuses sharing with yourself, more sharers than fit, and sharing a mattress", () => {
    expect(
      checkRentalLines(
        ITEMS,
        [{ itemId: "tent", choice: "need", quantity: 1, sharerIds: ["a"] }],
        "a",
      ),
    ).toEqual({ ok: false, error: RENTAL_NOT_WITH_YOURSELF });
    expect(
      checkRentalLines(
        ITEMS,
        [
          {
            itemId: "tent",
            choice: "need",
            quantity: 1,
            sharerIds: ["b", "c"],
          },
        ],
        "a",
      ),
    ).toEqual({ ok: false, error: tooManySharers("2-person tent", 1) });
    expect(
      checkRentalLines(
        ITEMS,
        [{ itemId: "mattress", choice: "need", quantity: 1, sharerIds: ["b"] }],
        "a",
      ),
    ).toEqual({ ok: false, error: tooManySharers("Mattress", 0) });
  });
});

describe("rentalEstimate", () => {
  it("gives the cheapest and the dearest the needed items can come to", () => {
    expect(
      rentalEstimate(ITEMS, [
        { itemId: "tent", choice: "need", quantity: 1 },
        { itemId: "mattress", choice: "need", quantity: 2 },
      ]),
    ).toEqual({ lowCents: 26_000, highCents: 41_000 });
  });

  it("counts nothing for what the member has themselves", () => {
    expect(
      rentalEstimate(ITEMS, [{ itemId: "tent", choice: "own", quantity: 1 }]),
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
