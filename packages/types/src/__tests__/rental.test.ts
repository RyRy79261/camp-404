import { describe, expect, it } from "vitest";
import {
  ConfirmRentalOrderInput,
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
  const line = { itemId: ID, choice: "need", quantity: 1, sharerIds: [] };

  it("takes a member's lines", () => {
    expect(
      SaveRentalOrderInput.safeParse({
        lines: [line, { ...line, itemId: ID2, choice: "own" }],
        submit: true,
        expectedVersion: 0,
      }).success,
    ).toBe(true);
  });

  it("refuses the same item twice, a source or a price from the member, and too many", () => {
    expect(
      SaveRentalOrderInput.safeParse({
        lines: [line, line],
        submit: false,
        expectedVersion: 0,
      }).success,
    ).toBe(false);
    expect(
      SaveRentalOrderInput.safeParse({
        lines: [{ ...line, quantity: RENTAL_MAX_QUANTITY + 1 }],
        submit: false,
        expectedVersion: 0,
      }).success,
    ).toBe(false);
    expect(
      SaveRentalOrderInput.safeParse({
        lines: [{ ...line, choice: "buy" }],
        submit: false,
        expectedVersion: 0,
      }).success,
    ).toBe(false);
    // A member's line carries no source: the parsed shape drops it.
    const parsed = SaveRentalOrderInput.parse({
      lines: [{ ...line, source: "camp", unitPriceCents: 1 }],
      submit: false,
      expectedVersion: 0,
    });
    expect(parsed.lines[0]).toEqual(line);
  });
});

describe("ConfirmRentalOrderInput", () => {
  it("takes one source per line and refuses two for the same line", () => {
    expect(
      ConfirmRentalOrderInput.safeParse({
        orderId: ID,
        expectedVersion: 2,
        sources: [{ lineId: ID2, source: "camp" }],
      }).success,
    ).toBe(true);
    expect(
      ConfirmRentalOrderInput.safeParse({
        orderId: ID,
        expectedVersion: 2,
        sources: [
          { lineId: ID2, source: "camp" },
          { lineId: ID2, source: "supplier" },
        ],
      }).success,
    ).toBe(false);
    expect(
      ConfirmRentalOrderInput.safeParse({
        orderId: ID,
        expectedVersion: 2,
        sources: [{ lineId: ID2, source: "shop" }],
      }).success,
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
