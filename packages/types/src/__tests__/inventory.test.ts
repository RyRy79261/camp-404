import { describe, expect, it } from "vitest";
import {
  InventoryItemInput,
  InventoryLoanInput,
  InventoryProposalInput,
} from "../inventory";

// Inventory (#246): what the forms may send.

const ITEM = {
  name: "Cooler box",
  team: "kitchen",
  category: "cooling",
  condition: "good",
  quantity: 4,
  location: "storage_unit",
};

describe("InventoryItemInput", () => {
  it("accepts an item and treats blank text as no answer", () => {
    const item = InventoryItemInput.parse({ ...ITEM, unit: "  ", details: "" });
    expect(item.unit).toBeUndefined();
    expect(item.details).toBeUndefined();
    expect(item.requiresMaintenance).toBe(false);
  });

  it("asks whose home it is at, and drops a custodian anywhere else", () => {
    const missing = InventoryItemInput.safeParse({
      ...ITEM,
      location: "custodian_home",
    });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]?.message).toBe("Say whose home it is at.");
    const elsewhere = InventoryItemInput.parse({
      ...ITEM,
      custodianUserId: "11111111-1111-1111-1111-111111111111",
    });
    expect(elsewhere.custodianUserId).toBeNull();
  });

  it("asks how often when maintenance is needed", () => {
    const r = InventoryItemInput.safeParse({
      ...ITEM,
      requiresMaintenance: true,
    });
    expect(r.error?.issues[0]?.message).toBe(
      "Say how often it needs maintenance.",
    );
  });

  it("refuses a negative count, a team that isn't one and a booking limit of 0", () => {
    expect(
      InventoryItemInput.safeParse({ ...ITEM, quantity: -1 }).success,
    ).toBe(false);
    expect(
      InventoryItemInput.safeParse({ ...ITEM, team: "storage" }).success,
    ).toBe(false);
    expect(
      InventoryItemInput.safeParse({ ...ITEM, bookableCount: 0 }).success,
    ).toBe(false);
  });
});

describe("InventoryProposalInput", () => {
  it("asks whose home it is at", () => {
    const r = InventoryProposalInput.safeParse({
      itemId: "11111111-1111-1111-1111-111111111111",
      quantity: 2,
      condition: "good",
      location: "custodian_home",
    });
    expect(r.success).toBe(false);
  });
});

describe("InventoryLoanInput", () => {
  it("keeps only the camp's name and address, dropping anything else sent", () => {
    const loan = InventoryLoanInput.parse({
      itemId: "11111111-1111-1111-1111-111111111111",
      quantity: 1,
      borrowerCamp: "Camp Next Door",
      borrowerAddress: "7:30 and C",
      borrowerName: "Sam",
      phone: "0820000000",
    });
    expect(Object.keys(loan).sort()).toEqual(
      ["borrowerAddress", "borrowerCamp", "itemId", "quantity"].sort(),
    );
  });

  it("needs the camp and its address", () => {
    const r = InventoryLoanInput.safeParse({
      itemId: "11111111-1111-1111-1111-111111111111",
      quantity: 1,
      borrowerCamp: "",
      borrowerAddress: "",
    });
    expect(r.success).toBe(false);
  });
});
