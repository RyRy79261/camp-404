import { describe, expect, it } from "vitest";
import {
  ConfirmRentalOrderInput,
  FillRentalOrderInput,
  RENTAL_MAX_QUANTITY,
  RentalItemInput,
  SaveRentalOrderInput,
  TentLabelInput,
} from "../rental";

// Gear rental (#241): what the boundary lets through. Prices are made up.

const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";

const item = {
  name: "  2-person tent ",
  isTent: true,
  sleeps: 2,
  campPriceCents: 10_000,
  campStockCount: 4,
  supplierPriceCents: 25_000,
  reserveCount: 0,
  reserveSource: "supplier",
};

describe("RentalItemInput", () => {
  it("takes a tent with both prices and trims its name", () => {
    const parsed = RentalItemInput.parse(item);
    expect(parsed.name).toBe("2-person tent");
  });

  it("takes an item the camp has none of, and one only the camp has", () => {
    expect(
      RentalItemInput.safeParse({
        ...item,
        campPriceCents: null,
        campStockCount: null,
      }).success,
    ).toBe(true);
    expect(
      RentalItemInput.safeParse({ ...item, supplierPriceCents: null }).success,
    ).toBe(true);
  });

  it("refuses camp stock with a price and no count, a count and no price, or none of them", () => {
    for (const bad of [
      { campStockCount: null },
      { campPriceCents: null },
      { campStockCount: 0 },
      { campStockCount: 1.5 },
    ]) {
      expect(RentalItemInput.safeParse({ ...item, ...bad }).success).toBe(
        false,
      );
    }
  });

  it("refuses an item with no price, a negative price and a fraction of a cent", () => {
    for (const bad of [
      { campPriceCents: null, campStockCount: null, supplierPriceCents: null },
      { campPriceCents: -1 },
      { supplierPriceCents: 10.5 },
    ]) {
      expect(RentalItemInput.safeParse({ ...item, ...bad }).success).toBe(
        false,
      );
    }
  });

  it("refuses a mattress that sleeps two, and a tent that sleeps none", () => {
    expect(
      RentalItemInput.safeParse({ ...item, isTent: false, sleeps: 2 }).success,
    ).toBe(false);
    expect(RentalItemInput.safeParse({ ...item, sleeps: 0 }).success).toBe(
      false,
    );
  });

  it("refuses a reserve from a source the item does not have, or more than the camp has", () => {
    const supplierOnly = {
      ...item,
      campPriceCents: null,
      campStockCount: null,
    };
    expect(
      RentalItemInput.safeParse({
        ...supplierOnly,
        reserveCount: 2,
        reserveSource: "camp",
      }).success,
    ).toBe(false);
    expect(
      RentalItemInput.safeParse({
        ...supplierOnly,
        reserveCount: 2,
        reserveSource: "supplier",
      }).success,
    ).toBe(true);
    expect(
      RentalItemInput.safeParse({
        ...item,
        reserveCount: 5,
        reserveSource: "camp",
      }).success,
    ).toBe(false);
    expect(
      RentalItemInput.safeParse({
        ...item,
        reserveCount: 4,
        reserveSource: "camp",
      }).success,
    ).toBe(true);
  });
});

describe("SaveRentalOrderInput", () => {
  const line = { itemId: ID, choice: "need", quantity: 1 };
  const save = (extra: object) =>
    SaveRentalOrderInput.safeParse({
      lines: [],
      submit: false,
      expectedVersion: 0,
      ...extra,
    });

  it("takes one tent answer and a line per other item", () => {
    const parsed = save({
      tent: { choice: "need", people: 2, sharerIds: ["member-2"] },
      lines: [line, { ...line, itemId: ID2, choice: "own" }],
    });
    expect(parsed.success && parsed.data.tent).toEqual({
      choice: "need",
      people: 2,
      sharerIds: ["member-2"],
    });
  });

  it("takes each tent answer, and no answer at all", () => {
    expect(save({ tent: { choice: "shared" } }).success).toBe(true);
    expect(save({ tent: null }).success).toBe(true);
    // An order saved before the tent question existed has no `tent` key.
    const old = save({});
    expect(old.success && old.data.tent).toBeNull();
    const own = save({
      tent: {
        choice: "own",
        ownDescription: " 3-person dome ",
        ownSleeps: 3,
        sharerIds: [],
      },
    });
    expect(own.success && own.data.tent).toEqual({
      choice: "own",
      ownDescription: "3-person dome",
      ownSleeps: 3,
      sharerIds: [],
    });
    // What it is and how many it sleeps are optional, and a blank is none.
    const bare = save({
      tent: { choice: "own", ownDescription: "  ", sharerIds: [] },
    });
    expect(bare.success && bare.data.tent).toEqual({
      choice: "own",
      ownDescription: null,
      ownSleeps: null,
      sharerIds: [],
    });
  });

  it("refuses a tent answer that is not one of the three, or out of range", () => {
    for (const tent of [
      { choice: "rent", sharerIds: [] },
      { choice: "need", sharerIds: [] },
      { choice: "need", people: 0, sharerIds: [] },
      { choice: "need", people: 13, sharerIds: [] },
      { choice: "own", ownSleeps: 13, sharerIds: [] },
      { choice: "own", ownDescription: "x".repeat(61), sharerIds: [] },
    ]) {
      expect(save({ tent }).success).toBe(false);
    }
  });

  it("carries no tent, source or price a member picked: the parsed shape drops them", () => {
    const parsed = SaveRentalOrderInput.parse({
      tent: {
        choice: "need",
        people: 2,
        sharerIds: [],
        itemId: ID,
        source: "camp",
      },
      lines: [{ ...line, source: "camp", unitPriceCents: 1 }],
      submit: false,
      expectedVersion: 0,
    });
    expect(parsed.tent).toEqual({ choice: "need", people: 2, sharerIds: [] });
    expect(parsed.lines[0]).toEqual(line);
  });

  it("refuses the same item twice, too many, and a choice that is not one", () => {
    expect(save({ lines: [line, line] }).success).toBe(false);
    expect(
      save({ lines: [{ ...line, quantity: RENTAL_MAX_QUANTITY + 1 }] }).success,
    ).toBe(false);
    expect(save({ lines: [{ ...line, choice: "buy" }] }).success).toBe(false);
  });
});

describe("FillRentalOrderInput", () => {
  const line = { itemId: ID, choice: "need", quantity: 1 };
  const fill = (extra: object) =>
    FillRentalOrderInput.safeParse({
      userId: "member-1",
      lines: [],
      expectedVersion: 0,
      ...extra,
    });

  it("takes a member, their tent answer or their lines, and the version the captain saw", () => {
    expect(fill({ lines: [line] }).success).toBe(true);
    expect(
      fill({ tent: { choice: "need", people: 1, sharerIds: [] } }).success,
    ).toBe(true);
  });

  it("refuses no member, nothing at all, and the same item twice", () => {
    expect(fill({ userId: "", lines: [line] }).success).toBe(false);
    expect(fill({}).success).toBe(false);
    expect(fill({ lines: [line, line] }).success).toBe(false);
  });
});

describe("ConfirmRentalOrderInput", () => {
  const confirm = (extra: object) =>
    ConfirmRentalOrderInput.safeParse({
      orderId: ID,
      expectedVersion: 2,
      sources: [],
      ...extra,
    });

  it("takes the captain's tent and one source per line", () => {
    const parsed = confirm({
      tent: { itemId: ID2, source: "camp" },
      sources: [{ lineId: ID2, source: "supplier" }],
    });
    expect(parsed.success && parsed.data.tent).toEqual({
      itemId: ID2,
      source: "camp",
    });
    // No tent to pick for a member who has their own.
    const none = confirm({});
    expect(none.success && none.data.tent).toBeNull();
  });

  it("refuses two sources for a line, a source that is not one, and a tent with no source", () => {
    expect(
      confirm({
        sources: [
          { lineId: ID2, source: "camp" },
          { lineId: ID2, source: "supplier" },
        ],
      }).success,
    ).toBe(false);
    expect(
      confirm({ sources: [{ lineId: ID2, source: "shop" }] }).success,
    ).toBe(false);
    expect(confirm({ tent: { itemId: ID2 } }).success).toBe(false);
    expect(
      confirm({ tent: { itemId: "not-an-id", source: "camp" } }).success,
    ).toBe(false);
  });
});

describe("TentLabelInput", () => {
  it("trims a label and reads a blank one as none", () => {
    expect(TentLabelInput.parse({ lineId: ID, label: " T3 " }).label).toBe(
      "T3",
    );
    expect(TentLabelInput.parse({ lineId: ID, label: "  " }).label).toBeNull();
    expect(
      TentLabelInput.safeParse({ lineId: ID, label: "x".repeat(21) }).success,
    ).toBe(false);
  });
});
