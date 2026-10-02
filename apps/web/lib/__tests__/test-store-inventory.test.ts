import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { CampConfig } from "@camp404/db/camp-config";
import {
  ALREADY_BOOKED,
  FULLY_BOOKED,
  ITEM_BROKEN,
  ITEM_CHANGED,
  LOAN_TOO_MANY,
  NONE_FREE,
  NOT_AN_INVENTORY_EDITOR,
  NOT_YOUR_BOOKING,
  PROPOSAL_DECIDED,
} from "@camp404/db/inventory";
import {
  EditInventoryItemInput,
  InventoryItemInput,
  InventoryNeedInput,
  InventoryProposalInput,
  type Team,
} from "@camp404/types";
import { testStore } from "../test-store";
import { inventoryStore, resetInventoryStore } from "../test-store-inventory";

// The E2E inventory twin. Playwright drives the inventory through it, so it
// keeps the real rules in the same words as packages/db/src/inventory.ts:
// these cases mirror packages/db/src/__tests__/inventory.test.ts.

const COOLER = InventoryItemInput.parse({
  name: "Cooler box",
  team: "kitchen",
  category: "cooling",
  condition: "good",
  quantity: 4,
  location: "storage_unit",
  bookableCount: 2,
});

function makeUser(name: string, rank: "captain" | "member" = "member") {
  return testStore.createUser({
    authUserId: `auth-${name}`,
    displayName: name,
    inviteCode: "seeded",
    rank,
  });
}

function lead(name: string, team: Team) {
  const user = makeUser(name);
  testStore.assignTeam({ userId: user.id, team });
  testStore.setLead({ userId: user.id, team, isLead: true });
  return user;
}

function campYear(year: number, earlier: number[] = []) {
  testStore.setTeamsConfig({
    ...(testStore.getTeamsConfig() as CampConfig),
    cycles: [
      ...earlier.map((y) => ({
        year: y,
        startedAt: `${y}-01-01T00:00:00.000Z`,
        endedAt: `${y}-12-31T00:00:00.000Z`,
      })),
      { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
    ],
  } as CampConfig);
}

describe("test store: inventory", () => {
  beforeEach(() => {
    testStore.reset();
    resetInventoryStore();
    campYear(2026);
  });

  function people() {
    return {
      captain: makeUser("Cap", "captain"),
      kitchenLead: lead("Kit", "kitchen"),
      soundLead: lead("Snd", "sound"),
      member: makeUser("Mem"),
      other: makeUser("Oth"),
    };
  }

  function cooler(actorId: string, item = COOLER) {
    const made = inventoryStore.addInventoryItem({ ...item, actorId });
    if (!made.ok) throw new Error(made.error);
    return made.id;
  }

  it("lets only a captain or the item's own lead change it, compare-and-set", () => {
    const p = people();
    expect(
      inventoryStore.addInventoryItem({ ...COOLER, actorId: p.soundLead.id }),
    ).toEqual({ ok: false, error: NOT_AN_INVENTORY_EDITOR });
    const id = cooler(p.kitchenLead.id);
    const edit = (actorId: string, expectedVersion: number) =>
      inventoryStore.updateInventoryItem({
        ...EditInventoryItemInput.parse({
          ...COOLER,
          quantity: 5,
          itemId: id,
          expectedVersion,
        }),
        actorId,
      });
    expect(edit(p.member.id, 1)).toEqual({
      ok: false,
      error: NOT_AN_INVENTORY_EDITOR,
    });
    expect(edit(p.captain.id, 1)).toEqual({ ok: true, version: 2 });
    expect(edit(p.kitchenLead.id, 1)).toEqual({
      ok: false,
      error: ITEM_CHANGED,
    });
  });

  it("approves a member's proposal once, for the item's own lead", () => {
    const p = people();
    const id = cooler(p.captain.id);
    const made = inventoryStore.proposeInventoryChange({
      ...InventoryProposalInput.parse({
        itemId: id,
        quantity: 3,
        condition: "needs_repair",
        location: "storage_unit",
      }),
      actorId: p.member.id,
    });
    if (!made.ok) throw new Error(made.error);
    const review = (actorId: string) =>
      inventoryStore.reviewInventoryChange({
        updateId: made.id,
        decision: "approved",
        actorId,
      });
    expect(review(p.soundLead.id)).toEqual({
      ok: false,
      error: NOT_AN_INVENTORY_EDITOR,
    });
    expect(review(p.kitchenLead.id)).toEqual({ ok: true });
    expect(review(p.captain.id)).toEqual({
      ok: false,
      error: PROPOSAL_DECIDED,
    });
    expect(inventoryStore.getInventoryItem(id)).toMatchObject({
      quantity: 3,
      condition: "needs_repair",
    });
  });

  it("books up to the limit, and names bookers only to an editor", () => {
    const p = people();
    const id = cooler(p.captain.id);
    const first = inventoryStore.bookInventoryItem({
      itemId: id,
      actorId: p.member.id,
    });
    expect(first.ok).toBe(true);
    expect(
      inventoryStore.bookInventoryItem({ itemId: id, actorId: p.member.id }),
    ).toEqual({ ok: false, error: ALREADY_BOOKED });
    expect(
      inventoryStore.bookInventoryItem({ itemId: id, actorId: p.other.id }).ok,
    ).toBe(true);
    expect(
      inventoryStore.bookInventoryItem({ itemId: id, actorId: p.soundLead.id }),
    ).toEqual({ ok: false, error: FULLY_BOOKED });
    expect(
      inventoryStore
        .listItemBookings(id, p.other.id, false)
        .map((b) => b.displayName),
    ).toEqual([null, "Oth"]);
    if (!first.ok) return;
    expect(
      inventoryStore.cancelInventoryBooking({
        bookingId: first.id,
        actorId: p.soundLead.id,
      }),
    ).toEqual({ ok: false, error: NOT_YOUR_BOOKING });
  });

  it("books none of a broken item, and takes lent-out units off what can be booked", () => {
    const p = people();
    const broken = cooler(
      p.captain.id,
      InventoryItemInput.parse({ ...COOLER, condition: "broken" }),
    );
    expect(
      inventoryStore.bookInventoryItem({
        itemId: broken,
        actorId: p.member.id,
      }),
    ).toEqual({ ok: false, error: ITEM_BROKEN });

    const id = cooler(
      p.captain.id,
      InventoryItemInput.parse({ ...COOLER, bookableCount: 3 }),
    );
    const lent = inventoryStore.lendInventoryItem({
      itemId: id,
      quantity: 3,
      borrowerCamp: "Next Door",
      borrowerAddress: "7:30 and C",
      actorId: p.captain.id,
    });
    expect(lent.ok).toBe(true);
    expect(
      inventoryStore.bookInventoryItem({ itemId: id, actorId: p.member.id }).ok,
    ).toBe(true);
    expect(
      inventoryStore.bookInventoryItem({ itemId: id, actorId: p.other.id }),
    ).toEqual({ ok: false, error: NONE_FREE });
    expect(
      inventoryStore
        .listBookableItems(p.member.id)
        .find((r) => r.itemId === id),
    ).toMatchObject({ quantity: 4, lentOut: 3, booked: 1 });
  });

  it("keeps needs to their year and lends no more than the camp has", () => {
    const p = people();
    const id = cooler(p.captain.id);
    inventoryStore.addInventoryNeed({
      ...InventoryNeedInput.parse({
        team: "kitchen",
        name: "Chairs",
        quantity: 3,
      }),
      actorId: p.kitchenLead.id,
    });
    expect(inventoryStore.listInventoryNeeds()).toHaveLength(1);
    expect(
      inventoryStore.lendInventoryItem({
        itemId: id,
        quantity: 5,
        borrowerCamp: "Next Door",
        borrowerAddress: "7:30 and C",
        actorId: p.kitchenLead.id,
      }),
    ).toEqual({ ok: false, error: LOAN_TOO_MANY });
    campYear(2027, [2026]);
    expect(inventoryStore.listInventoryNeeds()).toEqual([]);
  });
});
